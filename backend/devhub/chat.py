"""Chat central e telemetria mínima; sem respostas simuladas no runtime."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .dependencies import database, owner
from .models import Conversation, Event, Message, Task, now
from .openrouter import ProviderError, reserve_cost
from .orchestrator import ChatRun
from .schemas import ChatInput
from .storage import audit, destination, owned, public, scoped

router = APIRouter(prefix="/api/v1", tags=["chat e observabilidade"])


@router.get("/session")
async def session_info(request: Request, who: str = Depends(owner)):
    settings = request.app.state.settings
    return {
        "owner_id": who,
        "name": settings.devhub_owner_name,
        "default_model": settings.devhub_default_model,
        "openrouter_configured": bool(settings.openrouter_api_key.get_secret_value()),
        "max_output_tokens": settings.devhub_max_output_tokens,
        "stale_task_seconds": settings.devhub_stale_task_seconds,
    }


@router.get("/models")
async def models(request: Request, who: str = Depends(owner)):
    try:
        models = await request.app.state.provider.models()
    except ProviderError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"models": models, "default_model": request.app.state.settings.devhub_default_model}


@router.get("/conversations/{conversation_id}/messages")
async def messages(
    conversation_id: UUID, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    await owned(db, Conversation, conversation_id, who)
    records = await db.scalars(
        select(Message)
        .where(Message.conversation_id == str(conversation_id), Message.owner_id == who)
        .order_by(Message.created_at, Message.message_id)
    )
    return [public(record) for record in records]


@router.post("/conversations/{conversation_id}/messages/stream")
async def send_message(
    conversation_id: UUID,
    body: ChatInput,
    request: Request,
    who: str = Depends(owner),
    db: AsyncSession = Depends(database),
):
    settings = request.app.state.settings
    if not settings.openrouter_api_key.get_secret_value():
        raise HTTPException(503, "Chave OpenRouter não configurada no backend.")
    if len(body.content) > settings.devhub_context_chars // 2:
        raise HTTPException(422, "Mensagem excede a janela de contexto configurada.")
    # Budget lock across all replicas, not an in-memory semaphore.
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:owner))"), {"owner": who})
    conversation = await owned(db, Conversation, conversation_id, who, lock=True)
    await destination(db, who, conversation.app_id, conversation.folder_id)
    if conversation.archived:
        raise HTTPException(409, "Conversa arquivada.")
    existing = await db.scalar(
        select(Task).where(Task.owner_id == who, Task.request_id == str(body.request_id))
    )
    if existing:
        raise HTTPException(
            409,
            {
                "message": "request_id já persistido; não repetiremos inferência.",
                "task_id": existing.task_id,
                "status": existing.status,
            },
        )
    active = await db.scalar(
        select(Task.task_id)
        .where(
            Task.owner_id == who,
            Task.conversation_id == str(conversation_id),
            Task.status == "running",
        )
        .limit(1)
    )
    if active:
        raise HTTPException(
            409, {"message": "Conversa possui resposta em andamento.", "task_id": active}
        )
    try:
        model = await request.app.state.provider.model(body.model)
        reserve = reserve_cost(
            model, settings.devhub_context_chars * 4 + 8192, settings.devhub_max_output_tokens
        )
    except ProviderError as exc:
        raise HTTPException(422 if exc.code == "unknown_model" else 503, str(exc)) from exc
    if reserve > settings.devhub_max_request_cost_usd:
        raise HTTPException(
            402,
            "Reserva conservadora excede o teto de custo por chamada. Selecione outro modelo ou ajuste a política no backend.",
        )
    day_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    booked = await db.scalar(
        select(
            func.coalesce(func.sum(func.coalesce(Task.cost_usd, Task.reserved_cost_usd)), 0)
        ).where(Task.owner_id == who, Task.created_at >= day_start)
    )
    if (booked or Decimal(0)) + reserve > settings.devhub_daily_budget_usd:
        raise HTTPException(402, "Orçamento diário reservado/contabilizado esgotado.")
    task = Task(
        owner_id=who,
        request_id=str(body.request_id),
        app_id=conversation.app_id,
        conversation_id=str(conversation_id),
        model_id=body.model,
        reserved_cost_usd=reserve,
    )
    db.add(task)
    await db.flush()
    user_message = Message(
        owner_id=who,
        conversation_id=str(conversation_id),
        task_id=task.task_id,
        role="user",
        content=body.content,
    )
    assistant = Message(
        owner_id=who,
        conversation_id=str(conversation_id),
        task_id=task.task_id,
        role="assistant",
        content="",
        status="streaming",
    )
    db.add_all([user_message, assistant])
    await db.flush()
    # A ordem user/assistant é durável e independente da ordenação aleatória de UUIDs.
    assistant.created_at = user_message.created_at + timedelta(microseconds=1)
    conversation.updated_at = now()
    await audit(
        db,
        who,
        conversation.app_id,
        "task.created",
        task_id=task.task_id,
        status="persisted",
        payload={
            "conversation_id": str(conversation_id),
            "model_id": body.model,
            "reserved_cost_usd": str(reserve),
            "trace_id": task.trace_id,
        },
    )
    await db.commit()
    run = ChatRun(request.app, task, assistant.message_id, body.content)
    return StreamingResponse(
        run.events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.get("/tasks")
async def tasks(
    app_id: str | None = None, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    query = (await scoped(db, Task, who, app_id)).order_by(Task.created_at.desc()).limit(100)
    return [public(task) for task in await db.scalars(query)]


@router.get("/tasks/{task_id}")
async def task_detail(
    task_id: UUID, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    task = await owned(db, Task, task_id, who)
    events = await db.scalars(
        select(Event)
        .where(Event.owner_id == who, Event.task_id == str(task_id))
        .order_by(Event.sequence)
    )
    return {"task": public(task), "events": [public(event) for event in events]}


@router.post("/tasks/{task_id}/reconcile")
async def reconcile(
    task_id: UUID, request: Request, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    task = await owned(db, Task, task_id, who, lock=True)
    if task.status != "running":
        return public(task)
    if (
        now() - task.updated_at
    ).total_seconds() < request.app.state.settings.devhub_stale_task_seconds:
        raise HTTPException(
            409,
            "Tarefa ainda pode estar ativa; reconciliação bloqueada até o limite de inatividade.",
        )
    task.status, task.error_code = "interrupted", "reconciled_after_interruption"
    for message in await db.scalars(
        select(Message).where(
            Message.task_id == str(task_id), Message.owner_id == who, Message.role == "assistant"
        )
    ):
        message.status = "interrupted"
    await audit(
        db,
        who,
        task.app_id,
        "task.reconciled",
        task_id=str(task_id),
        status="interrupted",
        payload={"generation_id": task.generation_id, "reexecuted": False},
    )
    await db.commit()
    return public(task)


@router.get("/observability")
async def observability(
    app_id: str | None = None, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    query = await scoped(db, Task, who, app_id)
    sub = query.subquery()
    summary = (
        await db.execute(
            select(
                func.count(),
                func.count().filter(sub.c.status == "completed"),
                func.count().filter(sub.c.status.in_(["failed", "cancelled", "interrupted"])),
                func.count().filter(sub.c.status == "running"),
                func.coalesce(func.sum(sub.c.cost_usd), 0),
                func.count().filter(sub.c.cost_usd.is_(None)),
            ).select_from(sub)
        )
    ).one()
    recent = await db.scalars(query.order_by(Task.created_at.desc()).limit(50))
    return {
        "total_tasks": summary[0],
        "completed_tasks": summary[1],
        "failed_tasks": summary[2],
        "active_tasks": summary[3],
        "confirmed_cost_usd": str(summary[4]),
        "unaccounted_tasks": summary[5],
        "tasks": [public(task) for task in recent],
    }
