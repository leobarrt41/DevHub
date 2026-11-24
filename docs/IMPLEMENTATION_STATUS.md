# Status de implementação — DevHub AI MVP 1

## Implementado e validado localmente

Existe uma aplicação real de conversação: Vue 3 e extensão TypeScript consomem um único backend FastAPI/LangGraph, com inferência exclusivamente OpenRouter e persistência PostgreSQL. Credenciais privadas do provedor/banco ficam no backend. O token pessoal é revogável por rotação da configuração e é armazenado em sessionStorage no web/SecretStorage vinculado à origem na extensão. O escopo é uso pessoal; ownership é aplicado no backend, mas isso não transforma a autenticação em produto multiusuário.

Projetos, pastas/subpastas e conversas possuem IDs estáveis. CRUD, arquivo/restauração, reorganização no mesmo app, busca filtrada e transferência entre projetos com preview assinado/seleção explícita de conhecimento são implementados na API. O chat web disponibiliza essas operações, catálogo de modelos real, streaming, memória aprovada e observabilidade mínima. A extensão também implementa criar/renomear, arquivo/reabrir, toggle de arquivados, reparent de pastas (destino dentro do mesmo app e fora da subárvore), busca por owner/general/app que abre/revela resultados e painel de tarefa/eventos/reconciliação. Os mesmos adaptadores foram executados contra a mesma API e IDs. A restauração de ancestrais na extensão ocorre em uma sequência de PATCHes, não em uma transação; uma falha intermediária pode deixar ancestrais já reabertas.

Memória aprovada é recuperada lexicalmente dentro do mesmo app e registra sua origem. Históricos de conversas permanecem separados; conversas gerais não herdam memória de projetos. Um item explicitamente aprovado pode ser compartilhado com outras conversas do mesmo app, sem concatenar todos os chats. Não há índice semântico ou importador ChatGPT nesta entrega.

Task/message/event são criados antes da inferência; checkpoints e finalização persistem durante/ao terminar o stream. Há request_id idempotente, locks transacionais para sequência/orçamento, limites de saída/tempo/gasto e reconciliação explícita após inatividade, sem replay automático. Tokens/custo só são confirmados quando retornados; null é indisponível e a reserva conservadora é separada do custo confirmado. Tracing externo LangSmith está desativado.

O smoke real gratuito retornou 237 tokens entrada, 99 saída e custo confirmado US$ 0. Os adaptadores reais de web e extensão leram a mesma árvore, conversa e task_id. Backend: 37 testes em PostgreSQL real; web: 8 testes; extensão: 14 testes; Ruff/Pyright/TypeScript e builds locais aprovados. Detalhes e limites estão em `VALIDATION.md`, com evidências JSON.

## Handoff e versionamento

Código-fonte, testes, migrations, lockfiles, env example, CI, documentação, CODEBASE_MAP e corpo de PR em português compõem a entrega. Os pacotes finais são gerados sem secrets, dependências locais, bancos ou caches. O repositório Manus serve como snapshot de desenvolvimento; não substitui PR/revisão no GitHub do proprietário. A branch de trabalho é `feat/mvp1-central-chat`. O destino GitHub ainda não foi indicado/conectado; nenhum PR remoto nem merge foi inventado/executado.

O Dockerfile multistage não root prepara frontend+API em uma origem e honra PORT. Estado durável reside no PostgreSQL externo, não em volume de aplicação. Migrations são release/job separado, nunca ação concorrente de cada réplica. Cloud Run é o destino confirmado e as instruções estão em `DEPLOY_CLOUD_RUN.md`. Não houve deploy, publicação automática ou contratação externa.

## Pendências antes de uso definitivo

1. Testar instalação e comportamento no Extension Development Host do VS Code, incluindo webview, menus, desconexão, recuperação e continuidade visual entre clientes. Compilação/VSIX e contratos não substituem esse teste.
2. Executar teste visual de browser/acessibilidade e comportamento de duas UIs simultâneas sob latência real. A sincronização atual usa polling de 10s e não eventos push globais.
3. Construir e testar Docker Linux amd64; Docker não está instalado neste sandbox. Selecionar recursos/região/fornecedor PostgreSQL gerenciado, confirmar TLS/rede/IAM e autorizar custos antes de deploy.
4. Conectar o repositório GitHub, executar CI remota e revisar/abrir PR real. Nenhum merge automático é autorizado.
5. Definir retenção, backup/PITR e validar restauração em banco separado, rotação do token em todas as revisões ativas e políticas de ingresso/rate limiting para exposição pública.
6. Ampliar testes de limites de orçamento/conexões e retomada em rollout Cloud Run. Checkpoints não prometem preservação de bytes ainda não recebidos/gravados; falhas não são repetidas silenciosamente.

## Roadmap preservado, não implementado

- **MVP 1.5:** importação seletiva ChatGPT ZIP/JSON, triagem de segredos, revisão/deduplicação e recuperação semântica.
- **MVP 2:** workspace remoto isolado, GitHub MCP oficial/Context7, agentes de programação, validação de código e PR pelo próprio DevHub. O servidor atual não executa comandos, clona repositórios ou monta Docker socket.
- **MVP 3:** executor/canal técnico local supervisionado e ComfyUI/GPU, sem segundo LLM.
- **MVP 3.5:** apresentações editáveis, storage de artefatos e OneDrive/Graph/PowerPoint web.
- **MVP 4:** LangSmith/Otel, observabilidade avançada, filtros/investigação conversacional e reconciliação de faturamento OpenRouter. O painel atual é mínimo, não cumprimento integral dos critérios avançados v0.1.10.
- **Evolução de acesso:** multiusuário/OAuth/ACL granular e revogação por identidade/dispositivo.

MCPs e apps futuros não foram simulados nem construídos. A preparação do executor como serviço separado é uma fronteira arquitetural, não um executor já implementado ou sandbox seguro já comprovado.

## Pacote da extensão

O VSIX `devhub-ai-vscode-0.1.0.vsix` foi gerado localmente pelo empacotador oficial VSCE 4.1.1, contendo 19 arquivos compilados/metadados/media e nenhuma dependência de runtime externa. Pode ser instalado por “Install from VSIX...” ou `code --install-extension devhub-ai-vscode-0.1.0.vsix`; o backend precisa estar acessível separadamente. Isso não significa host VS Code testado, Marketplace publicado ou publisher registrado. A extensão é JavaScript multiplataforma e não inclui executável local de programação.
