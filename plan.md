# DevHub AI — implementação autorizada

A especificação oficial é `DEVHUB_AI.md` v0.1.10. O produto é o DevHub, nunca os aplicativos clientes exemplificados. Destino definitivo: Cloud Run e PostgreSQL gerenciado; nenhum deploy, contratação ou merge está autorizado nesta entrega.

## Estrutura e sequência

Monorepo: `backend/` contém FastAPI, SQLAlchemy/Alembic, grafo LangGraph e cliente OpenRouter; `frontend/` contém Vue 3 e TypeScript; `extension/` contém o cliente TypeScript para VS Code. `docs/`, `scripts/`, `.github/workflows/` e arquivos de infraestrutura suportam execução, revisão e implantação.

MVP 1: autenticação pessoal por Bearer revogável, IDs imutáveis, árvore sincronizada via consulta periódica, conversas e memória aprovada isoladas por app_id, streaming SSE, seleção de modelo e tarefas/custos/eventos persistidos. PostgreSQL local no Manus valida o mesmo schema usado no banco gerenciado. Não usar SQLite nem o MySQL gerenciado como substitutos silenciosos. LangGraph orquestra recuperação → inferência → conclusão; SQL registra estado durável e mensagens, sem depender de memória do processo. Retomada não repete automaticamente uma inferência paga.

Depois: MVP 1.5 importação revisável ZIP/JSON, proveniência e pesquisa semântica; MVP 2 executor isolado, GitHub MCP, Context7 e PR; MVP 3 execução local supervisionada; MVP 3.5 apresentações; MVP 4 observabilidade avançada. Implementar somente o que possa ser validado, mantendo resultados e pendências separados.

## Decisões confirmadas e limites

Em 2026-11-23 o usuário escolheu uso pessoal primeiro, token de acesso revogável, e confirmou Cloud Run/PostgreSQL gerenciado. Secrets somente em variáveis de ambiente. A extensão não executa modelos nem comandos locais neste MVP. Não montar Docker socket, executar código de repositórios, iniciar workers nem embutir executores na API. A API deste MVP não oferece um endpoint de execução arbitrária.

Dockerfile serve frontend compilado e FastAPI em uma origem, honra PORT, não aplica migrations automaticamente em cada instância. Alembic é executado como etapa explícita de release. Memória e tarefas vivem em PostgreSQL externo; raw artifacts de executores futuros exigirão storage durável separado.

## Design

Alternativas consideradas: oficina editorial clara (0,06), terminal brutalista monocromático (0,03), estúdio técnico grafite (0,07). Escolha: estúdio técnico grafite, uma aplicação de trabalho sem imagens decorativas.

Movimento: modernismo técnico de instrumentos, com contraste controlado, navegação lateral e superfície de conversa espaçosa. Princípios: evidências antes de afirmações, foco na conversa, hierarquia discreta, estado operacional explícito. Paleta: grafite azulado e off-white para leitura; verde-lima ácido como cor proprietária de ação/estado autorizado, âmbar para atenção e vermelho para falhas. Layout: árvore lateral fixa, coluna de conversa fluida e painel de contexto opcional. Motivos: logotipo DH entre cantos de código, linhas de conexão da árvore, chips de IDs/estado monoespaçados.

Interação: criação, arquivamento e aprovação são operações reais; erros permanecem visíveis e ações não são fingidas. Movimentar entre projetos requer prévia e confirmação. Animação: transições de 120–180 ms em foco, painéis e seleção; streaming sem animações de entrada que atrasem conteúdo; respeitar reduced-motion. Tipografia: system sans para conversa e navegação, ui-monospace para IDs e métricas; título 26–32 px, conteúdo 15–16 px, metadados 11–12 px. Marca: um cérebro online para desenvolver software com continuidade e evidências; precisa, técnica, responsável. Voz: “Qual é o próximo passo do seu projeto?” e “Decisão aprovada. Origem preservada.” Wordmark: DevHub com AI em tag monoespaçada e marca DH de cantos abertos. Cor assinatura: lima #c8f36b.
