"""Registro primário em PostgreSQL, independente de processos/containers."""

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now() -> datetime:
    return datetime.now(UTC)


def uid() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class Owned:
    owner_id: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Application(Owned, Base):
    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("owner_id", "slug"),)
    app_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Folder(Owned, Base):
    __tablename__ = "folders"
    folder_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    app_id: Mapped[str | None] = mapped_column(ForeignKey("applications.app_id"), index=True)
    parent_folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("folders.folder_id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Conversation(Owned, Base):
    __tablename__ = "conversations"
    conversation_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    app_id: Mapped[str | None] = mapped_column(ForeignKey("applications.app_id"), index=True)
    folder_id: Mapped[str | None] = mapped_column(ForeignKey("folders.folder_id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)


class Task(Owned, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("owner_id", "request_id"),
        Index("ix_tasks_app_created", "app_id", "created_at"),
    )
    task_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    request_id: Mapped[str] = mapped_column(String(36))
    app_id: Mapped[str | None] = mapped_column(ForeignKey("applications.app_id"), index=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.conversation_id"), index=True
    )
    status: Mapped[str] = mapped_column(String(30), default="running")
    model_id: Mapped[str] = mapped_column(String(200))
    trace_id: Mapped[str] = mapped_column(String(36), default=uid)
    generation_id: Mapped[str | None] = mapped_column(String(200))
    provider: Mapped[str | None] = mapped_column(String(200))
    agent_role: Mapped[str] = mapped_column(String(30), default="coordinator")
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 10))
    cost_status: Mapped[str] = mapped_column(String(30), default="unavailable")
    reserved_cost_usd: Mapped[Decimal] = mapped_column(Numeric(18, 10), default=Decimal(0))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(50))


class Message(Owned, Base):
    __tablename__ = "messages"
    message_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.conversation_id"), index=True
    )
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.task_id"), index=True)
    role: Mapped[str] = mapped_column(String(15))
    content: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="completed")
    context_sources: Mapped[list] = mapped_column(JSON, default=list)


class MemoryItem(Owned, Base):
    __tablename__ = "memory_items"
    memory_item_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    app_id: Mapped[str | None] = mapped_column(ForeignKey("applications.app_id"), index=True)
    conversation_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversations.conversation_id"), index=True
    )
    source_message_id: Mapped[str | None] = mapped_column(ForeignKey("messages.message_id"))
    source_memory_id: Mapped[str | None] = mapped_column(String(36))
    content: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(30))
    confirmation: Mapped[str] = mapped_column(String(30), default="approved")
    source_label: Mapped[str] = mapped_column(String(250))


class Event(Owned, Base):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("task_id", "sequence"),)
    event_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    app_id: Mapped[str | None] = mapped_column(ForeignKey("applications.app_id"), index=True)
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.task_id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(70))
    status: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
