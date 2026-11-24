"""Entrypoint ASGI. PORT é fornecido pelo comando de inicialização do container."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from . import chat, memory, organization, queries
from .config import Settings
from .openrouter import OpenRouter


def create_app(settings: Settings | None = None, provider=None) -> FastAPI:
    settings = settings or Settings()
    engine = create_async_engine(
        settings.database_url.get_secret_value(), pool_size=5, max_overflow=5, pool_pre_ping=True
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    provider = provider or OpenRouter(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Migrations são release explícito, não corrida entre réplicas Cloud Run.
        yield
        await engine.dispose()
        await provider.close()

    app = FastAPI(
        title="DevHub AI",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.sessions = sessions
    app.state.provider = provider
    app.include_router(organization.router)
    app.include_router(memory.router)
    app.include_router(chat.router)
    app.include_router(queries.router)

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/v1"):
            response.headers["Cache-Control"] = "no-store"
        # Preview embedded needs cross-site framing; do not emit frame-deny headers.
        return response

    @app.get("/health/live", include_in_schema=False)
    async def live():
        return {"status": "alive"}

    @app.get("/health/ready", include_in_schema=False)
    async def ready():
        try:
            async with engine.connect() as connection:
                await connection.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
        except Exception:
            return JSONResponse(
                status_code=503,
                content={"status": "not_ready", "database": "unavailable_or_unmigrated"},
            )
        if not settings.devhub_access_token.get_secret_value():
            return JSONResponse(
                status_code=503, content={"status": "not_ready", "access": "not_configured"}
            )
        return {
            "status": "ready",
            "database": "postgresql",
            "openrouter": "configured"
            if settings.openrouter_api_key.get_secret_value()
            else "not_configured",
        }

    @app.get("/manus-routes.json", include_in_schema=False)
    async def routes_manifest():
        return {"routes": [{"path": "/", "title": "DevHub AI"}]}

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str):
        if path.startswith(("api/", "health/")):
            raise HTTPException(404, "Endpoint não encontrado.")
        root = settings.frontend_dist.resolve()
        file = (root / path).resolve()
        if not file.is_relative_to(root):
            raise HTTPException(404)
        if file.is_file():
            return FileResponse(file)
        if path and "." in path.rsplit("/", 1)[-1]:
            raise HTTPException(404, "Asset não encontrado.")
        index = root / "index.html"
        if not index.is_file():
            return JSONResponse(
                status_code=503,
                content={"detail": "Frontend ainda não compilado. Execute pnpm build."},
            )
        return FileResponse(index, headers={"Cache-Control": "no-store"})

    return app


app = create_app()
