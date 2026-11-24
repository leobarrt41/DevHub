"""A API nunca confia em filtros visuais para autorização."""

import secrets
from collections.abc import AsyncIterator

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

bearer = HTTPBearer(auto_error=False)


async def owner(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> str:
    expected = request.app.state.settings.devhub_access_token.get_secret_value()
    if not expected:
        raise HTTPException(503, "Credencial de acesso não configurada no backend.")
    if credentials is None or not secrets.compare_digest(credentials.credentials, expected):
        raise HTTPException(
            401, "Credencial inválida ou ausente.", headers={"WWW-Authenticate": "Bearer"}
        )
    return request.app.state.settings.devhub_owner_id


async def database(request: Request) -> AsyncIterator[AsyncSession]:
    async with request.app.state.sessions() as session:
        try:
            yield session
        except BaseException:
            await session.rollback()
            raise
