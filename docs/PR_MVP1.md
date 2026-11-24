# PR preparada — MVP 1 do DevHub AI

**Título:** Implementa cérebro central, chat web e cliente VS Code com persistência PostgreSQL

**Branch de trabalho:** `feat/mvp1-central-chat`. **Destino GitHub:** não informado/conectado; este arquivo é o corpo de revisão pronto, não um PR remoto criado. Nenhum merge GitHub foi executado. O snapshot de desenvolvimento Manus é versionamento de entrega, não aprovação de merge no repositório do proprietário.

## Implementação

Backend FastAPI com autenticação pessoal revogável, SQLAlchemy/asyncpg, migration Alembic explícita, grafo LangGraph e streaming OpenRouter. Organização por app_id/pastas/conversas, preview assinado para transferência de memória, memória aprovada com proveniência, histórico próprio, tasks/eventos/checkpoints, idempotência e reservas conservadoras de orçamento ficam no PostgreSQL.

Vue 3 e extensão TypeScript usam a mesma API e o mesmo estado. A extensão vincula a credencial SecretStorage à origem autorizada; troca de backend não reaproveita segredo silenciosamente. Não há executor, LLM local ou respostas demo no produto.

Dockerfile multistage não root, PORT, env example, CI sem deploy e instruções Cloud Run/PostgreSQL gerenciado foram preparados. O código não migra schema em cada startup e não armazena memória em disco de container. Nenhuma infraestrutura externa foi contratada.

## Evidências

37 testes pytest em PostgreSQL real; 8 testes Vitest; 14 testes Node da extensão; TypeScript e Pyright sem erros; Ruff; migration aplicada/repetida sem drift e CODEBASE_MAP conferido. Resultados e limites de empacotamento constam em `VALIDATION.md` e `IMPLEMENTATION_STATUS.md`.

Smoke real OpenRouter gratuito confirmado no catálogo: 237 tokens entrada, 99 saída, custo confirmado US$ 0; histórico persistido e replay HTTP 409. Adaptadores reais das duas interfaces leram a mesma árvore, conversa e task_id. Evidências JSON estão em `docs/` e não contêm credenciais.

## Revisão requerida antes de produção

- Construir/testar imagem Linux amd64 em ambiente Docker e realizar teste manual no VS Code host.
- Escolher projeto/região/fornecedor/rede do PostgreSQL gerenciado; configurar DSN/TLS/IAM/secrets e autorizar custos antes de deploy.
- Definir política de backup/restore, retenção de mensagens e rotação do token em todas as revisões.
- Revisar ingress/rate limiting, limites de gasto e concorrência; não publicar como produto multiusuário com token único.
- Revisar/autorizar PR real quando o repositório GitHub for conectado; não mergear automaticamente.

## Fora do escopo

MVP 1.5 importador ChatGPT/semântica; MVP 2 executor/GitHub MCP/Context7/PR pelo produto; MVP 3 local/ComfyUI; MVP 3.5 apresentações/OneDrive; MVP 4 LangSmith/Otel e observabilidade/custos avançados. Nenhum app futuro do DevHub foi construído.
