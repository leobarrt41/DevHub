"""Árvore lógica compartilhada por Vue e VS Code; nunca diretórios Git."""

import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .dependencies import database, owner
from .models import Application, Conversation, Folder, MemoryItem, Task, uid
from .schemas import (
    ApplicationCreate,
    ApplicationPatch,
    ConversationCreate,
    ConversationPatch,
    FolderCreate,
    FolderPatch,
    MovePreview,
)
from .storage import (
    audit,
    decode_move,
    destination,
    encode_move,
    move_candidates,
    owned,
    public,
    sid,
    slugify,
)

router = APIRouter(prefix="/api/v1", tags=["organização"])


@router.get("/tree")
async def tree(
    archived: bool = False, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    result = {}
    for key, model in (
        ("applications", Application),
        ("folders", Folder),
        ("conversations", Conversation),
    ):
        query = select(model).where(model.owner_id == who)
        if not archived:
            query = query.where(model.archived.is_(False))
        records = await db.scalars(query.order_by(model.created_at))
        result[key] = [public(record) for record in records]
    return result


@router.post("/applications", status_code=201)
async def create_app(
    body: ApplicationCreate, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    slug = body.slug or f"{slugify(body.name)}-{uid()[:6]}"
    app = Application(owner_id=who, name=body.name, slug=slug)
    db.add(app)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise HTTPException(409, "Slug já existe.") from exc
    await audit(db, who, app.app_id, "application.created", payload={"app_id": app.app_id})
    await db.commit()
    return public(app)


@router.patch("/applications/{app_id}")
async def patch_app(
    app_id: UUID,
    body: ApplicationPatch,
    who: str = Depends(owner),
    db: AsyncSession = Depends(database),
):
    app = await owned(db, Application, app_id, who, lock=True)
    if body.name is not None:
        app.name = body.name
    if body.archived is not None:
        # Ordem de locks comum: app -> conversas -> pastas.
        conversations = list(
            await db.scalars(
                select(Conversation)
                .where(Conversation.app_id == str(app_id), Conversation.owner_id == who)
                .order_by(Conversation.conversation_id)
                .with_for_update()
            )
        )
        active = await db.scalar(
            select(Task.task_id)
            .where(Task.app_id == str(app_id), Task.owner_id == who, Task.status == "running")
            .limit(1)
        )
        if active:
            raise HTTPException(409, "Há uma resposta em andamento neste projeto.")
        app.archived = body.archived
        if body.archived:
            folders = await db.scalars(
                select(Folder).where(Folder.app_id == str(app_id), Folder.owner_id == who)
            )
            for record in [*folders, *conversations]:
                record.archived = True
                if isinstance(record, Conversation):
                    record.version += 1
    await audit(db, who, str(app_id), "application.updated", payload={"archived": app.archived})
    await db.commit()
    return public(app)


@router.post("/folders", status_code=201)
async def create_folder(
    body: FolderCreate, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    app_id, parent = sid(body.app_id), sid(body.parent_folder_id)
    await destination(db, who, app_id, parent)
    folder = Folder(owner_id=who, app_id=app_id, parent_folder_id=parent, name=body.name)
    db.add(folder)
    await db.flush()
    await audit(db, who, app_id, "folder.created", payload={"folder_id": folder.folder_id})
    await db.commit()
    return public(folder)


@router.patch("/folders/{folder_id}")
async def patch_folder(
    folder_id: UUID,
    body: FolderPatch,
    who: str = Depends(owner),
    db: AsyncSession = Depends(database),
):
    # Serializa modificações da árvore de um proprietário entre instâncias.
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:scope))"), {"scope": "folder-tree:" + who}
    )
    await db.execute(
        select(Application)
        .where(Application.owner_id == who)
        .order_by(Application.app_id)
        .with_for_update()
    )
    folder = await owned(db, Folder, folder_id, who, lock=True)
    if body.name is not None:
        folder.name = body.name
    if "parent_folder_id" in body.model_fields_set:
        parent = sid(body.parent_folder_id)
        await destination(db, who, folder.app_id, parent)
        visited = {folder.folder_id}
        cursor = parent
        while cursor:
            if cursor in visited:
                raise HTTPException(422, "Movimentação criaria um ciclo na árvore.")
            visited.add(cursor)
            cursor = (await owned(db, Folder, cursor, who)).parent_folder_id
        folder.parent_folder_id = parent
    if body.archived is not None:
        folder.archived = body.archived
        if body.archived:
            all_folders = list(
                await db.scalars(
                    select(Folder).where(Folder.owner_id == who, Folder.app_id == folder.app_id)
                )
            )
            descendants = {folder.folder_id}
            while True:
                added = {
                    item.folder_id for item in all_folders if item.parent_folder_id in descendants
                } - descendants
                if not added:
                    break
                descendants |= added
            conversations = list(
                await db.scalars(
                    select(Conversation)
                    .where(Conversation.owner_id == who, Conversation.folder_id.in_(descendants))
                    .order_by(Conversation.conversation_id)
                    .with_for_update()
                )
            )
            if conversations and await db.scalar(
                select(Task.task_id)
                .where(
                    Task.conversation_id.in_([c.conversation_id for c in conversations]),
                    Task.status == "running",
                )
                .limit(1)
            ):
                raise HTTPException(409, "Há uma resposta em andamento nesta pasta.")
            for item in all_folders:
                if item.folder_id in descendants:
                    item.archived = True
            for conversation in conversations:
                conversation.archived = True
                conversation.version += 1
        else:
            await destination(db, who, folder.app_id, folder.parent_folder_id)
    await audit(
        db,
        who,
        folder.app_id,
        "folder.updated",
        payload={"folder_id": folder.folder_id, "archived": folder.archived},
    )
    await db.commit()
    return public(folder)


