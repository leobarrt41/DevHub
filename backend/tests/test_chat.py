from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

import httpx
from sqlalchemy import select

from devhub.main import create_app
from devhub.models import Message, Task, now
from devhub.orchestrator import ChatRun

from .conftest import make_app, make_conversation


async def send(client, conversation_id, content="Olá", request_id=None):
    return await client.post(
        f"/api/v1/conversations/{conversation_id}/messages/stream",
        json={"content": content, "model": "test/model", "request_id": request_id or str(uuid4())},
    )


async def test_stream_persisted_history_task_costs_and_events(env, parse_events):
    client, _, provider = env
    conversation = await make_conversation(client)
    response = await send(client, conversation["conversation_id"])
    assert response.status_code == 200
    events = parse_events(response)
    assert [name for name, data in events] == ["task", "context", "delta", "delta", "done"], (
        response.text
    )
    task_id = events[0][1]["task_id"]
    done = events[-1][1]
    assert done["usage"]["cost_usd"] == "0.0012"
    messages = (
        await client.get(f"/api/v1/conversations/{conversation['conversation_id']}/messages")
    ).json()
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[1]["content"] == "Resposta confirmada." and messages[1]["status"] == "completed"
    detail = (await client.get(f"/api/v1/tasks/{task_id}")).json()
    assert detail["task"]["generation_id"] == "gen-test"
    assert [e["sequence"] for e in detail["events"]] == [1, 2, 3, 4]
    assert [e["kind"] for e in detail["events"]] == [
        "task.created",
        "context.retrieved",
        "model.started",
        "model.completed",
    ]
    assert "test-access-only" not in str(detail) and "test-provider-key" not in str(detail)
    metrics = (await client.get("/api/v1/observability")).json()
    assert metrics["completed_tasks"] == 1 and metrics["unaccounted_tasks"] == 0
    assert len(provider.calls) == 1


async def test_approved_memory_shared_between_conversations_not_projects(env, parse_events):
    client, _, provider = env
    a, b = await make_app(client, "A"), await make_app(client, "B")
    source = await make_conversation(client, a["app_id"], title="Fonte")
    await send(client, source["conversation_id"], "Adotar PostgreSQL em A")
    source_message = (
        await client.get(f"/api/v1/conversations/{source['conversation_id']}/messages")
    ).json()[0]
    decision = (
        await client.post(
            "/api/v1/memory",
            json={
                "app_id": a["app_id"],
                "content": "Decisão A: PostgreSQL gerenciado, código marcador-only-A",
                "source_message_id": source_message["message_id"],
            },
        )
    ).json()
    other = await make_conversation(client, a["app_id"], title="Continuidade")
    response = await send(client, other["conversation_id"], "Quais decisões PostgreSQL aprovamos?")
    context = next(data for event, data in parse_events(response) if event == "context")
    assert context["sources"][0]["memory_item_id"] == decision["memory_item_id"]
    assert "marcador-only-A" in str(provider.calls[-1])
    assert (
        len((await client.get(f"/api/v1/conversations/{other['conversation_id']}/messages")).json())
        == 2
    )
    for target in (await make_conversation(client, b["app_id"]), await make_conversation(client)):
        await send(client, target["conversation_id"], "Quais decisões PostgreSQL aprovamos?")
        assert "marcador-only-A" not in str(provider.calls[-1])
    response = await client.post(
        "/api/v1/memory",
        json={
            "app_id": b["app_id"],
            "content": "Leak",
            "source_message_id": source_message["message_id"],
        },
    )
    assert response.status_code == 422


async def test_idempotency_no_second_provider_call(env, parse_events):
    client, _, provider = env
    conv = await make_conversation(client)
    request_id = str(uuid4())
    first = await send(client, conv["conversation_id"], request_id=request_id)
    task_id = parse_events(first)[0][1]["task_id"]
    second = await send(client, conv["conversation_id"], request_id=request_id)
    assert second.status_code == 409 and second.json()["detail"]["task_id"] == task_id
    assert len(provider.calls) == 1
    assert (
        len((await client.get(f"/api/v1/conversations/{conv['conversation_id']}/messages")).json())
        == 2
    )


async def test_failure_retains_partial_response_and_unknown_cost(env, parse_events):
    client, _, provider = env
    provider.fail = "provider_stream_error"
    conv = await make_conversation(client)
    response = await send(client, conv["conversation_id"])
    events = parse_events(response)
    assert events[-1][0] == "error" and "done" not in [event for event, _ in events]
    task = (await client.get(f"/api/v1/tasks/{events[0][1]['task_id']}")).json()["task"]
    assert task["status"] == "failed" and task["cost_usd"] is None and task["input_tokens"] is None
    history = (await client.get(f"/api/v1/conversations/{conv['conversation_id']}/messages")).json()
    assert history[-1]["content"] == "Resposta " and history[-1]["status"] == "failed"
    assert (
        await client.post(
            "/api/v1/memory",
            json={"content": "Not confirmed", "source_message_id": history[-1]["message_id"]},
        )
    ).status_code == 409


