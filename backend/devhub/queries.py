"""Pesquisa autenticada e filtrável; índice vetorial é fase posterior."""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import false, select
from sqlalchemy.ext.asyncio import AsyncSession

from .dependencies import database, owner
from .models import Application, Conversation, Folder, MemoryItem, Message
from .storage import owned, public, scoped

router = APIRouter(prefix="/api/v1", tags=["pesquisa"])


@router.get("/search")
async def search(
    q: str,
    app_id: str | None = None,
    folder_id: UUID | None = None,
    conversation_id: UUID | None = None,
    category: Literal["decision", "technical", "preference"] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    archived: bool = False,
    who: str = Depends(owner),
    db: AsyncSession = Depends(database),
):
    if not 1 <= len(q.strip()) <= 200:
        raise HTTPException(422, "Pesquisa deve conter 1 a 200 caracteres.")
    if date_from:
        date_from = date_from.replace(tzinfo=UTC) if date_from.tzinfo is None else date_from
    if date_to:
        date_to = date_to.replace(tzinfo=UTC) if date_to.tzinfo is None else date_to
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "Intervalo de datas invertido.")
    pattern = "%" + q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    apps = select(Application).where(
        Application.owner_id == who, Application.name.ilike(pattern, escape="\\")
    )
    folders = (await scoped(db, Folder, who, app_id)).where(Folder.name.ilike(pattern, escape="\\"))
    conversations = await scoped(db, Conversation, who, app_id)
    matched_messages = select(Message.conversation_id).where(
        Message.owner_id == who, Message.content.ilike(pattern, escape="\\")
    )
    conversations = conversations.where(
        Conversation.title.ilike(pattern, escape="\\")
        | Conversation.conversation_id.in_(matched_messages)
    )
    memory = (await scoped(db, MemoryItem, who, app_id)).where(
        MemoryItem.content.ilike(pattern, escape="\\")
    )
    if app_id == "general":
        apps = apps.where(false())
    elif app_id:
        apps = apps.where(Application.app_id == app_id)
    if not archived:
        apps = apps.where(Application.archived.is_(False))
        folders = folders.where(Folder.archived.is_(False))
        conversations = conversations.where(Conversation.archived.is_(False))
        memory = memory.where(
            MemoryItem.conversation_id.is_(None)
            | MemoryItem.conversation_id.in_(
                select(Conversation.conversation_id).where(
                    Conversation.owner_id == who, Conversation.archived.is_(False)
                )
            )
        )
        memory = memory.where(
            MemoryItem.app_id.is_(None)
            | MemoryItem.app_id.in_(
                select(Application.app_id).where(
                    Application.owner_id == who, Application.archived.is_(False)
                )
            )
        )
    if folder_id:
        folder = await owned(db, Folder, folder_id, who)
        if app_id and (
            (app_id == "general" and folder.app_id is not None)
            or (app_id != "general" and folder.app_id != app_id)
        ):
            raise HTTPException(422, "Filtro de pasta incompatível com o projeto.")
        folders = folders.where(Folder.folder_id == str(folder_id))
        apps = apps.where(Application.app_id == folder.app_id)
        conversations = conversations.where(Conversation.folder_id == str(folder_id))
        memory = memory.where(
            MemoryItem.conversation_id.in_(
                select(Conversation.conversation_id).where(
                    Conversation.owner_id == who, Conversation.folder_id == str(folder_id)
                )
            )
        )
    if conversation_id:
        conversation = await owned(db, Conversation, conversation_id, who)
        if app_id and (
            (app_id == "general" and conversation.app_id is not None)
            or (app_id != "general" and conversation.app_id != app_id)
        ):
            raise HTTPException(422, "Filtro de conversa incompatível com o projeto.")
        if folder_id and conversation.folder_id != str(folder_id):
            raise HTTPException(422, "Filtro de conversa incompatível com a pasta.")
        conversations = conversations.where(Conversation.conversation_id == str(conversation_id))
        memory = memory.where(MemoryItem.conversation_id == str(conversation_id))
        apps = apps.where(Application.app_id == conversation.app_id)
        folders = folders.where(Folder.folder_id == conversation.folder_id)
    if category:
        memory = memory.where(MemoryItem.category == category)
        apps, folders, conversations = (
            apps.where(false()),
            folders.where(false()),
            conversations.where(false()),
        )
    result = {}
    for key, model, statement in (
        ("applications", Application, apps),
        ("folders", Folder, folders),
        ("conversations", Conversation, conversations),
        ("memory_items", MemoryItem, memory),
    ):
        if date_from:
            statement = statement.where(model.created_at >= date_from)
        if date_to:
            statement = statement.where(model.created_at <= date_to)
        result[key] = [
            public(item)
            for item in await db.scalars(statement.order_by(model.created_at.desc()).limit(100))
        ]
    return result
