# DevHub

O DevHub AI centraliza conversas técnicas e contexto aprovado por projeto.

## MVP 1 — Chat web e extensão VS Code

Chat web Vue 3 e extensão VS Code compartilham **um backend FastAPI/LangGraph**, inferência **somente OpenRouter**, identidade pessoal revogável e estado em **PostgreSQL**. Esta entrega implementa conversação, organização e memória aprovada; não executa código de repositórios nem cria PR pelo próprio DevHub. `DEVHUB_AI.md` é o documento mestre; o registro desta implementação não altera as decisões arquiteturais existentes.

## Instalação e execução

Requisitos: Python 3.12, Node 22.12+, pnpm 11.25.0, uv 0.13.7 e PostgreSQL 16. Docker/Compose é opcional para banco local/container; não é dependência do servidor Cloud Run.

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
uv sync --project backend --frozen --group dev
```

Configure as variáveis de `.env.example` no ambiente de processo/gerenciador de segredos. Não envie nem versione `.env` real. `DATABASE_URL` aponta para PostgreSQL externo ao contêiner; `DEVHUB_ACCESS_TOKEN` e `OPENROUTER_API_KEY` são fornecidos somente ao backend. No Manus os dois secrets já são injetados pelo formulário protegido; o PostgreSQL instalado no sandbox usa o banco de desenvolvimento `devhub` e o de testes `devhub_test`, sem infraestrutura externa contratada.

Para um novo ambiente local com Docker disponível, inicie apenas PostgreSQL:

```bash
docker compose up -d db
# API/SQL usam o DSN de desenvolvimento de .env.example.
```

Ou use seu PostgreSQL existente. Crie bancos separados `devhub` e `devhub_test`, com usuário de desenvolvimento. A senha `devhub_local_only` do exemplo é somente fixture local, nunca senha de produção. A API normaliza `postgresql://`/`postgres://` para asyncpg e rejeita bancos não PostgreSQL.

Aplique migrations explicitamente antes de iniciar a API; nunca em cada startup de réplica:

```bash
backend/.venv/bin/alembic -c backend/alembic.ini upgrade head
backend/.venv/bin/alembic -c backend/alembic.ini check
backend/.venv/bin/uvicorn devhub.main:app --host 0.0.0.0 --port 8000 --no-access-log
# Em outro terminal:
pnpm dev
```

Localmente o Vite usa porta 3000 e encaminha `/api` para 8000. No Manus os processos são gerenciados pelo runtime/Preview, não é preciso iniciar cópias em terminais. Abra **Preview**, informe a credencial pessoal no formulário da aplicação, crie projeto/pasta/conversa e use o chat. Não há auto-login de usuário fictício nem resposta demo. Se credenciais/catálogo/provedor falharem, o erro real fica visível.

Para servir o mesmo bundle pelo FastAPI sem Vite:

```bash
pnpm --dir frontend build
# FastAPI serve frontend/dist em /; API permanece em /api/v1.
```

## Extensão VS Code

```bash
pnpm --dir extension compile
```

Abra a pasta `extension/` no VS Code e pressione F5 para iniciar Extension Development Host. Configure `devhub.backendUrl` como origem do mesmo servidor (HTTP apenas loopback, HTTPS para remoto). Execute **DevHub: Conectar**, informe o mesmo token e abra a conversa existente na árvore. A extensão inclui busca do backend por projeto/conversa geral, renomeação, reparent, arquivados/restauração e observabilidade. A credencial fica no SecretStorage vinculado à origem, não na configuração/webview; trocar backend exige conexão explícita. Um `.vsix` local é entregue para instalação manual; consulte `extension/README.md`. A UI do VS Code instalado no computador do usuário não foi operada neste sandbox; testes de API/cliente/compilação não substituem essa validação manual.

## Testes

A suíte de backend exige banco dedicado com `test` no nome e destrói/recria suas tabelas. Não aponte `DEVHUB_TEST_DATABASE_URL` a produção ou banco compartilhado.

```bash
# Se usou Compose: crie o banco dedicado uma vez.
docker compose exec db psql -U devhub -d devhub -c 'CREATE DATABASE devhub_test OWNER devhub;'

backend/.venv/bin/pytest backend/tests -q
backend/.venv/bin/ruff check backend
uvx --from pyright==1.1.407 pyright --pythonpath backend/.venv/bin/python --project pyrightconfig.json
pnpm typecheck
pnpm test
pnpm build
python scripts/check_codebase_map.py
```

Testes de rede determinísticos usam doubles/MockTransport **somente dentro de `backend/tests`**, sem modo mock no produto. PostgreSQL, FastAPI, LangGraph, transações e APIs de organização são reais. Passaram 37 testes backend e 8 web; os testes da extensão e resultados de empacotamento constam em `docs/VALIDATION.md`. Para validação externa opt-in, com servidor iniciado e secrets em ambiente, `backend/.venv/bin/python scripts/live_smoke.py` usa apenas `openrouter/free` se o catálogo confirmar preços zero; gera relatório local em `artifacts/` com IDs, não credenciais. `node scripts/client_continuity.cjs` compara os adaptadores reais dos dois clientes com os IDs do smoke desta entrega, sem nova inferência. Consulte `docs/VALIDATION.md` para resultados e limites efetivamente observados.

## Implantação e segurança

`Dockerfile` é multistage, não root, serve frontend+API em uma origem e honra `PORT`. PostgreSQL gerenciado é externo; migrations são release separado. O container não inclui PostgreSQL, Docker socket, executores de código, clones ou arquivos duráveis. O executor remoto do MVP 2 será um serviço/job isolado com permissões próprias; não foi implementado nesta fase.

[Instruções Cloud Run](docs/DEPLOY_CLOUD_RUN.md) explicam secrets, conectividade PostgreSQL, migrations por job, IAM, limites, backup e rollback. **Nenhuma implantação/contratação paga foi autorizada ou executada.** CI valida PRs sem credenciais OpenRouter/GCP nem deploy automático. Use `docs/PR_MVP1.md` para revisão em português e nunca faça merge automaticamente.

[Mapa do código](CODEBASE_MAP.md), [contrato API](docs/api-contract.md), [decisões](docs/adr/0001-mvp1-boundaries.md), [TODO](TODO.md) e [status](docs/IMPLEMENTATION_STATUS.md) permitem navegar a entrega sem confundir funcionalidades planejadas com concluídas.

## Limites desta fase

Uso pessoal com token único; multiusuário/OAuth/ACL granular são evolução, não promessas de segurança multi-tenant prontas. Recuperação de memória lexical aprovada, não índice semântico. Importador ChatGPT é MVP 1.5. Workspace isolado/GitHub MCP/Context7/PR são MVP 2; execução local/ComfyUI, apresentações/OneDrive e observabilidade avançada estão em fases posteriores. Telemetria mínima registra tarefas, eventos, tokens/custos retornados e reservas; reconciliação com faturamento OpenRouter e LangSmith não está implementada. Dados ausentes são indisponíveis, não sucesso/custo inventado.
