# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS web
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json frontend/package.json
COPY extension/package.json extension/package.json
RUN pnpm install --frozen-lockfile
COPY frontend/ frontend/
RUN pnpm --dir frontend build

FROM ghcr.io/astral-sh/uv:0.13.7 AS uv
FROM python:3.12-slim-bookworm AS runtime
COPY --from=uv /uv /uvx /usr/local/bin/
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    PATH="/app/backend/.venv/bin:$PATH" \
    FRONTEND_DIST=/app/frontend/dist LANGSMITH_TRACING=false PORT=8080
COPY backend/pyproject.toml backend/uv.lock backend/
COPY backend/devhub/ backend/devhub/
RUN uv sync --project backend --frozen --no-dev --no-editable \
    && groupadd --gid 10001 devhub \
    && useradd --uid 10001 --gid 10001 --no-create-home devhub
COPY backend/alembic.ini backend/alembic.ini
COPY backend/migrations/ backend/migrations/
COPY --from=web /build/frontend/dist/ frontend/dist/
COPY scripts/container-entrypoint.sh /app/scripts/container-entrypoint.sh
RUN chmod 0555 /app/scripts/container-entrypoint.sh
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.getenv('PORT','8080')+'/health/live')" || exit 1
ENTRYPOINT ["/app/scripts/container-entrypoint.sh"]
