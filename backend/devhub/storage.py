"""Operações de escopo e consistência usadas por todas as rotas."""

import base64
import hashlib
import hmac
import json
import re
import time
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Application, Conversation, Event, Folder, MemoryItem, Task


def sid(value: UUID | str | None) -> str | None:
    return str(value) if value is not None else None


def public(record) -> dict:
    # IDs de proprietário e idempotência são internos, não credenciais de acesso.
    return {
        column.name: (
            str(getattr(record, column.name))
            if isinstance(getattr(record, column.name), Decimal)
            else getattr(record, column.name)
        )
        for column in record.__table__.columns
        if column.name not in {"owner_id", "request_id"}
    }


async def owned(session: AsyncSession, model, identity: str | UUID, owner_id: str, *, lock=False):
    key = list(model.__table__.primary_key.columns)[0]
    statement = select(model).where(key == str(identity), model.owner_id == owner_id)
    if lock:
        statement = statement.with_for_update()
    result = (await session.execute(statement)).scalar_one_or_none()
    if result is None:
        raise HTTPException(404, "Registro não encontrado.")
    return result


async def destination(
    session: AsyncSession, owner_id: str, app_id: str | None, folder_id: str | None
) -> None:
    if app_id is not None:
        app = await owned(session, Application, app_id, owner_id)
        if app.archived:
            raise HTTPException(409, "Projeto arquivado. Reabra antes de adicionar conteúdo.")
    if folder_id is not None:
        folder = await owned(session, Folder, folder_id, owner_id)
        if folder.app_id != app_id:
            raise HTTPException(422, "A pasta pertence a outro projeto.")
        if folder.archived:
            raise HTTPException(409, "Pasta arquivada.")


async def scoped(session: AsyncSession, model, owner_id: str, app_filter: str | None = None):
    query = select(model).where(model.owner_id == owner_id)
    if app_filter is not None:
        if app_filter == "general":
            query = query.where(model.app_id.is_(None))
        else:
            try:
                UUID(app_filter)
            except ValueError as exc:
                raise HTTPException(422, "app_id inválido.") from exc
            await owned(session, Application, app_filter, owner_id)
            query = query.where(model.app_id == app_filter)
    return query


async def audit(
    session: AsyncSession,
    owner_id: str,
    app_id: str | None,
    kind: str,
    *,
    task_id: str | None = None,
    status: str = "confirmed",
    payload: dict | None = None,
) -> None:
    sequence = 1
    if task_id is not None:
        await owned(session, Task, task_id, owner_id, lock=True)
        sequence = (
            await session.scalar(
                select(func.coalesce(func.max(Event.sequence), 0)).where(Event.task_id == task_id)
            )
            or 0
        ) + 1
    session.add(
        Event(
            owner_id=owner_id,
            app_id=app_id,
            task_id=task_id,
            sequence=sequence,
            kind=kind,
            status=status,
            payload=payload or {},
        )
    )


def slugify(name: str) -> str:
    import unicodedata

    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-") or "projeto"


def encode_move(payload: dict, secret: str) -> str:
    encoded = (
        base64.urlsafe_b64encode(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
        )
        .decode()
        .rstrip("=")
    )
    signature = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
    return encoded + "." + signature


def decode_move(token: str, secret: str) -> dict:
    try:
        encoded, signature = token.rsplit(".", 1)
        expected = hmac.new(secret.encode(), encoded.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError("signature")
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))
        if payload["expires_at"] < time.time():
            raise ValueError("expired")
        return payload
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(
            409, "Prévia inválida ou expirada; revise o destino novamente."
        ) from exc


async def move_candidates(session: AsyncSession, conversation: Conversation) -> list[MemoryItem]:
    result = await session.scalars(
        select(MemoryItem)
        .where(
            MemoryItem.owner_id == conversation.owner_id,
            MemoryItem.conversation_id == conversation.conversation_id,
            MemoryItem.app_id == conversation.app_id,
        )
        .order_by(MemoryItem.created_at)
        .limit(100)
    )
    return list(result)
