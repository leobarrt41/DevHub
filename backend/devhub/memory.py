"""Memória aprovada. Recuperação lexical no MVP 1; embeddings só no MVP 1.5."""

import re
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .dependencies import database, owner
from .models import Conversation, MemoryItem, Message
from .schemas import MemoryCreate
from .storage import audit, destination, owned, public, scoped, sid

router = APIRouter(prefix="/api/v1", tags=["memória"])


def words(text: str) -> set[str]:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    stop = {
        "para",
        "como",
        "sobre",
        "quais",
        "qual",
        "este",
        "esta",
        "isso",
        "sera",
        "voce",
        "pode",
        "projeto",
        "decisao",
        "decisoes",
        "aprovadas",
        "memoria",
    }
    return {word for word in re.findall(r"[a-z0-9_]+", plain) if len(word) > 2 and word not in stop}


async def retrieve(
    db: AsyncSession, who: str, app_id: str | None, query: str, limit: int = 8
) -> list[MemoryItem]:
    # Nenhuma consulta de contexto tem fallback global de aplicativos.
    candidates = list(
        await db.scalars(
            select(MemoryItem)
            .where(
                MemoryItem.owner_id == who,
                MemoryItem.app_id == app_id,
                MemoryItem.confirmation == "approved",
            )
            .order_by(MemoryItem.created_at.desc())
            .limit(200)
        )
    )
    terms = words(query)
    scores = [(len(terms & words(item.content)), item) for item in candidates]
    explicit_recall = any(
        word in query.lower()
        for word in ("decis", "memória", "memoria", "o que aprov", "o que escolhem", "o que defin")
    )
    ranked = sorted(scores, key=lambda entry: entry[0], reverse=True)
    return [item for score, item in ranked if score > 0 or explicit_recall][:limit]


@router.get("/memory")
async def list_memory(
    app_id: str | None = None,
    q: str = "",
    who: str = Depends(owner),
    db: AsyncSession = Depends(database),
):
    if len(q) > 200:
        raise HTTPException(422, "Pesquisa muito longa.")
    query = await scoped(db, MemoryItem, who, app_id)
    if q.strip():
        query = query.where(MemoryItem.content.icontains(q.strip(), autoescape=True))
    return [
        public(item)
        for item in await db.scalars(query.order_by(MemoryItem.created_at.desc()).limit(200))
    ]


@router.post("/memory", status_code=201)
async def create_memory(
    body: MemoryCreate, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    app_id = sid(body.app_id)
    await destination(db, who, app_id, None)
    conversation_id = None
    source_id = sid(body.source_message_id)
    label = "Declaração explicitamente aprovada pelo usuário"
    if source_id:
        message = await owned(db, Message, source_id, who)
        conversation = await owned(db, Conversation, message.conversation_id, who)
        if conversation.app_id != app_id:
            raise HTTPException(422, "A mensagem-fonte pertence a outro projeto.")
        if message.status != "completed":
            raise HTTPException(409, "Uma resposta parcial não pode comprovar decisão concluída.")
        conversation_id = conversation.conversation_id
        label = f"Conversa {conversation_id}, mensagem {source_id} — aprovação humana, não prova de implementação"
    item = MemoryItem(
        owner_id=who,
        app_id=app_id,
        conversation_id=conversation_id,
        source_message_id=source_id,
        content=body.content,
        category=body.category,
        source_label=label,
    )
    db.add(item)
    await db.flush()
    await audit(
        db,
        who,
        app_id,
        "memory.approved",
        payload={
            "memory_item_id": item.memory_item_id,
            "source_message_id": source_id,
            "category": body.category,
        },
    )
    await db.commit()
    return public(item)


@router.delete("/memory/{memory_item_id}", status_code=204)
async def delete_memory(
    memory_item_id: UUID, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    item = await owned(db, MemoryItem, memory_item_id, who)
    await audit(
        db, who, item.app_id, "memory.deleted", payload={"memory_item_id": str(memory_item_id)}
    )
    await db.delete(item)
    await db.commit()