async def test_missing_usage_not_fabricated(env, parse_events):
    client, _, provider = env
    provider.usage = {}
    conv = await make_conversation(client)
    events = parse_events(await send(client, conv["conversation_id"]))
    assert events[-1][1]["usage"] == {
        "prompt_tokens": None,
        "completion_tokens": None,
        "cost_usd": None,
        "cost_status": "unavailable",
    }
    assert (await client.get("/api/v1/observability")).json()["unaccounted_tasks"] == 1


async def test_budget_blocks_before_provider_call(env):
    client, app, provider = env
    provider.prices = {"prompt": "1", "completion": "1"}
    conv = await make_conversation(client)
    assert (await send(client, conv["conversation_id"])).status_code == 402
    assert provider.calls == []
    provider.prices = {"prompt": "0.000000001", "completion": "0"}
    app.state.settings.devhub_daily_budget_usd = Decimal("0")
    assert (await send(client, conv["conversation_id"])).status_code == 402
    assert (await client.get("/api/v1/tasks")).json() == []


async def test_restart_recovers_existing_conversation_from_postgres(env):
    client, app, provider = env
    conv = await make_conversation(client)
    await send(client, conv["conversation_id"], "Contexto durável de primeira instância")
    # Outra instância, engine/pool distintos, sem copiar memória do processo.
    second = create_app(app.state.settings, provider)
    async with second.router.lifespan_context(second):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=second),
            base_url="http://restart",
            headers=client.headers,
        ) as restarted:
            assert (
                len(
                    (
                        await restarted.get(
                            f"/api/v1/conversations/{conv['conversation_id']}/messages"
                        )
                    ).json()
                )
                == 2
            )
            assert (await restarted.get("/api/v1/tree")).json()["conversations"][0][
                "conversation_id"
            ] == conv["conversation_id"]


async def test_stale_task_reconciliation_never_reexecutes(env):
    client, app, provider = env
    conv = await make_conversation(client)
    async with app.state.sessions() as db:
        task = Task(
            owner_id="personal-owner",
            request_id=str(uuid4()),
            conversation_id=conv["conversation_id"],
            model_id="test/model",
            updated_at=now() - timedelta(hours=1),
        )
        db.add(task)
        await db.flush()
        db.add(
            Message(
                owner_id="personal-owner",
                conversation_id=conv["conversation_id"],
                task_id=task.task_id,
                role="assistant",
                content="Checkpoint preservado",
                status="streaming",
            )
        )
        await db.commit()
        task_id = task.task_id
    response = await client.post(f"/api/v1/tasks/{task_id}/reconcile")
    assert response.status_code == 200 and response.json()["status"] == "interrupted"
    assert provider.calls == []
    assert (await client.post(f"/api/v1/tasks/{task_id}/reconcile")).json()[
        "status"
    ] == "interrupted"
    assert (await client.get(f"/api/v1/conversations/{conv['conversation_id']}/messages")).json()[
        0
    ]["content"] == "Checkpoint preservado"


async def test_no_model_or_unconfigured_provider_not_silently_simulated(env):
    client, app, provider = env
    conv = await make_conversation(client)
    response = await client.post(
        f"/api/v1/conversations/{conv['conversation_id']}/messages/stream",
        json={"content": "Hello", "model": "invented", "request_id": str(uuid4())},
    )
    assert response.status_code == 422
    app.state.settings.openrouter_api_key = ""
    assert (await send(client, conv["conversation_id"])).status_code == 503
    assert provider.calls == []


async def test_cancelled_generator_checkpoints_partial_result(env):
    client, app, provider = env
    conv = await make_conversation(client)
    async with app.state.sessions() as db:
        task = Task(
            owner_id="personal-owner",
            request_id=str(uuid4()),
            conversation_id=conv["conversation_id"],
            model_id="test/model",
        )
        db.add(task)
        await db.flush()
        user = Message(
            owner_id="personal-owner",
            conversation_id=conv["conversation_id"],
            task_id=task.task_id,
            role="user",
            content="Cancel",
        )
        assistant = Message(
            owner_id="personal-owner",
            conversation_id=conv["conversation_id"],
            task_id=task.task_id,
            role="assistant",
            status="streaming",
            content="",
        )
        db.add_all([user, assistant])
        await db.commit()
    run = ChatRun(app, task, assistant.message_id, "Cancel")
    generator = run.events()
    async for event in generator:
        if "event: delta" in event:
            await generator.aclose()
            break
    async with app.state.sessions() as db:
        persisted = await db.scalar(select(Task).where(Task.task_id == task.task_id))
        message = await db.scalar(select(Message).where(Message.message_id == assistant.message_id))
        assert persisted.status == "cancelled"
        assert message.content.startswith("Resposta")


async def test_active_task_blocks_conversation_mutation(env):
    client, app, _ = env
    conv = await make_conversation(client)
    async with app.state.sessions() as db:
        task = Task(
            owner_id="personal-owner",
            request_id=str(uuid4()),
            conversation_id=conv["conversation_id"],
            model_id="test/model",
        )
        db.add(task)
        await db.commit()
    assert (
        await client.patch(
            f"/api/v1/conversations/{conv['conversation_id']}", json={"title": "Concurrent"}
        )
    ).status_code == 409
    assert (await client.post(f"/api/v1/tasks/{task.task_id}/reconcile")).status_code == 409
