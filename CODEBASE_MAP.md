# CODEBASE_MAP — DevHub AI

A aplicação tem um backend de inteligência único e dois clientes. O estado durável pertence ao PostgreSQL; nenhum cliente executa outro LLM. Atualize este mapa na mesma alteração que cria/muda arquivos e execute `python scripts/check_codebase_map.py`. Dependências, caches, banco, secrets e artefatos compilados não entram no mapa nem no pacote de fontes.

## Raiz e release

- `DEVHUB_AI.md`: especificação oficial v0.1.10 integral, com adendo separado de implementação.
- `README.md`: instalação, execução, testes, limites e navegação da entrega.
- `TODO.md`: critérios de resultado preservados e estado de aceite com evidências/pendências.
- `plan.md`: sequência curta, estrutura, decisões confirmadas e identidade visual.
- `package.json`: scripts do workspace e versão do gerenciador pnpm.
- `pnpm-workspace.yaml`: pacotes frontend/extension e autorização explícita de build do esbuild.
- `pnpm-lock.yaml`: resolução lockada de dependências Node.
- `pyrightconfig.json`: escopo de análise Python e resolução do venv backend.
- `.env.example`: nomes/valores de exemplo não secretos e fixture PostgreSQL exclusivamente local.
- `.gitignore`: exclusão de secrets, dependências, caches e builds do versionamento.
- `.dockerignore`: exclusão equivalente do contexto de imagem.
- `Dockerfile`: build multistage Vue/Python, runtime não root, sem banco nem executor dentro da API.
- `compose.yaml`: PostgreSQL local em volume próprio e perfil opcional do container API.
- `app.config.ts`: logo HTTPS durável para o metadado do projeto Manus, sem segredo.
- `.github/workflows/ci.yml`: validação de PR/main com PostgreSQL dedicado, migrations e testes; sem deploy.
- `.github/pull_request_template.md`: critérios de revisão em português, evidências e riscos sem merge automático.

## Backend — API e cérebro

- `backend/pyproject.toml`: pacote Python, versões de runtime/dev e configuração pytest/Ruff.
- `backend/uv.lock`: dependências Python lockadas.
- `backend/devhub/__init__.py`: identificação do pacote backend.
- `backend/devhub/config.py`: variáveis de ambiente/SecretStr, DSN PostgreSQL, limites de tokens/custo/tempo e desativação de tracing externo.
- `backend/devhub/main.py`: aplicação ASGI, lifespan/pool, routers, health/readiness e frontend estático seguro.
- `backend/devhub/dependencies.py`: autenticação Bearer constant-time e sessões SQL async por requisição.
- `backend/devhub/models.py`: entidades/timestamps/IDs de aplicações, pastas, conversas, mensagens, memórias, tarefas e eventos.
- `backend/devhub/schemas.py`: validação Pydantic dos payloads de organização, chat e memória.
- `backend/devhub/storage.py`: ownership, validação de destinos, serialização decimal, auditoria e token assinado de preview.
- `backend/devhub/organization.py`: CRUD/árvore, arquivo/restauração, prevenção de ciclos e movimento de conversa com seleção explícita de memória.
- `backend/devhub/queries.py`: busca owner-scoped de projetos/pastas/conversas/memória com app, pasta, conversa, categoria, data e arquivo.
- `backend/devhub/memory.py`: criação/exclusão aprovada com proveniência e recuperação lexical isolada por app_id.
- `backend/devhub/openrouter.py`: catálogo real, validação de modelos/preço, HTTP/SSE OpenRouter e leitura de uso/custo/erros.
- `backend/devhub/orchestrator.py`: LangGraph recovery → infer → persist, stream de deltas, checkpoints e finalização segura em falha/cancelamento.
- `backend/devhub/chat.py`: sessão/modelos, reserva transacional de orçamento, request_id idempotente, mensagens/stream, tasks/eventos/métricas e reconciliação sem replay.

## Schema e testes backend

