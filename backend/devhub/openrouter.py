"""Transporte de inferência exclusivamente OpenRouter; sem fallback para outro serviço."""

import json
import time
from collections.abc import AsyncIterator
from decimal import Decimal, InvalidOperation

import httpx

from .config import Settings


class ProviderError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


async def sse_data(lines: AsyncIterator[str]) -> AsyncIterator[str]:
    """SSE spec: comentários ignorados, data multilinha, evento só após blank line."""
    data: list[str] = []
    async for line in lines:
        if not line:
            if data:
                yield "\n".join(data)
                data = []
        elif line.startswith("data:"):
            data.append(line[5:].lstrip(" "))
    if data:
        yield "\n".join(data)


def valid_cost(value) -> Decimal | None:
    try:
        result = Decimal(str(value))
        return result if result.is_finite() and result >= 0 else None
    except (InvalidOperation, ValueError, TypeError):
        return None


class OpenRouter:
    BASE = "https://openrouter.ai/api/v1"

    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.settings = settings
        self.client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(65, connect=10), follow_redirects=False
        )
        self._models: list[dict] = []
        self._catalog_time = 0.0

    async def close(self):
        await self.client.aclose()

    def headers(self) -> dict[str, str]:
        return {
            "Authorization": "Bearer " + self.settings.openrouter_api_key.get_secret_value(),
            "X-Title": "DevHub AI",
            "Content-Type": "application/json",
        }

    async def models(self) -> list[dict]:
        if self._models and time.monotonic() - self._catalog_time < 60:
            return self._models
        try:
            response = await self.client.get(self.BASE + "/models", headers=self.headers())
            response.raise_for_status()
            models = response.json()["data"]
            if not isinstance(models, list):
                raise ValueError("models")
            self._models = [
                model
                for model in models
                if "text" in model.get("architecture", {}).get("output_modalities", ["text"])
            ]
            self._catalog_time = time.monotonic()
            return self._models
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise ProviderError(
                "catalog_unavailable",
                "Catálogo OpenRouter indisponível. Não usaremos uma lista simulada.",
            ) from exc

    async def model(self, identity: str) -> dict:
        model = next((model for model in await self.models() if model.get("id") == identity), None)
        if model is None:
            raise ProviderError(
                "unknown_model", "Modelo não disponível no catálogo atual OpenRouter."
            )
        return model

    async def stream(self, model: str, messages: list[dict]) -> AsyncIterator[dict]:
        if not self.settings.openrouter_api_key.get_secret_value():
            raise ProviderError("not_configured", "Chave OpenRouter não configurada no backend.")
        request = {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": self.settings.devhub_max_output_tokens,
        }
        finished = False
        terminal = False
        try:
            async with self.client.stream(
                "POST", self.BASE + "/chat/completions", headers=self.headers(), json=request
            ) as response:
                if response.status_code != 200:
                    # Não persistir corpo/headers upstream: podem conter dados privados.
                    raise ProviderError(
                        "provider_http_error",
                        f"OpenRouter recusou a chamada (HTTP {response.status_code}).",
                    )
                header_id = response.headers.get("X-Generation-Id")
                if header_id:
                    yield {"type": "metadata", "generation_id": header_id}
                async for data in sse_data(response.aiter_lines()):
                    if data == "[DONE]":
                        terminal = True
                        break
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError as exc:
                        raise ProviderError(
                            "invalid_stream", "Evento de streaming inválido do provedor."
                        ) from exc
                    if chunk.get("error"):
                        raise ProviderError(
                            "provider_stream_error", "OpenRouter informou erro durante a geração."
                        )
                    if chunk.get("id") or chunk.get("provider"):
                        yield {
                            "type": "metadata",
                            "generation_id": chunk.get("id"),
                            "provider": chunk.get("provider"),
                        }
                    for choice in chunk.get("choices", []):
                        if choice.get("finish_reason") == "error":
                            raise ProviderError(
                                "provider_stream_error", "OpenRouter encerrou a geração com erro."
                            )
                        if choice.get("finish_reason") is not None:
                            finished = True
                        content = choice.get("delta", {}).get("content")
                        if isinstance(content, str) and content:
                            yield {"type": "delta", "content": content}
                    usage = chunk.get("usage")
                    if isinstance(usage, dict):
                        yield {"type": "usage", "usage": usage}
        except httpx.HTTPError as exc:
            raise ProviderError(
                "provider_connection_error",
                "Conexão OpenRouter interrompida; resultado parcial preservado quando recebido.",
            ) from exc
        if not (finished and terminal):
            raise ProviderError(
                "incomplete_stream",
                "Stream terminou sem confirmação final; não considerado concluído.",
            )


def reserve_cost(model: dict, max_input_bytes: int, max_output_tokens: int) -> Decimal:
    prices = model.get("pricing", {})
    prompt, completion = valid_cost(prices.get("prompt")), valid_cost(prices.get("completion"))
    if prompt is None or completion is None:
        raise ProviderError(
            "price_unavailable",
            "Preço não informado pelo catálogo; chamada bloqueada por segurança de orçamento.",
        )
    # Recursos pagos adicionais não usados são rejeitados, para evitar subestimar orçamento.
    request_price = valid_cost(prices.get("request", "0"))
    if request_price is None:
        raise ProviderError("price_unavailable", "Preço por requisição indisponível.")
    return (
        prompt * Decimal(max_input_bytes + 2048)
        + completion * Decimal(max_output_tokens)
        + request_price
    )