@router.post("/conversations", status_code=201)
async def create_conversation(
    body: ConversationCreate, who: str = Depends(owner), db: AsyncSession = Depends(database)
):
    app_id, folder_id = sid(body.app_id), sid(body.folder_id)
    await destination(db, who, app_id, folder_id)
    conversation = Conversation(owner_id=who, title=body.title, app_id=app_id, folder_id=folder_id)
    db.add(conversation)
    await db.flush()
    await audit(
        db,
        who,
        app_id,
        "conversation.created",
        payload={"conversation_id": conversation.conversation_id},
    )
    await db.commit()
    return public(conversation)


@router.post("/conversations/{conversation_id}/move-preview")
async def preview_move(
    conversation_id: UUID,
    body: MovePreview,
    request: Request,
    who: str = Depends(owner),
    db: AsyncSession = Depends(database),
):
    conversation = await owned(db, Conversation, conversation_id, who)
    app_id, folder_id = sid(body.app_id), sid(body.folder_id)
    await destination(db, who, app_id, folder_id)
    candidates = await move_candidates(db, conversation)
    payload = {
        "owner_id": who,
        "conversation_id": str(conversation_id),
        "version": conversation.version,
        "from_app_id": conversation.app_id,
        "app_id": app_id,
        "folder_id": folder_id,
        "candidate_ids": [m.memory_item_id for m in candidates],
        "expires_at": time.time() + 300,
    }
    return {
        "move_token": encode_move(
            payload, request.app.state.settings.devhub_access_token.get_secret_value()
        ),
        "from_app_id": conversation.app_id,
        "to_app_id": app_id,
        "candidates": [public(m) for m in candidates],
        "warning": "O histórico completo acompanha a conversa. Só as memórias selecionadas serão copiadas ao destino; memórias de origem permanecem no escopo original. Revise conteúdo privado antes de confirmar.",
    }


@router.patch("/conversations/{conversation_id}")
async def patch_conversation(
    conversation_id: UUID,
    body: ConversationPatch,
    request: Request,
    who: str = Depends(owner),
    db: AsyncSession = Depends(database),
):
    conversation = await owned(db, Conversation, conversation_id, who, lock=True)
    active = await db.scalar(
        select(Task.task_id)
        .where(Task.conversation_id == str(conversation_id), Task.status == "running")
        .limit(1)
    )
    if active:
        raise HTTPException(409, "Aguarde a resposta em andamento antes de alterar a conversa.")
    app_id = sid(body.app_id) if "app_id" in body.model_fields_set else conversation.app_id
    folder_id = (
        sid(body.folder_id) if "folder_id" in body.model_fields_set else conversation.folder_id
    )
    if (
        app_id != conversation.app_id
        or folder_id != conversation.folder_id
        or body.archived is False
    ):
        await destination(db, who, app_id, folder_id)
    if app_id != conversation.app_id:
        if not body.move_token:
            raise HTTPException(409, "Movimentar entre projetos exige prévia e confirmação.")
        payload = decode_move(
            body.move_token, request.app.state.settings.devhub_access_token.get_secret_value()
        )
        if any(
            payload.get(key) != value
            for key, value in {
                "owner_id": who,
                "conversation_id": str(conversation_id),
                "version": conversation.version,
                "from_app_id": conversation.app_id,
                "app_id": app_id,
                "folder_id": folder_id,
            }.items()
        ):
            raise HTTPException(409, "O estado/destino mudou após a prévia; revise novamente.")
        selected = {str(identity) for identity in body.approved_memory_ids}
        candidates = {item.memory_item_id: item for item in await move_candidates(db, conversation)}
        if not selected.issubset(set(payload["candidate_ids"]) & set(candidates)):
            raise HTTPException(422, "Memória selecionada não pertence à prévia.")
        for identity in selected:
            source = candidates[identity]
            db.add(
                MemoryItem(
                    owner_id=who,
                    app_id=app_id,
                    conversation_id=conversation.conversation_id,
                    source_message_id=source.source_message_id,
                    source_memory_id=identity,
                    content=source.content,
                    category=source.category,
                    source_label=f"Transferência aprovada da memória {identity}",
                )
            )
    elif body.approved_memory_ids:
        raise HTTPException(422, "Incorporação de memória exige mudança confirmada de projeto.")
    conversation.app_id, conversation.folder_id = app_id, folder_id
    if body.title is not None:
        conversation.title = body.title
    if body.archived is not None:
        conversation.archived = body.archived
    conversation.version += 1
    await audit(
        db,
        who,
        app_id,
        "conversation.updated",
        payload={
            "conversation_id": str(conversation_id),
            "archived": conversation.archived,
            "version": conversation.version,
        },
    )
    await db.commit()
    return public(conversation)