- `backend/alembic.ini`: localização/versionamento de migrations sem DSN secreto embutido.
- `backend/migrations/env.py`: execução Alembic assíncrona a partir do DSN em ambiente.
- `backend/migrations/script.py.mako`: template para futuras revisões explícitas.
- `backend/migrations/versions/0001_initial_mvp1_schema.py`: migration inicial imutável do schema MVP 1.
- `backend/tests/__init__.py`: namespace da suíte.
- `backend/tests/conftest.py`: PostgreSQL dedicado protegido pelo nome do banco e provider determinístico exclusivo de testes.
- `backend/tests/test_organization.py`: CRUD/ownership/ciclos/arquivo/movimentos e seleção de conhecimento.
- `backend/tests/test_chat.py`: integração do grafo/stream/contexto, idempotência, reservas, falhas, cancelamento e reconciliação.
- `backend/tests/test_openrouter.py`: transporte SSE/HTTP, fragmentação/erros, catálogo, uso/custo e settings.
- `backend/tests/test_queries.py`: projetos/pastas na busca, filtros, restauração, reparent geral concorrente e chamadas concorrentes com mesmo request_id.

## Chat web Vue 3

- `frontend/README.md`: comandos e contrato do cliente web.
- `frontend/package.json`: dependências Vue/Vite/TypeScript/Vitest e scripts.
- `frontend/tsconfig.json`: opções de tipagem do cliente e testes.
- `frontend/vite.config.ts`: dev server/proxy relativo `/api` e configuração Vitest.
- `frontend/index.html`: documento de entrada e metadados locais da aplicação.
- `frontend/public/favicon.svg`: marca DH vetorial local.
- `frontend/public/manus-routes.json`: manifesto estático de página `/` para Preview.
- `frontend/src/vite-env.d.ts`: tipos Vite.
- `frontend/src/main.ts`: montagem Vue e stylesheet.
- `frontend/src/style.css`: sistema graphite/lime, layout, responsividade e estados visuais.
- `frontend/src/types/api.ts`: tipos das entidades, SSE, filtros e respostas compartilhadas da API.
- `frontend/src/services/api.ts`: cliente HTTP/SSE Bearer com URLs relativas, filtros, ações e erros reais.
- `frontend/src/services/sse.ts`: parser incremental SSE e decodificação UTF-8.
- `frontend/src/services/folders.ts`: candidatos válidos para reparent no mesmo app, excluindo ciclos.
- `frontend/src/App.vue`: sessão/token, estado central, seleção, ações, polling e guards contra resposta obsoleta.
- `frontend/src/components/TokenGate.vue`: formulário secreto que valida sessão antes de persistir token na aba.
- `frontend/src/components/SidebarTree.vue`: projetos/conversas gerais, toggle de arquivo e comandos da árvore.
- `frontend/src/components/FolderTreeNode.vue`: apresentação recursiva e ações de pasta/subpasta.
- `frontend/src/components/ConversationTreeItem.vue`: seleção/status e ações de conversa na árvore.
- `frontend/src/components/ChatView.vue`: histórico próprio, modelo, envio/stream, status e aprovação explícita de conteúdo como memória.
- `frontend/src/components/EntityDialog.vue`: formulários reais de criação/renomeação de entidades.
- `frontend/src/components/ReparentFolderDialog.vue`: destino permitido e confirmação de reparent de pasta.
- `frontend/src/components/MoveConversationDialog.vue`: preview assinado, destino e seleção explícita de memórias candidatas.
- `frontend/src/components/SearchDialog.vue`: busca/filtros, resultados de projetos/pastas/conversas/memória e navegação.
- `frontend/src/components/MemoryApprovalDialog.vue`: revisão humana de conteúdo/categoria/origem antes de POST.
- `frontend/src/components/MemoryPanel.vue`: memória aprovada do escopo e exclusão com confirmação.
- `frontend/src/components/ObservabilityPanel.vue`: tarefas/eventos/custos mínimos e reconciliação confirmada, sem replay.
- `frontend/tests/sse.spec.ts`: fragmentação/UTF-8/erro e custo ausente.
- `frontend/tests/folders.spec.ts`: candidatos de pasta/reparent e exclusão de descendentes.
- `frontend/tests/api-search.spec.ts`: parâmetros de filtros e chamada real de contrato do adaptador de busca.

## Extensão VS Code

