# DevHub AI — frontend

Cliente Vue 3 + TypeScript para o contrato `/api/v1`. Todas as chamadas usam a mesma origem, `Authorization: Bearer` e rotas relativas. O token é retido somente no `sessionStorage` da aba e só fica salvo depois que `GET /api/v1/session` o valida.

## Comandos

- `pnpm --filter @devhubai/frontend dev` — servidor Vite.
- `pnpm --filter @devhubai/frontend typecheck` — verificação Vue/TypeScript.
- `pnpm --filter @devhubai/frontend test` — testes de SSE/UTF-8, custos ausentes, filtros de busca e candidatos de reparent.
- `pnpm --filter @devhubai/frontend build` — typecheck seguido da compilação Vite.

As versões das dependências estão fixadas no `package.json`; o workspace e o lockfile são administrados na raiz do monorepo. Não instale dependências concorrendo com a preparação do workspace na raiz. No Vite de desenvolvimento, `/api` é encaminhado por padrão a `http://127.0.0.1:8000`; ajuste `DEVHUB_API_TARGET` se a API local estiver em outro endereço. O navegador continua usando apenas `/api/v1` relativo.

## Módulos

- `src/services/api.ts`: cliente Bearer e rotas REST do contrato.
- `src/services/sse.ts`: parser incremental SSE e decodificação UTF-8.
- `src/components/`: gate de token, árvore, chat, memória, movimentação e observabilidade.
- `src/App.vue`: sessão, polling, operações e coordenação dos componentes.
- `tests/sse.spec.ts`: fragmentação de chunks, caracteres multibyte, evento de erro e custo ausente.
- `tests/folders.spec.ts` e `tests/api-search.spec.ts`: exclusão de descendentes no reparent e parâmetros de filtros autenticados.

O cliente apresenta dados retornados pela API; não contém catálogo de modelos, conversas ou memórias de demonstração. Execução de código, workspace remoto e fluxos de programação versionada são MVP2 e não estão implementados aqui.
