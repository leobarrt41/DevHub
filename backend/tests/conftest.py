"""Doubles de rede somente em testes; persistência usa PostgreSQL real dedicado."""

import os
from decimal import Decimal

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from devhub.config import Settings
from devhub.main import create_app
from devhub.models import Base
from devhub.openrouter import ProviderError

TEST_URL = os.getenv(
    "DEVHUB_TEST_DATABASE_URL",
    "postgresql+asyncpg://devhub:devhub_local_only@127.0.0.1:5432/devhub_test",
)
if "test" not in TEST_URL.rsplit("/", 1)[-1]:
    raise RuntimeError("Banco de testes deve ter 'test' no nome; nunca usar produção.")


class TestProvider:
    """Não importado pelo aplicativo, não é modo demo nem fallback de runtime."""

    def __init__(self):
        self.calls = []
        self.fail = None
        self.usage = {"prompt_tokens": 23, "completion_tokens": 12, "cost": "0.0012"}
        self.prices = {"prompt": "0", "completion": "0"}

    async def close(self):
        pass

    async def models(self):
        return [
            {
                "id": "test/model",
                "name": "Contrato de testes",
                "pricing": self.prices,
                "context_length": 32000,
            }
        ]

    async def model(self, model):
        if model != "test/model":
            raise ProviderError("unknown_model", "Modelo não encontrado.")
        return (await self.models())[0]

    async def stream(self, model, messages):
        self.calls.append(messages)
        yield {"type": "metadata", "generation_id": "gen-test", "provider": "test"}
        yield {"type": "delta", "content": "Resposta "}
        if self.fail:
            raise ProviderError(self.fail, "Falha contratual controlada.")
        yield {"type": "delta", "content": "confirmada."}
        yield {"type": "usage", "usage": self.usage}


@pytest_asyncio.fixture
async def env():
    engine = create_async_engine(TEST_URL, poolclass=NullPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    await engine.dispose()
    provider = TestProvider()
    settings = Settings(
        database_url=TEST_URL,
        devhub_access_token="test-access-only",
        openrouter_api_key="test-provider-key",
        devhub_default_model="test/model",
        devhub_daily_budget_usd=Decimal("1"),
    )
    app = create_app(settings, provider)
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer test-access-only"},
        ) as client:
            yield client, app, provider


@pytest.fixture
def parse_events():
    import json

    def parse(response):
        events = []
        for frame in response.text.split("\n\n"):
            event, data = None, []
            for line in frame.splitlines():
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    data.append(line[5:].strip())
            if event and data:
                events.append((event, json.loads("\n".join(data))))
        return events

    return parse


async def make_app(client, name="Aplicação"):
    response = await client.post("/api/v1/applications", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


async def make_conversation(client, app_id=None, folder_id=None, title="Conversa"):
    response = await client.post(
        "/api/v1/conversations", json={"app_id": app_id, "folder_id": folder_id, "title": title}
    )
    assert response.status_code == 201, response.text
    return response.json()
