#!/bin/sh
set -eu
: "${DATABASE_URL:?Configure DATABASE_URL PostgreSQL externo ao container}"
: "${DEVHUB_ACCESS_TOKEN:?Configure DEVHUB_ACCESS_TOKEN no Secret Manager}"
: "${OPENROUTER_API_KEY:?Configure OPENROUTER_API_KEY no Secret Manager}"
exec uvicorn devhub.main:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1 --no-access-log
