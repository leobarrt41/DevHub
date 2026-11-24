import json
from decimal import Decimal

import httpx
import pytest
from pydantic import ValidationError

from devhub.config import Settings
from devhub.openrouter import OpenRouter, ProviderError, reserve_cost, sse_data, valid_cost
from devhub.storage import decode_move, encode_move


async def iterator(lines):
    for line in lines:
        yield line


async def test_sse_comments_multiline_and_final_buffer():
    lines = [": keepalive", 'data: {"hello":', 'data: "world"}', "", "data: [DONE]"]
    assert [item async for item in sse_data(iterator(lines))] == ['{"hello":\n"world"}', "[DONE]"]


def stream_text(chunks, done=True):
    text = ": OPENROUTER PROCESSING\n\n" + "".join(
        "data: " + json.dumps(chunk) + "\n\n" for chunk in chunks
    )
    return text + ("data: [DONE]\n\n" if done else "")


async def test_real_client_contract_usage_frame_and_no_deprecated_options():
    captured = []
    chunks = [
        {
            "id": "gen-1",
            "provider": "provider-1",
            "choices": [{"delta": {"content": "Olá"}, "finish_reason": None}],
        },
        {"id": "gen-1", "choices": [{"delta": {"content": ""}, "finish_reason": "stop"}]},
        {
            "id": "gen-1",
            "choices": [{"delta": {"content": ""}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 1, "cost": 0},
        },
    ]

    def handler(request):
        captured.append(json.loads(request.content))
        assert request.url.host == "openrouter.ai"
        return httpx.Response(200, text=stream_text(chunks), headers={"X-Generation-Id": "gen-1"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OpenRouter(Settings(openrouter_api_key="test-key"), client)
    events = [
        event async for event in provider.stream("test/model", [{"role": "user", "content": "Olá"}])
    ]
    assert [event["content"] for event in events if event["type"] == "delta"] == ["Olá"]
    assert len([event for event in events if event["type"] == "usage"]) == 1
    assert "usage" not in captured[0] and "stream_options" not in captured[0]
    await provider.close()


@pytest.mark.parametrize(
    "chunks,done,code",
    [
        ([{"error": {"message": "private detail"}}], True, "provider_stream_error"),
        (
            [{"choices": [{"delta": {"content": "partial"}, "finish_reason": None}]}],
            False,
            "incomplete_stream",
        ),
        ([{"choices": [{"delta": {}, "finish_reason": "stop"}]}], False, "incomplete_stream"),
    ],
)
async def test_midstream_errors_and_unconfirmed_eof(chunks, done, code):
    provider = OpenRouter(
        Settings(openrouter_api_key="test-key"),
        httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, text=stream_text(chunks, done))
            )
        ),
    )
    with pytest.raises(ProviderError) as exc:
        _ = [item async for item in provider.stream("test/model", [])]
    assert exc.value.code == code and "private detail" not in str(exc.value)
    await provider.close()


async def test_non_200_does_not_return_sensitive_provider_body():
    provider = OpenRouter(
        Settings(openrouter_api_key="test-key"),
        httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(401, text="sensitive private upstream")
            )
        ),
    )
    with pytest.raises(ProviderError) as exc:
        _ = [item async for item in provider.stream("model", [])]
    assert "sensitive" not in str(exc.value) and "401" in str(exc.value)
    await provider.close()


async def test_catalog_unavailable_has_no_fake_fallback():
    provider = OpenRouter(
        Settings(),
        httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(503))),
    )
    with pytest.raises(ProviderError, match="simulada"):
        await provider.models()
    await provider.close()


@pytest.mark.parametrize("value", [None, "NaN", "Infinity", -1, "bad"])
def test_absent_invalid_cost_stays_unknown(value):
    assert valid_cost(value) is None


def test_cost_zero_is_confirmed_and_budget_conservative():
    assert valid_cost("0") == Decimal("0")
    assert reserve_cost(
        {"pricing": {"prompt": "0.000001", "completion": "0.000002"}}, 1000, 100
    ) == Decimal("0.003248")
    with pytest.raises(ProviderError):
        reserve_cost({"pricing": {}}, 100, 10)


def test_settings_reject_non_postgres_and_secrets_are_redacted():
    with pytest.raises(ValidationError):
        Settings(database_url="sqlite:///devhub.db")
    settings = Settings(devhub_access_token="sensitive-do-not-print")
    assert "sensitive-do-not-print" not in repr(settings)
    settings.devhub_access_token = ""
    assert settings.devhub_access_token.get_secret_value() == ""


def test_expired_move_preview_fails_closed():
    token = encode_move({"expires_at": 0}, "test-signing")
    with pytest.raises(Exception, match="expirada"):
        decode_move(token, "test-signing")
