from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ApplicationCreate(Input):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=120)


class ApplicationPatch(Input):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    archived: bool | None = None


class FolderCreate(Input):
    name: str = Field(min_length=1, max_length=120)
    app_id: UUID | None = None
    parent_folder_id: UUID | None = None


class FolderPatch(Input):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_folder_id: UUID | None = None
    archived: bool | None = None


class ConversationCreate(Input):
    title: str = Field(default="Nova conversa", min_length=1, max_length=200)
    app_id: UUID | None = None
    folder_id: UUID | None = None


class MovePreview(Input):
    app_id: UUID | None = None
    folder_id: UUID | None = None


class ConversationPatch(Input):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    archived: bool | None = None
    app_id: UUID | None = None
    folder_id: UUID | None = None
    move_token: str | None = Field(default=None, max_length=24000)
    approved_memory_ids: list[UUID] = Field(default_factory=list, max_length=100)


class ChatInput(Input):
    content: str = Field(min_length=1, max_length=16000)
    model: str = Field(min_length=1, max_length=200)
    request_id: UUID


class MemoryCreate(Input):
    app_id: UUID | None = None
    content: str = Field(min_length=1, max_length=6000)
    category: Literal["decision", "technical", "preference"] = "decision"
    source_message_id: UUID | None = None
