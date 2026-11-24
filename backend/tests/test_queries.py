import asyncio
from datetime import timedelta

from devhub.models import now

from .conftest import make_app, make_conversation


async def test_search_finds_applications_folders_and_category_date_filters(env):
    client, _, _ = env
    app = await make_app(client, "Marcador PostgreSQL")
    folder = (
        await client.post(
            "/api/v1/folders", json={"name": "Marcador documentação", "app_id": app["app_id"]}
        )
    ).json()
    conv = await make_conversation(
        client, app["app_id"], folder["folder_id"], title="Marcador conversa"
    )
    await client.post(
        "/api/v1/memory",
        json={"app_id": app["app_id"], "content": "Marcador decisão", "category": "decision"},
    )
    await client.post(
        "/api/v1/memory",
        json={"app_id": app["app_id"], "content": "Marcador técnico", "category": "technical"},
    )
    result = (await client.get("/api/v1/search?q=Marcador")).json()
    assert len(result["applications"]) == 1 and len(result["folders"]) == 1
    assert len(result["conversations"]) == 1 and len(result["memory_items"]) == 2
    filtered = (
        await client.get(f"/api/v1/search?q=Marcador&app_id={app['app_id']}&category=decision")
    ).json()
    assert filtered["applications"] == [] and len(filtered["memory_items"]) == 1
    future = (
        await client.get(
            "/api/v1/search",
            params={"q": "Marcador", "date_from": (now() + timedelta(days=1)).isoformat()},
        )
    ).json()
    assert all(records == [] for records in future.values())
    assert (
        await client.get(
            "/api/v1/search",
            params={
                "q": "Marcador",
                "date_from": "2030-01-01T00:00:00Z",
                "date_to": "2020-01-01T00:00:00Z",
            },
        )
    ).status_code == 422
    wrong = await make_app(client, "Outro")
    assert (
        await client.get(
            f"/api/v1/search?q=Marcador&app_id={wrong['app_id']}&folder_id={folder['folder_id']}"
        )
    ).status_code == 422
    assert (
        await client.get(
            f"/api/v1/search?q=Marcador&app_id=general&conversation_id={conv['conversation_id']}"
        )
    ).status_code == 422


async def test_archived_search_and_restore_conversation(env):
    client, _, _ = env
    conv = await make_conversation(client, title="Arquivada-alvo")
    await client.patch(f"/api/v1/conversations/{conv['conversation_id']}", json={"archived": True})
    assert (await client.get("/api/v1/search?q=Arquivada-alvo")).json()["conversations"] == []
    assert (
        len(
            (await client.get("/api/v1/search?q=Arquivada-alvo&archived=true")).json()[
                "conversations"
            ]
        )
        == 1
    )
    restored = await client.patch(
        f"/api/v1/conversations/{conv['conversation_id']}", json={"archived": False}
    )
    assert restored.status_code == 200 and restored.json()["archived"] is False


async def test_reparent_of_general_folders_is_serialized_and_acyclic(env):
    client, _, _ = env
    a = (await client.post("/api/v1/folders", json={"name": "A geral"})).json()
    b = (await client.post("/api/v1/folders", json={"name": "B geral"})).json()
    results = await asyncio.gather(
        client.patch(
            f"/api/v1/folders/{a['folder_id']}", json={"parent_folder_id": b["folder_id"]}
        ),
        client.patch(
            f"/api/v1/folders/{b['folder_id']}", json={"parent_folder_id": a["folder_id"]}
        ),
    )
    assert sorted(response.status_code for response in results) == [200, 422]


async def test_duplicate_stream_concurrency_reaches_provider_only_once(env):
    client, _, provider = env
    from uuid import uuid4

    conv = await make_conversation(client)
    request = {"content": "Teste concorrência", "model": "test/model", "request_id": str(uuid4())}
    results = await asyncio.gather(
        client.post(
            f"/api/v1/conversations/{conv['conversation_id']}/messages/stream", json=request
        ),
        client.post(
            f"/api/v1/conversations/{conv['conversation_id']}/messages/stream", json=request
        ),
    )
    assert sorted(response.status_code for response in results) == [200, 409]
    assert len(provider.calls) == 1