- `extension/README.md`: configuração, execução no host, autenticação e comandos/limites.
- `extension/package.json`: manifesto VS Code, views/comandos/menus, backendUrl em scope application e dependências de desenvolvimento.
- `extension/tsconfig.json`: compilação TypeScript para Node/VS Code.
- `extension/.gitignore`: saída compilada/dependências não versionáveis da extensão.
- `extension/.vscode/launch.json`: início do Extension Development Host via F5.
- `extension/.vscode/tasks.json`: tarefa de compilação usada no desenvolvimento.
- `extension/src/types.ts`: contratos das entidades, modelos, tarefas e eventos.
- `extension/src/utils.ts`: validação estrita de origem/URL, SSE e representação de custo desconhecido.
- `extension/src/api.ts`: cliente autenticado real, SecretStorage vinculado à origem e proteção de captura da origem assíncrona.
- `extension/src/treeProvider.ts`: árvore central consultada por API e polling.
- `extension/src/chatViewProvider.ts`: webview CSP, coordenação do chat/histórico/modelos e cancelamento em mudança de conexão.
- `extension/src/extension.ts`: registro/composição de views e comandos reais de organização, conexão e observabilidade/reconciliação.
- `extension/media/chat.js`: renderer da webview, texto sem HTML arbitrário, mensagens e tratamento incremental do stream.
- `extension/media/chat.css`: layout/estados do chat compatíveis com tema VS Code.
- `extension/media/devhub.svg`: ícone da Activity Bar.
- `extension/test/api.test.js`: binding/TOCTOU, troca de origem e garantia de não enviar credencial sem autorização.
- `extension/test/utils.test.js`: origem/URLs permitidas, SSE e custo indisponível.
- `extension/test/tree.test.js`: dados atrasados descartados após desconexão/nova consulta e limpeza da árvore em erro.

## Scripts e documentação

- `scripts/container-entrypoint.sh`: exige DSN/secrets em runtime e inicia uvicorn honrando PORT, sem migrations implícitas.
- `scripts/live_smoke.py`: inferência externa opt-in somente se modelo gratuito tem preço zero confirmado; relatório sem secrets.
- `scripts/client_continuity.cjs`: executa os adaptadores reais web/extension contra os mesmos dados; adapta só host SecretStorage/URL relativa.
- `scripts/check_codebase_map.py`: detecta arquivo fonte/config sem caminho literal no mapa, excluindo secrets/deps/gerados.
- `docs/api-contract.md`: contrato HTTP/SSE consumido pelos dois clientes, filtros/ownership e regras de reconciliação.
- `docs/dependency-evidence.md`: versões/fontes técnicas consultadas na integração.
- `docs/adr/0001-mvp1-boundaries.md`: decisões confirmadas de escopo pessoal, persistência, fronteiras e preparação de Cloud Run.
- `docs/DEPLOY_CLOUD_RUN.md`: build amd64, secrets, conectividade, migrations por job, deploy, backup/rotação/rollback; comandos não executados.
- `docs/VALIDATION.md`: resultados reproduzíveis e limites de validação real/local/external.
- `docs/IMPLEMENTATION_STATUS.md`: escopo entregue, handoff, bloqueios de produção e roadmap pendente.
- `docs/PR_MVP1.md`: corpo de PR pronto em português; não representa PR remoto nem merge autorizado.
- `docs/live-smoke-evidence.json`: IDs, tokens/custo e resultado da inferência OpenRouter real, sem credencial.
- `docs/client-continuity-evidence.json`: coincidência de árvore/conversa/task_id dos adaptadores reais, sem alegar teste de host VS Code.

## Fluxo de dados

Os clientes autenticados usam `/api/v1`. Organização/ownership e memória são filtrados no backend. O POST de chat persiste tarefa/entrada antes de chamar o grafo; recovery seleciona histórico próprio e memória aprovada do mesmo app, infer chama somente OpenRouter e persist confirma checkpoints/status/custo no PostgreSQL. SSE leva deltas e IDs ao cliente. Reabertura consulta mensagens/tarefa persistidas; request_id repetido devolve 409 e reconciliação não repete a inferência. Futuro executor de programação deverá estar fora do servidor principal; não há módulos simulados desse executor nesta entrega.
