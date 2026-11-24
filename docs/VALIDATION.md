# Validação da primeira entrega — 23/11/2026

## Backend e persistência

`backend/.venv/bin/pytest backend/tests -q` passou com **37 testes**, usando PostgreSQL 16 real e bancos separados `devhub`/`devhub_test`. A rede de inferência é determinística somente nessa suíte; não há modo demo no produto. São exercitados CRUD, ownership, ciclos e reparent concorrente, filtros de busca/arquivamento, seleção assinada de memória ao mover conversa, memória aprovada isolada por app e origem, streaming pelo grafo LangGraph, erros HTTP/in-stream, cancelamento, checkpoints, idempotência e concorrência de request_id, reconciliação sem replay e limites de custo. Os arquivos `backend/tests/` contêm os casos reproduzíveis.

Ruff passou e Pyright 1.1.407, apontando explicitamente ao Python de `backend/.venv`, retornou **0 erros, 0 warnings**. O LSP do host não resolve esse venv de forma confiável; o comando explícito é a evidência usada. A suíte emite um aviso de depreciação pendente do serializador transitivo LangChain; isso não foi ocultado nem tratado como erro do produto.

A migration Alembic `0001` foi aplicada ao banco de desenvolvimento. Em banco dedicado de teste, o schema foi recriado por `upgrade head`, o comando repetido sem alterações, e `alembic check` retornou `No new upgrade operations detected`. Nunca foi apagado o banco de desenvolvimento para testar migrations. Upgrade/downgrade de futuras versões e backup/restore de produção continuam pendentes.

## Inferência real e continuidade

`docs/live-smoke-evidence.json` registra uma chamada **real** FastAPI → LangGraph → OpenRouter → PostgreSQL, com `openrouter/free` e preços zero confirmados no catálogo no momento do teste. Foram retornados 237 tokens de entrada e 99 de saída, custo confirmado US$ 0 e duração de 3181 ms. O histórico foi persistido; repetir o mesmo request_id recebeu HTTP 409 em vez de gerar novamente. Isso valida a integração daquele modelo/instante, não a disponibilidade futura de modelos gratuitos nem todos os provedores.

`node scripts/client_continuity.cjs` executou os adaptadores reais `frontend/src/services/api.ts` e `extension/src/api.ts` contra a mesma API autenticada. Árvore, histórico de duas mensagens, métricas e task_id coincidiram. O resultado está em `docs/client-continuity-evidence.json`. A adaptação do teste substitui apenas SecretStorage do host e resolução de URL relativa do browser; não substitui a API nem os dados. Não realiza nova inferência nem imprime token.

## Clientes

Frontend: `pnpm --dir frontend typecheck`, `test` e `build` passaram; são **8 testes em 3 arquivos**, cobrindo SSE incremental/UTF-8, custo ausente, parâmetros de pesquisa e candidatos de reparent. Busca filtrada, restauração, polling e guards de respostas obsoletas estão implementados. Não foi conduzida automação de browser nem teste manual visual exaustivo; compile/teste de serviço não equivale a esses testes.

Extensão: TypeScript compila e **14 testes** Node passaram, incluindo URLs permitidas, SSE/custo, binding à origem, troca de origem sem envio de Bearer, rejeição de token legado, captura de origem antes de leitura assíncrona do segredo, filtro de reparent fora da própria subárvore e três regressões de respostas obsoletas/desconexão/limpeza em erro na árvore. A extensão implementa CRUD/renomeação, busca por escopo, arquivar/reabrir, toggle de arquivados, chat/stream, transferência com aprovação e observabilidade/reconciliação. O Extension Development Host do VS Code **não foi operado**; a instalação, aparência e interação no computador do usuário exigem validação manual. Empacotamento VSIX não implica publicação no Marketplace.

HTTP local: `/health/ready`, manifesto `/manus-routes.json` do Vite e página/bundle servido pelo FastAPI retornaram 200. Esses probes não comprovam publicação nem teste no Cloud Run.

## Não executado

Docker está ausente no sandbox; a imagem Docker não foi construída nem testada. Nenhum recurso Google Cloud/PostgreSQL gerenciado foi provisionado e nenhum deploy pago foi executado. A CI foi preparada e seus principais comandos executados localmente, mas não foi observada uma execução no GitHub Actions. Não existe PR GitHub remoto desta entrega enquanto o destino do repositório não for informado/conectado.

Os MVPs 1.5–4, multiusuário, recuperação semântica, executor isolado, MCPs operacionais de programação e observabilidade avançada não estão implementados nem são mocks. Consulte `IMPLEMENTATION_STATUS.md`.

## Reproduzir

Siga `README.md` para instalação, variáveis e banco dedicado. Execute os comandos de teste documentados antes de qualquer release. O smoke externo é opt-in e requer secrets em ambiente; não coloque credenciais em flags, logs ou repositório. O teste de continuidade referencia os IDs do smoke desta entrega; em banco novo, gere um smoke autorizado e substitua os IDs de evidência de forma consciente.

## Artefato VS Code e gate de fonte

`@vscode/vsce` 4.1.1 empacotou localmente `devhub-ai-vscode-0.1.0.vsix` com 19 arquivos após compilar TypeScript. O conflito confirmado entre `.vscodeignore` e `files` foi corrigido removendo a estratégia redundante e preservando a lista explícita de arquivos permitidos no manifesto. O pacote contém apenas metadados VSIX, manifesto/README, JavaScript compilado/maps e media. Não houve assinatura/publicação Marketplace nem teste do host gráfico. O VSIX não contém node_modules, arquivos de workspace, segredos ou dados de banco.

O CODEBASE_MAP foi conferido para os 102 arquivos fonte/configuração/documentação além do próprio mapa. Uma checagem privada dos valores reais de DEVHUB_ACCESS_TOKEN e OPENROUTER_API_KEY nos arquivos da entrega não encontrou credenciais. O ZIP de fontes é gerado do commit versionado, sem .git, dependências, builds, caches, dumps ou .env real. O teste de conteúdo/CRC dos arquivos ZIP/VSIX e os hashes de handoff são executados antes da entrega.
