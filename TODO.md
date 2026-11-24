# Resultados do DevHub AI

## MVP 1 — primeira entrega

- [x] Backend FastAPI com um único cérebro LangGraph e inferência exclusivamente pela API OpenRouter; credenciais apenas no backend. Autenticação pessoal revogável confirmada pelo usuário, interfaces autenticadas e falha fechada sem token.
  Evidência: integração real gratuita e testes de autenticação/provedor; rotação do token é por configuração/restart, não cadastro multiusuário.
- [x] Identificação imutável de aplicação, conversa e tarefa, com memória persistente e auditoria em PostgreSQL. Backend não depende da memória nem do filesystem efêmero do Cloud Run; tarefas/resultados confirmados persistidos antes de conclusão.
  Evidência: schema/migration reais, checkpoints e testes de falha/reconciliação. Deploy Cloud Run não foi executado; bytes ainda não gravados não são prometidos como duráveis.
- [ ] Chat web Vue 3 e extensão mínima VS Code apontando para a mesma sessão e backend, permitindo continuar a mesma conversa e consultar a mesma árvore/observabilidade sem segundo agente de IA local.
  Implementado e testado pelos adaptadores reais contra a mesma API/dados. Aceite completo aberto porque o host gráfico do VS Code e operação visual simultânea não foram testados.
- [ ] Árvore de projetos (app_id), pastas/subpastas e conversas gerais. Criar, renomear, reorganizar, arquivar e pesquisar; mover conversas entre projetos mediante prévia/confirmacão. Pastas têm IDs independentes de nomes, parent_folder_id e app_id; conversas têm conversation_id e associações opcionais a app_id/folder_id.
  API e web implementadas e validadas por testes de filtros/ciclos/concorrência/arquivo/movimento. Operações complementares da extensão constam no status; aceite visual/host ainda aberto.
- [x] Isolamento de memória por app_id no backend: duas conversas do mesmo app recuperam uma decisão aprovada com referência à origem, preservando históricos próprios. Conversas gerais não herdam memória de projetos. Incorporar candidatos de uma conversa geral somente após seleção/confirmacão; reavaliar escopo após movimentação.
  Evidência: testes de contexto, ownership, movimento assinado e seleção explícita. Recuperação lexical aprovada, não semântica.
- [x] Streaming de resposta, seleção pelo catálogo real OpenRouter e contabilização de tokens/custo confirmado quando retornados; dados ausentes indisponíveis e estimativas separadas. IDs de tarefa/trace, eventos e limites de gasto mínimos; evitar repetição automática de chamadas após falhas.
  Evidência: smoke real, SSE/erro/cancelamento, request_id duplicado/concorrrente e reconciliação sem replay. Reconciliação de faturamento e observabilidade avançada continuam no MVP 4.
- [x] Código real executável, configurações e lockfiles, testes automatizados de comportamento/erros/isolamento, documentação e CODEBASE_MAP.md conferidos. Relatar o que foi implementado, testado e permanece pendente sem equiparar testes de contrato a validação externa.
  Fontes/testes/docs entregues; verificador do mapa passou para todos os arquivos fonte/config. Resultados em docs/VALIDATION.md. Execução GitHub Actions e PR remoto dependem de repositório conectado e não são declarados como validados.
- [ ] Dockerfile Cloud Run honrando PORT, env example sem segredos, migrations Alembic, CI e instruções de deploy/backup para PostgreSQL gerenciado. Nenhuma infraestrutura externa contratada/deploy pago/merge executado. Executor de programação isolado da API principal; não oferecer execução arbitrária no servidor.
  Preparação entregue; migrations reais sem drift. Build de imagem/validação Cloud Run e executor futuro não executados. A API atual não oferece execução de código.

## Próximas fases — fora da declaração de conclusão do MVP 1

- [ ] MVP 1.5: importação ChatGPT ZIP/JSON autenticada, seleção de conversa/projeto/pasta, aprovação, triagem/mascaramento de segredos, categorias e graus de confirmação, fonte separada da interpretação, idempotência/proveniência, exclusão e recuperação semântica. Aceitar amostras autorizadas e registrar política de retenção.
- [ ] MVP 2: GitHub MCP oficial desde o primeiro fluxo versionado; consulta a branch/base, commits/PRs e CODEBASE_MAP; Context7. Workspace remoto real isolado sob demanda com limites de tempo/recursos/rede; LangGraph planejar → implementar → testar → revisar → documentar. Branch, commit e PR em português com evidências; merge nunca sem aprovação.
- [ ] MVP 3: canal técnico autenticado da extensão/executor para observar/editar/testar localmente sob comando online, sem LLM local. ComfyUI MCP em prova de conceito segura, GPU autorizada, eventos, checkpoints e reconciliação.
- [ ] MVP 3.5: apresentações editáveis por executor remoto, download, storage durável, OneDrive/Graph delegado, versões e aprovações.
- [ ] MVP 4: LangSmith/Otel e painel nativo avançado nas duas interfaces, métricas/filtros/investigação com evidências, reconciliação de custos OpenRouter e grafo de conhecimento/PRs. MCPs Figma, Playwright, Sentry, OpenRouter, ComfyUI/n8n ativados só com necessidade e autorização, nunca simulados.
