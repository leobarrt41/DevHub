# DevHub AI — Especificação viva do projeto

> **Versão:** 0.1.10  
> **Data inicial:** 2026-11-23  
> **Status:** planejamento arquitetural  
> **Documento mestre:** atualizar este arquivo à medida que decisões forem tomadas.  
> **Nome:** DevHub AI (provisório)

## 0. Instruções operacionais para a IA que implementará este projeto

> **LEIA ANTES DE PROGRAMAR.** Este documento é uma **especificação de construção do próprio DevHub AI**, e não um pedido para construir todos os aplicativos aqui citados. O sistema a implementar agora é **DevHub AI**. Referências a CineForge, editor de vídeo, CineForge Publisher, NeedOFX, PLANDOC e outros produtos são **exemplos de futuros projetos clientes** e servem para definir extensibilidade, permissões e integrações — **não são entregáveis deste repositório**.

### 0.1 Missão da implementação

Construir, progressivamente, um único sistema online que converse com o usuário, planeje tarefas de programação, opere ferramentas autorizadas, acompanhe execuções, documente, teste e crie pull requests. A inferência ocorre pelo OpenRouter, e as duas interfaces — chat web e extensão do VS Code — utilizam o **mesmo backend, sessões e memória persistente**. O backend/orquestração será hospedável no Cloud Run. O trabalho sobre código poderá ocorrer em workspaces remotos ou, sob autorização, no ambiente local acessado por um canal técnico da extensão/execução, **sem segundo agente de IA independente**.

### 0.2 Limites de escopo obrigatórios

- **Construir agora:** o núcleo do DevHub, interfaces, cadastro de aplicações (`app_id`), memória, orquestração, ferramentas e fluxo de programação/PR definidos no roadmap.
- **Prever no catálogo:** conectores GitHub MCP, Context7 MCP, Figma MCP, Playwright MCP, Sentry MCP, ComfyUI MCP e n8n MCP conforme prioridade e permissões descritas neste documento. Integrações planejadas não precisam estar todas operacionais no primeiro MVP.
- **Não construir agora:** CineForge, editor de timeline, CineForge Publisher, robôs de postagem, catálogo de filmes, pipelines de vídeo nem painéis de métricas de YouTube. São requisitos de **aplicações futuras que poderão ser desenvolvidas pelo DevHub**, e não funcionalidades do núcleo do DevHub.
- **n8n MCP no DevHub:** apenas conector opcional para que o DevHub possa **criar, editar, validar e testar workflows de aplicações clientes**. Não substituir LangGraph por n8n nem instalar n8n como dependência obrigatória do orquestrador.
- **YouTube no futuro Publisher:** upload, thumbnail, metadados, publicação e Analytics serão responsabilidades do aplicativo Publisher, por APIs oficiais e eventual MCP específico. Não incluir um módulo operacional de publicação no DevHub.
- **ComfyUI MCP no DevHub:** ferramenta disponível por aplicação autorizada para executar/inspecionar workflows e testes, **não** significa criar o CineForge dentro do DevHub.

### 0.3 Processo de trabalho obrigatório da IA programadora

1. Antes de alterar arquivos, verificar o repositório, a branch, PRs relevantes, o `CODEBASE_MAP.md` (quando existente) e a tarefa autorizada.
2. Converter cada requisito em tarefas rastreáveis e implementar por fatias verticais do roadmap, sem antecipar módulos de outros aplicativos.
3. Consultar Context7/documentação compatível ao usar bibliotecas ou APIs; validar comportamento com testes reais.
4. Registrar eventos, decisões, resultados e mudanças no estado persistente; não presumir que a memória interna do modelo é duradoura.
5. Criar/manter testes e atualizar documentação, inclusive `CODEBASE_MAP.md`, quando responsabilidades ou arquivos mudarem.
6. Para cada tarefa concluída, enviar branch e abrir/atualizar PR com explicação em português, riscos, evidências de testes e mudanças de documentação. **Não executar merge sem aprovação.**
7. Se houver ambiguidades, documentar hipótese e risco; não tratar intenções futuras como funcionalidades já aprovadas para implementação imediata.

### 0.4 Critérios de aceitação iniciais do produto

- Uma conversa iniciada no chat web pode ser continuada na extensão VS Code com a mesma identidade de projeto e o contexto persistido.
- O cérebro central aciona o OpenRouter por backend seguro; chaves não são expostas às interfaces.
- Uma tarefa remota abre um clone de trabalho, propõe alterações e executa testes num workspace isolado.
- Uma tarefa autorizada usa o canal técnico do VS Code para observar/alterar arquivos locais e transmitir resultados ao cérebro online, sem rodar um modelo local.
- A tarefa concluída gera PR explicativo; não existe merge automático sem aprovação humana.
- O sistema diferencia fatos observados e persistidos de operações locais ainda não transmitidas, e oferece reconciliação após falhas.
- Cada aplicação mantém seus IDs, permissões, memórias, repositórios e ferramentas MCP isolados conforme política.

---

## 1. Visão do produto

Criar um ambiente unificado de conversa, planejamento e desenvolvimento de software: **um único sistema de IA online**, que reúne as experiências de um chat conversacional (como ChatGPT) e de um agente de programação integrado ao VS Code (como Codex), sem exigir que o usuário copie instruções e resultados entre ferramentas.

O **cérebro/orquestrador é sempre online**. É ele que recebe as solicitações, decide o fluxo de trabalho, usa ferramentas, registra os resultados, mantém memória persistente e coordena a execução de código tanto na nuvem quanto na máquina do usuário. Não haverá uma segunda inteligência/um agente de IA local independente.

O objetivo é reduzir a intermediação humana entre ferramentas: o usuário define objetivos, conversa sobre soluções, acompanha alterações e aprova pull requests; o DevHub gerencia a continuidade operacional.

### 1.1 Princípios inegociáveis

1. **Um cérebro online:** a mesma identidade de assistente conversa, planeja, programa, acompanha, revisa e documenta. Agentes especializados são papéis/subfluxos coordenados, não assistentes isolados.
2. **OpenRouter para toda inferência de modelos de linguagem:** sem necessidade de Ollama nem carregamento automático de LLM na máquina local.
3. **Memória central persistente:** conversas, decisões, execução, tarefas, resultados, custos e histórico técnico acessíveis a partir de qualquer interface.
4. **GitHub como hub do código versionado:** branches, commits, PRs e merges; integração por MCP/API.
5. **Todo trabalho concluído gera um pull request** (ou atualiza o PR já associado à tarefa), submetido à explicação e aprovação humana antes de merge.
6. **Execução híbrida:** programação e testes comuns podem rodar remotamente; GPU e recursos específicos podem ser acionados na máquina local.
7. **Observabilidade e documentação são características fundamentais**, não complementos posteriores.
8. **Separação entre decisão da IA e execução:** o cérebro online comanda, mas operações reais ocorrem em executores autorizados e instrumentados.
9. **Design conectado ao código:** integração Figma MCP para consultar interfaces e design systems e, quando autorizado e suportado, criar ou atualizar artefatos no Figma.

## 2. Experiência de uso

### 2.1 Interface no VS Code

- Extensão DevHub AI no VS Code instalado no computador.
- Interface semelhante ao Codex: chat lateral, referência ao código aberto, leitura de arquivos, visualização de diffs, testes, terminal e PRs.
- O VS Code continua sendo a IDE local; **não vamos construir outra IDE local**.
- A extensão é uma interface e um canal técnico de execução/observação; **não é um agente de IA local independente**.
- O raciocínio e a inferência dos modelos acontecem no OpenRouter, mediados pelo cérebro online.

### 2.2 Chat web

- Chat online com experiência conversacional semelhante ao ChatGPT.
- Compartilha identidade, histórico, tarefas e memória com o chat da extensão.
- Permite iniciar e acompanhar programação remota quando o PC estiver desligado ou inacessível.
- O chat remoto deve ter acesso a **workspace remoto real**, com clone de trabalho do repositório, capaz de inspecionar, alterar e testar código — não apenas conversar sobre ele.
- **Não é requisito inicial construir uma IDE web completa.** O código local é visualizado no VS Code; o desenvolvimento remoto é acompanhado pelo chat, diffs, logs e PRs. Uma IDE web pode ser reavaliada futuramente.

### 2.3 Continuidade sem transporte manual de mensagens

- O usuário pode discutir uma arquitetura no chat online e solicitar implementação na mesma conversa.
- A mesma memória técnica estará disponível quando ele retornar à extensão do VS Code.
- O sistema deverá responder perguntas como: “O que mudou?”, “Por que escolhemos esta abordagem?”, “Quais testes foram executados?” e “Explique este PR”.
- A continuidade depende de **persistência e recuperação explícitas de contexto**; nenhuma chamada isolada ao modelo tem memória ilimitada.

### 2.4 Organização de projetos, pastas e conversas

**Requisito obrigatório no MVP do chat:** o DevHub deverá apresentar na barra lateral uma árvore de **projetos (`app_id`) → subpastas → conversas**, além de uma área de **Conversas gerais** sem aplicativo associado. As pastas são organização lógica da interface e do banco, não diretórios físicos obrigatórios nos repositórios Git.

- Criar, renomear, reorganizar, arquivar e localizar projetos, pastas, subpastas e conversas; permitir mover conversas entre pastas e entre projetos mediante confirmação.
- Cada conversa terá `conversation_id` próprio e associação opcional a `app_id` e `folder_id`; pastas terão `folder_id`, `parent_folder_id` e `app_id` quando vinculadas a projeto. Nomes e caminhos visuais podem mudar sem alterar os IDs internos.
- Conversas pertencentes ao mesmo `app_id` compartilham a **memória técnica e operacional aprovada daquele projeto**, mas preservam históricos próprios. Não concatenar todas as conversas no prompt: recuperar somente informações relevantes e citar suas origens no histórico.
- **Conversas gerais** não herdam automaticamente informações privadas de projetos. Ao vincular uma conversa geral a um projeto, apresentar prévia das memórias/decisões candidatas e pedir confirmação antes de incorporá-las ao conhecimento compartilhado.
- O importador do ChatGPT deverá permitir escolher o projeto e a pasta de destino de cada conversa, oferecer classificação sugerida com revisão humana e preservar identificadores e proveniência da origem.
- Pesquisa textual e semântica filtrável por projeto, pasta, conversa, data e tipo de conhecimento; permitir pesquisar globalmente somente com permissões adequadas.
- Aplicar isolamento por `app_id` e verificações de autorização no backend, não apenas filtros visuais. Mudanças de projeto devem reavaliar permissões de arquivos, repositórios, MCPs e memória.
- A árvore de projetos/conversas deve aparecer sincronizada tanto no **chat web** quanto na **extensão VS Code**, refletindo mudanças nas duas interfaces.

**Critérios de aceitação:** criar projeto e subpasta; iniciar duas conversas no mesmo projeto e recuperar uma decisão aprovada em outra conversa sem misturar históricos; mover conversa geral para projeto com confirmação; importar conversa para pasta selecionada; arquivar e pesquisar; comprovar isolamento entre dois `app_id`; refletir mudanças no chat web e VS Code.

## 3. Arquitetura lógica

```text
                  ┌──────────────────────────────────────────┐
                  │           DEVHUB AI ONLINE               │
                  │  Cérebro/orquestrador único (LangGraph)  │
                  │  API no Cloud Run + memória persistente  │
                  └──────────────┬───────────────────────────┘
                                 │
                 ┌───────────────┼─────────────────┐
                 │               │                 │
                 ▼               ▼                 ▼
           OpenRouter        GitHub MCP       Context7 MCP
          (modelos IA)     (código e PRs)    (docs de libs)
                 │               │                 │
                 └───────────────┼─────────────────┘
                                 │
                     ┌───────────┴───────────┐
                     │                       │
                     ▼                       ▼
              Workspace remoto        VS Code + extensão
              (clone isolado)         (arquivos locais)
              testes / scripts        execução local / GPU
                     │                       │
                     └───────────┬───────────┘
                                 ▼
                        GitHub (branches/PRs)
```

**Distinções importantes:**

- **Cloud Run:** hospeda API e orquestração; não precisa hospedar modelos nem a IDE.
- **OpenRouter:** executa inferência; o DevHub mantém chave, políticas e contabilização de custos no backend.
- **Workspace remoto:** dispõe de sistema de arquivos e ambiente isolado para alterações/testes; pode ser criado sob demanda.
- **Máquina local:** só executa código e testes quando requisitados/autorizados, inclusive CUDA/ComfyUI com RTX 3080 10 GB.
- **Integração local:** comandos/arquivos/resultados são expostos pela extensão ou por um transporte executor leve autorizado. Esse componente não tem autonomia de IA nem cérebro próprio. O mecanismo exato de execução quando o VS Code estiver fechado ainda será definido.
- **Banco persistente:** guarda conhecimento e estado; não confiar em memória de processo do Cloud Run.

## 4. Stack tecnológica proposta

| Responsabilidade | Tecnologia |
|---|---|
| Extensão VS Code | TypeScript + VS Code Extension API |
| Chat web | Vue 3 + TypeScript |
| API e serviços centrais | Python + FastAPI |
| Orquestração de agentes | LangGraph (Python) |
| Integrações/agentes | LangChain e ferramentas MCP |
| Inferência de IA | OpenRouter (exclusivo) |
| Observabilidade de IA | LangSmith, associado a LangGraph/LangChain; avaliar custo e política de dados |
| Telemetria geral | OpenTelemetry e registros próprios, quando pertinente |
| Memória, tarefas e auditoria | PostgreSQL |
| Hospedagem da API | Google Cloud Run |
| Repositórios e PRs | GitHub + MCP/API |
| Documentação técnica de dependências | Context7 MCP |
| Design de interfaces e design system | Figma MCP remoto (integração planejada) |
| Execução remota | Workspaces isolados, preferencialmente sob demanda; tecnologia a definir |
| Execução local | VS Code/execução autorizada; GPU sob demanda |
| Segredos | Gestão de segredos no backend (ex.: Secret Manager) |

**Nota:** LangChain não é, por si só, uma plataforma de observabilidade. LangGraph coordena execução; LangSmith pode armazenar traces de agentes; ferramentas de telemetria e persistência complementam o conjunto.

## 5. Agentes: especializações subordinadas ao cérebro único

O sistema mantém um único coordenador online, mas organiza o trabalho em **papéis/etapas de agentes** dentro de um fluxo LangGraph, todos ligados ao mesmo `app_id`, `task_id` e memória. Papéis inicialmente previstos:

| Papel | Responsabilidades |
|---|---|
| Supervisor/orquestrador | Receber pedido, recuperar contexto, planejar fluxo, escolher ferramentas/modelos, controlar execução e orçamento |
| Planejador | Decompor tarefas, avaliar impacto e critérios de aceitação |
| Programador | Ler e modificar código, seguindo padrões do projeto |
| Testador | Criar arquivos de teste, executar suítes, analisar falhas, pedir correções, preservar evidências |
| Revisor | Verificar qualidade, segurança, regressões, aderência à tarefa e riscos antes do PR |
| Documentador | Atualizar `CODEBASE_MAP.md`, documentação técnica e registros de decisão (ADRs) |
| Designer de interface (sob demanda) | Consultar telas e componentes no Figma, propor UI/UX e especificar implementação visual com rastreabilidade |
| Operações GitHub | Criar branch, commit, abrir/atualizar PR, consultar estados e realizar merge autorizado |

Não é necessário ativar todos os papéis em cada solicitação. Modelos distintos podem executar papéis diferentes, mas a identidade operacional e a memória permanecem centralizadas.

### 5.1 Política do Testador

- **Cria e mantém testes**, não somente os executa.
- Seleciona frameworks compatíveis com o repositório (ex.: pytest, PHPUnit/Pest, Vitest).
- Cobre comportamento esperado, casos-limite, erros, autorização e regressão quando aplicável.
- Pode propor testes antes da implementação (TDD) se fizer sentido.
- Se um teste falhar, identifica se o problema está no código, na expectativa ou no ambiente.
- **Não pode enfraquecer/apagar testes apenas para fazê-los passar**; mudanças nas expectativas exigem justificativa e revisão.
- Inclui arquivos de teste e relatório de validação no mesmo PR da implementação.
- Funcionalidades novas e correções devem ter testes pertinentes, salvo exceção justificada.

## 6. Identidade de aplicações e memória

Cada aplicação tem um **`app_id` único, imutável** (internamente, preferencialmente UUID), com nome/slug legível separado. Exemplos de slugs provisórios: `cineforge`, `needofx`, `plandoc`, `cortex`.

Uma aplicação pode possuir um ou mais repositórios. Cada objeto relevante também terá seu identificador:

```text
app_id
 ├── repository_id
 ├── folder_id (parent_folder_id opcional)
 ├── conversation_id (folder_id opcional)
 ├── task_id
 │    ├── execution_id
 │    ├── trace_id
 │    ├── branch_ref / commit_sha
 │    └── pull_request_id
 ├── decision_id (ADR)
 └── document_id
```

### 6.1 Memória por camadas

- **Global:** preferências e regras gerais de desenvolvimento.
- **Aplicação:** arquitetura, stack, repositórios, objetivos e documentação próprios.
- **Conversa:** histórico, perguntas e decisões contextualizadas.
- **Tarefa:** intenção, plano, passos, artefatos, resultados, custos e aprovação.
- **Operacional:** eventos, commits, diffs/checkpoints, estados dos ambientes e tentativas.
- **Conhecimento recuperável:** resumos e índices relevantes para montar contexto sem reenviar toda a história ao OpenRouter.

O DevHub não deve confundir uma conversa ou aplicação com outra. A memória deve preservar **evidência verificável** separadamente das **interpretações do modelo**.

### 6.2 Importador de memória e conhecimento (ChatGPT primeiro)

**Requisito do produto DevHub AI:** implementar um importador de histórico e conhecimento que permita iniciar o DevHub com contexto anterior, sem exigir que o usuário reexplique seus projetos. **Esta funcionalidade pertence ao DevHub**, não aos aplicativos que ele construirá.

**Fonte inicial e limites:** receber arquivo ZIP de exportação oficial do ChatGPT, com histórico de conversas e metadados disponíveis; admitir também importação separada de resumos de memória fornecidos pelo usuário. Não pressupor que a exportação das conversas contenha toda a memória interna do ChatGPT, nem acesso automático às conversas sem exportação/autorização do usuário. A primeira versão será baseada em upload explícito, não em sincronização contínua com a conta do ChatGPT.

**Pipeline obrigatório:**

1. Receber arquivo de exportação de maneira autenticada, validar formato/tamanho e preparar a importação em área isolada, sem executá-lo como código.
2. Apresentar prévia do material encontrado e permitir **seleção de conversas, projetos, datas e categorias**; nenhuma memória é incorporada sem confirmação.
3. Fazer triagem de privacidade e segredos (tokens de API, senhas, dados pessoais/confidenciais) antes de enviar trechos a modelos do OpenRouter; disponibilizar exclusão e mascaramento e opção de não importar conteúdo sensível.
4. Classificar conteúdo em **memória global**, memória por **`app_id`**, conhecimento técnico, decisões e histórico de tarefas. Propor associação a um aplicativo existente ou à criação de um novo registro, sujeita à aprovação.
5. Distinguir explicitamente **ideia/hipótese**, **proposta**, **decisão confirmada**, **relato de implementação** e **implementação verificada no código/GitHub**. O histórico de chat, sozinho, não prova implementação.
6. Deduplicar informações, registrar contradições e versões mais recentes, preservando as fontes originais. Importações subsequentes devem ser **incrementais e idempotentes**, sem multiplicar registros já importados.
7. Exibir um relatório de importação para revisão humana: itens incluídos, rejeitados, conflitos, projetos relacionados e dados mascarados. Só após aprovação gravar na memória persistente.
8. Disponibilizar pesquisa semântica por projeto, recuperando trechos relevantes sob demanda, sem enviar todo o histórico à IA a cada conversa. Suportar exclusão e correção de itens importados, com rastreabilidade.

**Modelo mínimo de rastreabilidade:** `import_job_id`, `source_platform`, `source_conversation_id` (quando houver), `source_message_id` (quando houver), data original, `app_id` (quando aplicável), `memory_item_id`, categoria, grau de confirmação, referência ao trecho original, hash de deduplicação e data de importação. Separar o texto-fonte de resumos/interpretações produzidos pela IA.

**Segurança e retenção:** arquivos brutos de exportação devem ter acesso restrito e política explícita de retenção/eliminação; cifrar dados armazenados quando pertinente, aplicar isolamento por usuário e aplicativo, limitar logs e impedir vazamento entre projetos. Sempre informar quando um conteúdo foi inferido em vez de confirmado.

**Critérios de aceitação:** importar um exemplo de histórico exportado; permitir selecionar só uma conversa; classificar uma decisão em um `app_id`; identificar um segredo fictício e bloqueá-lo/mascará-lo; repetir a importação sem duplicação; recuperar uma decisão com referência à origem; excluir um item importado.

**Evolução futura:** criar adaptadores de importação para outras plataformas e formatos de conversação, mantendo a mesma estrutura de memória. Não ampliar o escopo do MVP antes da validação do importador do ChatGPT.

## 7. GitHub como hub e política de pull requests

1. Antes de modificar código, consultar branch-base, commits recentes, PRs abertos, tarefas concorrentes e situação conhecida dos workspaces.
2. Trabalhar em branch isolada por tarefa ou conjunto controlado de tarefas.
3. Registrar alterações, executar testes e produzir documentação pertinente.
4. Ao concluir, enviar branch e **abrir PR** (ou atualizar o PR existente se a tarefa já estiver em revisão).
5. O DevHub **explica o PR em português**, com objetivo, arquivos alterados, riscos, testes, evidências e possíveis impactos.
6. Aguardar **aprovação humana** antes de merge. Aplicar branch protection e verificações obrigatórias onde configuradas.
7. Após merge, atualizar memória, estado dos ambientes e documentação de evolução.
8. O MCP GitHub serve para consulta e operações no GitHub, **não substitui o registro de alterações ainda não enviadas ao repositório**.

## 8. Sincronização, consistência e recuperação

O **cérebro online inicia e supervisiona as operações**. Se ele orienta uma edição e recebe confirmação/artefato da ferramenta, já conhece essa operação: não é preciso um segundo agente reportando decisões que nasceram nele.

Todavia, devemos diferenciar: **intenção**, **comando enviado**, **comando executado**, **resultado confirmado** e **estado efetivamente persistido**. Uma ação planejada não prova que o arquivo foi salvo; confirmação técnica e evidências são necessárias.

### 8.1 Estratégia

- Registrar eventos com `event_id`, `app_id`, `task_id`, sequência, timestamps, origem, status e, quando aplicável, hash/versão-base.
- Persistir planos e resultados antes de considerá-los concluídos.
- Utilizar checkpoints e patches/artefatos recuperáveis para alterações ainda não commitadas, conforme necessidade.
- Na reconexão, conciliar estados conhecidos do servidor, GitHub e workspace; evitar sobrescrever dados silenciosamente.
- Se o executor ficar indisponível, suspender operações dependentes dele, mantendo trabalho remoto independente quando seguro.
- Detectar tarefas concorrentes e arquivos potencialmente conflitantes; preferir branches isoladas e verificações antes do merge.
- Proibir descartes destrutivos automáticos (`reset --hard`, exclusão de alterações) sem salvaguarda e autorização.
- Implementar execução idempotente ou verificação de efeitos externos para não repetir commits/PRs/comandos após retomadas.

**Limite físico que permanece:** o servidor conhece o que comandou e o que foi confirmado/transmitido; não pode garantir a recuperação de bytes nunca persistidos nem recebidos. A meta é reduzir essas janelas por design, não transferir ao usuário a obrigação de lembrá-las.

## 9. Observabilidade

A observabilidade deve responder não só **o que aconteceu**, mas também **por que aconteceu** e **com quais evidências**.

### 9.1 Quatro dimensões

1. **Eventos/logs:** tarefas, ferramentas, commits, testes, erros e transições de estado.
2. **Métricas:** duração, tokens, custos OpenRouter, taxa de sucesso, retrabalho, recursos CPU/GPU/RAM quando instrumentados.
3. **Traces:** cadeia de chamadas aos modelos, ferramentas, nós LangGraph e etapas de execução.
4. **Decisões:** intenção, alternativas, justificativa, revisão e relação com código e resultados.

### 9.2 Infraestrutura

- Instrumentação LangGraph/LangChain e **LangSmith** para traces de IA, sujeita a avaliação de custo, privacidade e retenção.
- **PostgreSQL** como registro operacional primário do DevHub (sem depender exclusivamente de telemetria de terceiro).
- **OpenTelemetry** quando útil para correlação entre API, filas, ferramentas e executores.
- Correlação por IDs: `app_id → task_id → execution_id → trace_id → commit_sha/PR` (relações podem ser muitos-para-muitos).
- Limpeza/redação de segredos e PII; não armazenar automaticamente prompts, respostas ou conteúdo de arquivos sensíveis em serviços de tracing externos sem política explícita.

### 9.3 Painéis/consultas desejadas

- Linha do tempo da tarefa e respectivos eventos.
- Tempo/custo por tarefa, modelo e projeto.
- Testes aprovados, falhas recorrentes, regressões e retrabalho.
- Comparação de desempenho antes/depois de mudanças.
- Disponibilidade de workspace remoto e capacidade de CPU/GPU local quando conectada.
- Rastreamento de uma decisão até os arquivos, testes, commits e PRs correspondentes.

### 9.4 Interface de observabilidade — decisão de produto

**A observabilidade será analisada prioritariamente dentro do próprio DevHub AI**, sem obrigar o usuário a alternar constantemente para ferramentas externas. A interface web e a extensão VS Code deverão consultar **o mesmo backend central e os mesmos registros**, com controle de acesso por `app_id`.

- **Navegação:** área `Observabilidade` no chat web; aba ou painel equivalente na extensão VS Code, com informações consistentes entre os dois ambientes.
- **Visão geral:** indicadores de execuções, sucesso/falhas, latência, tarefas ativas, retrabalho e recursos quando disponíveis; filtros por aplicação, tarefa, período e agente.
- **Traces:** linha do tempo com nós do LangGraph, chamadas ao OpenRouter, ferramentas MCP, execução de testes, falhas e correlação com `trace_id`, `task_id`, `execution_id` e PR.
- **Custos e modelos:** tokens, custo estimado/confirmado, latência, retries, desempenho medido e comparação por modelo/agente/aplicação.
- **Investigação conversacional:** permitir perguntas ao mesmo cérebro central, como «por que esta tarefa falhou?» e «por que gastou tantos tokens?», com respostas fundamentadas nos registros e links para as evidências; não inventar causalidade sem dados.
- **Análise profunda:** oferecer acesso ao trace original no **LangSmith**, quando integrado e autorizado, sem recriar integralmente sua interface dentro do DevHub.
- **Segurança e persistência:** o painel consulta registros operacionais próprios do DevHub; LangSmith é ferramenta complementar. Redigir segredos e dados sensíveis, aplicar retenção e permissões por projeto.

**Critérios de aceitação:** um evento ou execução identificado por `task_id` aparece nas duas interfaces; o usuário consegue abrir detalhes, filtrar métricas, consultar o custo associado e navegar até o trace correlato do LangSmith (quando habilitado). Dados ausentes devem aparecer como indisponíveis, não como valores presumidos.

### 9.5 Métricas de modelos e auditoria de custos — OpenRouter

**Decisão:** criar uma camada própria de telemetria por chamada de modelo, integrada ao LangGraph e correlacionada com a telemetria de agentes no LangSmith. A inferência continua sendo executada pela **API OpenRouter**; o MCP OpenRouter é uma **ferramenta complementar** de consulta e comparação, não o transporte principal do chat.

- Registrar `app_id`, `task_id`, `execution_id`, `trace_id`, `generation_id`, `model_id`, provedor efetivo quando informado, papel do agente, horário, duração, resultado e contagens de tokens de entrada/saída (incluindo categorias adicionais disponíveis).
- Registrar o **custo real retornado pelo provedor**, quando fornecido, diferenciando preço estimado, custo final e chamadas sem contabilização confirmada. Associar tentativas, retries e fallback à mesma tarefa sem duplicar contabilização.
- Consultar APIs oficiais do OpenRouter para **generation metadata**, **activity/analytics** e **créditos**; usar reconciliação periódica para confrontar a telemetria local com o faturamento do provedor.
- Indicadores derivados do DevHub: **custo por tarefa concluída**, custo por PR aprovado, tempo até a primeira resposta, latência total, taxa de erro, quantidade de tentativas, resultado dos testes e retrabalho, comparados por modelo, agente e aplicação.
- Separar **qualidade aferida pelos testes/revisões do DevHub** de benchmarks ou rankings externos: benchmark não comprova sucesso no repositório específico.
- Exibir painel por **aplicação, agente, modelo, período e tipo de tarefa**, com alertas de saldo, tetos de gasto por tarefa/dia/mês, bloqueio antes de ultrapassar orçamento configurado e rastreabilidade de gastos.
- Nunca armazenar API keys, credenciais ou conteúdo sensível de prompts em tabelas de métricas; definir retenção, permissões e anonimização.

### 9.5 OpenRouter MCP oficial — catálogo e seleção de modelos

- **Incluir como integração planejada de prioridade alta:** MCP oficial `https://mcp.openrouter.ai/mcp` (documentação: https://openrouter.ai/mcp).
- Uso: catálogo atualizado, características dos modelos, janelas de contexto, preços, informações de provedores, benchmarks, geração consultada por ID e saldo disponível; ferramentas a validar incluem `get-model`, `list-model-endpoints`, `list-benchmarks`, `get-generation` e `get-credits`.
- O **cérebro central** usa esses dados para recomendar ou selecionar modelos conforme capacidade, latência, custo, disponibilidade e desempenho observado em tarefas anteriores. Mudanças de política/modelo devem ser auditáveis e respeitar orçamento e aprovação, se exigida.
- **Não substituir a API de inferência pelo MCP:** chamadas operacionais do chat e dos agentes continuam na API OpenRouter; o MCP auxilia a decisão. Evitar chamadas de teste pagas sem autorização (a ferramenta `send-message` pode gerar cobrança).
- Autenticação OAuth e credenciais MCP devem ser tratadas no backend seguro; validar compatibilidade, escopos e expiração do acesso no Cloud Run.
- Fontes: https://openrouter.ai/blog/announcements/openrouter-mcp-server/ ; https://openrouter.ai/docs/api/api-reference/generations/get-generation ; https://openrouter.ai/docs/api/api-reference/analytics/get-user-activity ; https://openrouter.ai/docs/api/api-reference/credits/get-credits .

## 10. Documentação viva

### 10.1 `CODEBASE_MAP.md` por repositório

Cada repositório manterá um **`CODEBASE_MAP.md` na raiz**, com um mapa legível de diretórios e arquivos e uma descrição geral da responsabilidade de cada um.

**Modelo inicial do conteúdo:**

```md
# Mapa do repositório

## Visão geral
Resumo da finalidade do projeto, stack e componentes.

## Estrutura
- `src/`: código-fonte principal.
- `src/main.ts`: ponto de entrada da aplicação.
- `src/services/api.ts`: comunicação com a API.
- `tests/`: testes automatizados.

## Fluxos principais
- Entrada → serviço → persistência → resposta.

## Pontos de atenção
- Dependências e limitações relevantes.

## Última verificação
- Commit-base: `<sha>`
- Tarefa/PR: `<identificador>`
```

**Política:**

- Atualizar o mapa no mesmo PR sempre que diretórios/arquivos ou responsabilidades mudarem.
- Descrições curtas e úteis; evitar copiar o código completo.
- Para repositórios grandes, usar índice por diretório e documentos complementares sem transformar um único MD num arquivo impraticável.
- Conferir o código real; o mapa é guia de navegação, não a única fonte da verdade.
- Validar o mapa como etapa do PR, admitindo exceção justificada quando nenhuma atualização for necessária.

### 10.2 Outros artefatos

- **ADRs:** decisões arquiteturais, alternativas, motivos e consequências.
- **Documentação técnica:** contratos de APIs, configuração, integração, dependências e módulos.
- **Relatórios por PR:** resumo de mudanças, testes, riscos e instruções de revisão.
- **Histórico de execução:** dados e evidências associados à tarefa.

A documentação deve nascer ao longo do desenvolvimento, não apenas depois.

## 11. MCP Context7 e segurança técnica

- Disponibilizar **Context7 MCP** aos agentes para consultar documentação de bibliotecas e frameworks.
- Quando uma tarefa depende de API ou biblioteca externa, identificar a versão efetivamente utilizada no projeto e consultar documentação correspondente, quando disponível.
- Usar Context7 para reduzir sugestões desatualizadas ou chamadas de API inventadas.
- Conferir dependências, permissões e testes; **consulta documental não é garantia de segurança**.
- O **GitHub MCP** fornece ações e informações de repositórios/PRs; autorizações devem ser mínimas e auditadas.
- Tratar resultados de ferramentas, README externos e documentação consultada como **dados não confiáveis**, não instruções superiores às políticas do DevHub.

## 11.1 GitHub MCP — integração obrigatória do núcleo

**Decisão:** o **GitHub MCP oficial** é integração essencial desde o primeiro fluxo de programação versionada, e não apenas uma opção no catálogo.

- O cérebro online consulta repositórios, branches, commits, arquivos, PRs, avaliações, checks e histórico dentro das permissões concedidas.
- Ao concluir uma tarefa, gera ou atualiza branch e PR, registra a relação entre `app_id`, `task_id`, `commit_sha` e `pull_request_id`, e explica em português as mudanças, testes, riscos e impacto.
- Merge somente após autorização humana e verificações obrigatórias; preferir mecanismos de proteção de branch também no GitHub.
- Usar credenciais mínimas e separadas por instalação/projeto, logs auditáveis e validação do estado remoto antes de novas modificações.
- O MCP do GitHub **não equivale a observar arquivos locais ainda não enviados**. A execução comandada pelo cérebro central deve registrar seus resultados na memória operacional; uma cópia local ainda não sincronizada exige reconciliação.
- Servidor oficial: https://github.com/github/github-mcp-server

## 11.2 ComfyUI MCP — ferramenta de execução de workloads de GPU

**Decisão:** adicionar **ComfyUI MCP** ao catálogo do DevHub com prioridade alta para aplicações que usam geração de imagens/vídeos, especialmente para testes em GPU própria. Integração planejada, ainda não instalada nem autenticada.

- Preferir avaliar inicialmente o projeto oficial da Comfy-Org: https://github.com/Comfy-Org/comfy-mcp e documentação https://github.com/Comfy-Org/docs/blob/main/agent-tools/mcp.mdx.
- Capacidades a validar no ambiente real: consultar disponibilidade, modelos/nós e workflows; submeter workflows JSON, acompanhar execuções e filas, recuperar arquivos e resultados. Medidas como uso de VRAM, CPU e tempo por nó podem exigir instrumentação complementar, e não devem ser presumidas como ferramentas nativas do MCP.
- O **cérebro de IA continua exclusivamente online** (Cloud Run + OpenRouter + LangGraph). Um servidor MCP ou ponte na máquina local será somente uma ferramenta técnica de acesso ao ComfyUI; **não é outro agente inteligente e não usa Ollama**.
- Para acionar o ComfyUI local de forma remota, utilizar conexão de saída autenticada, túnel seguro ou gateway com controles de autorização. Não expor diretamente a API/porta do ComfyUI à internet. A arquitetura exata da ponte e a compatibilidade com o MCP oficial precisam de prova de conceito.
- Só executar quando o PC estiver disponível, com a GPU livre ou após aprovação de fila/prioridade; impor limites de duração, VRAM, concorrência, caminhos de arquivos e permissões.
- Relacionar cada execução a `app_id`, `task_id`, `workflow_id`, `execution_id`, versão/hash do workflow, artefatos produzidos e medições confiáveis. Guardar logs e referências, sem transferir vídeos grandes indiscriminadamente ao banco de memória.
- Fluxo ilustrativo: `Tarefa no DevHub → cérebro online → ferramenta ComfyUI MCP autorizada → ComfyUI na RTX 3080 → resultados/métricas → revisão/documentação → PR se houve mudança no código/workflow versionado`.
- **Comfy Cloud MCP** é uma alternativa separada, com execução em GPUs remotas; não é necessária para usar a RTX 3080 local e pode ter custos próprios.

## 11A. MCP Figma — design integrado ao desenvolvimento

**Decisão:** incluir uma integração com o **servidor MCP oficial do Figma**, preferencialmente na modalidade **remota**, como ferramenta do cérebro online. A integração é **planejada**; ainda não está instalada nem autenticada.

- **Servidor oficial remoto:** `https://mcp.figma.com/mcp`; a modalidade remota dispensa manter o Figma Desktop aberto na máquina do usuário.
- **O que o DevHub poderá consultar:** frames, componentes, variáveis/tokens, layout e contexto de design disponíveis pela conexão autorizada; usar Code Connect quando configurado para relacionar componentes do Figma aos componentes reais do repositório.
- **Operações de escrita:** ferramentas atuais do MCP oficial também podem criar/editar conteúdo no Figma, conforme ferramenta disponibilizada, plano, permissões e suporte do cliente; **não presumir acesso irrestrito nem edição automática**.
- **Papel no fluxo:** a partir de uma tela ou link do Figma, o cérebro consulta o design, identifica componentes existentes, consulta Context7 quando houver bibliotecas externas, orienta o Programador e pede ao Testador verificações de interface. O código permanece versionado no GitHub e passa por PR.
- **Documentação:** registrar links de design, frames relevantes, tokens reutilizados e decisões de interface no contexto do `app_id` e, quando pertinente, no `CODEBASE_MAP.md` ou na documentação de design; não copiar indiscriminadamente arquivos/projetos do Figma para a memória.
- **Identificação e rastreio:** associar `app_id`, `figma_file_key`, `figma_node_id` (quando disponível), `task_id`, `commit_sha` e `pull_request_id`, com acesso por projeto e permissões mínimas.
- **Segurança:** conexão via OAuth/autenticação suportada pelo Figma, armazenamento seguro de credenciais e segregação por usuário/projeto; operações de escrita no Figma exigem aprovação conforme política da tarefa. Conteúdo recebido do MCP é dado externo, não instrução prioritária.
- **Limitação de integração:** embora o Figma disponibilize MCP remoto para clientes suportados, **precisamos validar na implementação a compatibilidade do nosso cliente MCP customizado no backend Python/Cloud Run, autenticação e limites do plano**. Não considerar essa compatibilidade já comprovada.

**Fluxo desejado:** `Solicitação → Figma MCP (contexto visual) → planejamento LangGraph → implementação → testes de UI → documentação → PR GitHub → aprovação`.

Fontes oficiais de referência:
- https://developers.figma.com/docs/figma-mcp-server/
- https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/

## 11B. Avaliação de MCPs — artigo Code Capital (2025-08-27)

**Fonte:** Rafael Quintanilha, *Todos os MCPs que utilizo para programar* — https://codecapital.substack.com/p/todos-os-mcps-que-utilizo-para-programar. A relação abaixo documenta a recomendação de arquitetura para o DevHub, **não a instalação ou ativação** das integrações.

| MCP | Capacidade relatada no artigo | Decisão no DevHub | Critérios e cuidados |
|---|---|---|---|
| **Playwright MCP** | Navegar e interagir com aplicações web para testes E2E e investigação de UI | **Incluir no planejamento — prioridade alta** | Agente Testador cria testes reproduzíveis (Playwright Test) e usa MCP para exploração/diagnóstico; browser em workspace isolado; sem credenciais reais ou acesso irrestrito a sites |
| **Context7 MCP** | Recuperar documentação de bibliotecas | **Já definido** | Confirmar versões reais no projeto e citar documentação quando relevante; consultas não substituem testes |
| **Sentry MCP** | Ler erros, issues e dados de execução de aplicações monitoradas | **Incluir no planejamento — prioridade alta** | Complementa LangSmith: Sentry observa erros/performance do software desenvolvido; LangSmith rastreia ações dos agentes; escopar credenciais por aplicação |
| **Gemini MCP Tool** | Delegar tarefas de análise ao Gemini CLI | **Não incorporar inicialmente** | Introduz outro provedor/canal fora da decisão OpenRouter exclusivo; comparar apenas se política de inferência for reavaliada |
| **Firecrawl MCP** | Pesquisa, scraping e extração estruturada de páginas | **Opcional, sob demanda** | Priorizar busca/documentação/HTTP simples quando bastar; checar custo, termos de uso, privacidade e confiabilidade dos resultados; não usar para contornar controles de acesso |
| **Linear MCP** | Integrar tickets e planejamento com agente | **Adiar** | DevHub já terá app_id, task_id e fila próprios; adicionar quando houver necessidade concreta de sincronização com Linear, sem duplicar fonte de verdade |
| **Postgres MCP** | Inspecionar schema e consultar dados | **Planejar com restrições — prioridade média** | Preferir acesso somente leitura a bancos de desenvolvimento/teste, com usuário de privilégio mínimo e mascaramento; nunca dar acesso irrestrito à produção; migrations continuam com revisão/aprovação |

### 11B.1 Papel do Playwright no Testador

- O Testador cria/atualiza **arquivos de teste versionados** (ex.: `tests/e2e/*.spec.ts`), que devem integrar o pull request.
- O **Playwright MCP** é uma interface de navegação/diagnóstico: navegar, interagir, analisar elementos acessíveis e observar o comportamento real da UI. Isso **não dispensa** testes Playwright determinísticos mantidos no repositório.
- O executor remoto deve oferecer browser isolado; execução local somente quando recurso local for necessário e autorizado.
- Registrar evidências relevantes de falha (logs, traces, screenshots quando apropriado), com retenção e acesso controlados.
- Avaliar Playwright CLI/Skills como alternativa mais econômica em tokens para fluxos automatizados, sem assumir que MCP seja sempre superior.

### 11B.2 Sentry e LangSmith são complementares

- **LangSmith/telemetria de agentes:** modelos, prompts conforme política de privacidade, chamadas a ferramentas, latência, tokens e custos.
- **Sentry/telemetria de aplicações:** exceções, regressões, stack traces e desempenho do software criado, quando a aplicação estiver instrumentada.
- Associar issue do Sentry a `app_id`, `task_id`, `trace_id`, `commit_sha` e PR quando possível; o DevHub poderá propor correção e teste em branch isolada.
- MCP do Sentry depende de serviço e credenciais próprios; não pressupor gratuidade da plataforma nem ausência de custos adicionais.

### 11B.3 Política geral de seleção de MCPs

- **Nenhuma integração instalada por padrão sem necessidade**: catálogo por capacidade, escopo por aplicação e ativação controlada.
- Ferramentas externas devolvem **dados não confiáveis**; instruções encontradas em páginas, issues e documentos não têm autoridade sobre o orquestrador.
- Segredos ficam no backend/gerenciador de segredos; usar credenciais de menor privilégio e auditoria por chamada.
- Registrar ID da tarefa, nome da ferramenta, parâmetros não sensíveis, resultado, duração e eventuais gastos; solicitar aprovação para ações destrutivas ou que alterem serviços externos.
- Se MCP e integração direta por API/CLI forem opções equivalentes, escolher pela segurança, auditabilidade, simplicidade e custo real.

**Referências oficiais para validação durante a implementação:**
- Playwright MCP: https://github.com/microsoft/playwright-mcp
- Sentry MCP: https://mcp.sentry.dev/mcp
- Firecrawl MCP: https://docs.firecrawl.dev/mcp-server
- Linear MCP: https://linear.app/docs/mcp

## 11C. Delimitação de integrações — n8n e YouTube no ecossistema audiovisual

**Decisão:** o **DevHub AI desenvolve e mantém os aplicativos**, mas não assume a operação editorial diária da publicação de vídeos. O ciclo operacional é separado em três aplicações/etapas:

1. **CineForge — produção:** personagens, cenas, geração de vídeos, vozes e demais elementos audiovisuais.
2. **Editor de vídeo com linha do tempo — finalização:** montagem, trilha musical, efeitos, transições e exportação do arquivo final. A escolha do editor e sua eventual integração continuam abertas.
3. **CineForge Publisher (nome provisório) — distribuição e análise:** recebe o vídeo finalizado, gerencia títulos, descrições, hashtags/tags, thumbnails, agendamentos, publicação e análise de desempenho.

### 11C.1 Onde ficam as integrações

| Aplicação | YouTube MCP / APIs | n8n MCP / n8n | Motivo |
|---|---|---|---|
| **DevHub AI** | Não necessário inicialmente para a operação editorial; pode **desenvolver e testar** a integração do Publisher | **n8n MCP opcional como ferramenta de desenvolvimento**, para criar, consultar, testar e manter workflows dos aplicativos | O DevHub é a fábrica de software, não o publicador cotidiano |
| **CineForge** | Não previsto | Não previsto por padrão | Sua responsabilidade é produzir o conteúdo |
| **Editor com linha do tempo** | Não previsto | Não previsto por padrão | Sua responsabilidade é finalizar o vídeo |
| **CineForge Publisher** | **Sim:** YouTube Data API para upload/metadados/thumbnail/agendamento e YouTube Analytics API para métricas; MCP opcional como interface de ferramentas de IA | **Sim, se adotado:** n8n executa automações operacionais; MCP permite que uma IA autorizada consulte/controle workflows | Sua responsabilidade é publicar, distribuir, acompanhar resultados e analisar dados |

**Distinção técnica:** o **MCP do n8n não é o próprio motor de automação**; workflows são executados pela instância n8n. O **MCP do YouTube não substitui** as APIs oficiais, quotas, OAuth e permissões da conta. O Publisher pode usar chamadas diretas às APIs para operações determinísticas, e oferecer ferramentas MCP para ações assistidas por IA quando fizer sentido.

### 11C.2 Fluxo previsto para o Publisher

`CineForge (produz) → editor com timeline (finaliza/exporta) → Publisher (recebe arquivo e metadados) → aprovação editorial → upload/agendamento via YouTube Data API → coleta de métricas via YouTube Analytics API → análise e recomendações.`

- O Publisher terá catálogo próprio de canais, séries, filmes/produções, episódios e vídeos; identificadores próprios e IDs externos de plataforma devem ser armazenados separadamente.
- Após receber o vídeo final, poderá preparar ou sugerir thumbnail, título, resumo, descrição, hashtags, tags e agenda de publicação, sem reabrir a edição audiovisual obrigatoriamente.
- Métricas desejadas: visualizações, impressões, CTR, tempo de exibição, retenção e evolução de inscritos, **conforme disponibilidade e permissões das APIs**; preservar histórico para comparação entre vídeos.
- Publicação, mudanças de visibilidade, exclusão e alterações sensíveis exigem autorização apropriada; registrar resultados, falhas e IDs retornados pela plataforma.
- Integrações com outras redes podem ser previstas no modelo de dados, mas **YouTube é a primeira plataforma planejada**. Não presumir que APIs de terceiros oferecem operações equivalentes.
- O uso de filmes e séries de terceiros exige atenção a direitos autorais e licenças; dados de catálogos não conferem automaticamente direitos de republicação.

### 11C.3 Escopo do DevHub sobre o n8n

- Usar n8n MCP **somente quando um aplicativo realmente necessitar de workflows n8n**; não adicioná-lo como dependência do cérebro/orquestração LangGraph.
- Quando o DevHub criar ou alterar um workflow, manter uma exportação versionável em JSON no repositório pertinente, quando compatível com as credenciais e recursos envolvidos, e gerar PR explicativo com testes/evidências.
- Credenciais do n8n e do YouTube devem permanecer em armazenamento seguro e com escopo mínimo; nunca publicar tokens em repositórios nem nas descrições dos PRs.
- A integração MCP, a versão exata das ferramentas, a autenticação e o alcance das operações de escrita devem ser validados durante a implementação.

## 11D. Integração Microsoft 365 — apresentações geradas 100% online

**Decisão 2026-11-23:** o DevHub AI deverá ter uma capacidade especializada de criação de apresentações editáveis, aproveitando a assinatura Microsoft 365 do usuário, sem exigir PowerPoint instalado ou processamento de IA no Ubuntu. **Este módulo é uma capacidade futura do DevHub, não a construção de outro aplicativo cliente.**

### Responsabilidades técnicas

1. **Cérebro central (Cloud Run + LangGraph + OpenRouter):** recebe o pedido, consulta memória/documentação do `app_id`, planeja tópicos e slides, seleciona template e registra custo, decisões e artefatos.
2. **Gerador em executor remoto Linux:** compõe arquivos `.pptx` com `python-pptx` (ou biblioteca compatível validada), incluindo texto, imagens autorizadas, tabelas e gráficos; pode reutilizar templates `.pptx`. Não requer Microsoft Office instalado, nem acesso à GPU local.
3. **Persistência do artefato:** armazena provisoriamente no storage remoto durável, sem depender do sistema de arquivos efêmero do Cloud Run; registra `app_id`, `task_id`, versão, caminho/URL, hash e histórico de alterações.
4. **Microsoft Graph + OneDrive:** após autenticação delegada/autorização OAuth adequada, faz upload do PPTX para a pasta escolhida e guarda o `driveItemId` e o link. Usar permissões mínimas e evitar tokens do usuário no frontend ou logs.
5. **PowerPoint para a Web:** o usuário abre, revisa e edita o arquivo no navegador do Ubuntu. Disponibilidade de recursos varia por licença e edição web; não presumir automação avançada de cada elemento via Graph.
6. **Ciclo de revisão:** receber sugestões pelo mesmo chat, produzir versão revisada, preservar original/histórico, comparar versões e solicitar confirmação antes de sobrescrever artefatos aprovados.

### Regras e fronteiras

- **Não usar o Office local nem exigir Windows.** O Ubuntu serve apenas para acessar chat, VS Code e PowerPoint web.
- **A licença Microsoft 365 não inclui automaticamente uma API de geração de slides por IA.** O DevHub gera o PPTX pelo executor; Microsoft 365 é integrado para armazenamento e edição web.
- **Microsoft Graph não substitui `python-pptx` como motor de construção detalhada dos slides.**
- Gamma/Plus AI ficam **opcionais e não necessários ao MVP**; não contratar assinatura adicional sem benefício demonstrado.
- O serviço deve funcionar também no modo **gerar e baixar PPTX** quando a autenticação do OneDrive não estiver conectada.
- Aplicar política de privacidade dos projetos e autorização explícita para sincronização de arquivos sensíveis com OneDrive.
- Não converter automaticamente apresentações criadas em branches em commits de código: artefatos de apresentação ficam no armazenamento associado ao `app_id`, com versionamento próprio.

### Critérios de aceitação

- Solicitar pelo chat web: “Crie uma apresentação editável de 12 slides sobre a arquitetura do meu projeto”.
- DevHub gera um `.pptx` válido **no executor remoto**, com arquivo disponível mesmo se o computador local estiver desligado.
- Com Microsoft 365 conectado, DevHub envia para OneDrive e oferece link para abrir no PowerPoint web em Ubuntu.
- Usuário consegue editar os textos/formas suportados no PowerPoint web e pedir revisões pelo DevHub.
- Documento registra tempo, tokens, custos de IA, versão e vínculo com `app_id`/`task_id`.

**Documentação de referência a validar na implementação:** https://python-pptx.readthedocs.io/en/latest/ ; https://learn.microsoft.com/graph/api/driveitem-createuploadsession ; https://support.microsoft.com/pt-br/powerpoint/edit-a-presentation-in-powerpoint-for-the-web

## 12. Segurança e controle de recursos

- Chaves OpenRouter e credenciais GitHub **somente no backend/armazenamento de segredos**, nunca embutidas na extensão distribuída.
- Execução de código em workspaces isolados, com permissões restritas, limites de tempo/recursos e controles de rede.
- Alterações potencialmente destrutivas, acesso a arquivos confidenciais, deploy e merge exigem políticas de autorização.
- Proteção de branch principal; PR e validações antes de merge.
- Limites por tarefa/projeto/modelo para orçamento OpenRouter.
- **Não iniciar Ollama automaticamente**; inferência de LLM sempre via OpenRouter.
- A GPU local é recurso de execução sob demanda, não recurso permanente do cérebro. Evitar competir com ComfyUI sem autorização.

## 13. Fluxo de ponta a ponta

1. Usuário solicita uma tarefa no chat web ou na extensão VS Code.
2. O cérebro online determina `app_id`, recupera memória, objetivo e estado do projeto.
3. Consulta GitHub MCP, `CODEBASE_MAP.md`, PRs e, quando pertinente, Context7 MCP e Figma MCP (para tarefas de interface); tarefas de ComfyUI podem selecionar ComfyUI MCP.
4. LangGraph planeja e seleciona papéis/modelos e o alvo de execução (nuvem ou local).
5. Ambiente autorizado recebe operações; o DevHub registra comandos e resultados confirmados.
6. Programador implementa em branch isolada.
7. Testador cria/atualiza arquivos de teste, executa e investiga resultados.
8. Revisor identifica riscos e falhas; correções retornam à etapa pertinente. Em tarefas de UI, comparar implementação e referências de design autorizadas.
9. Documentador atualiza `CODEBASE_MAP.md` e outros artefatos relevantes.
10. GitHub recebe commits e um PR; DevHub explica alterações, testes e impacto.
11. Usuário aprova (ou pede correção); merge ocorre somente após validações.
12. Memória, métricas, documentação e estados são atualizados.

## 14. Roadmap inicial

### MVP 1 — cérebro único e conversação
- Backend FastAPI no Cloud Run com OpenRouter.
- Identificação de aplicação, conversa e tarefa; memória persistente.
- Chat web e extensão mínima VS Code apontando para **a mesma sessão e backend**.
- Árvore sincronizada de projetos (`app_id`), subpastas e conversas gerais; criação, movimentação, arquivamento, pesquisa e isolamento de memória por projeto.
- Streaming de resposta, seleção de modelo e contabilização de custos.

### MVP 1.5 — importação de memória e conhecimento
- Importar exportação do ChatGPT (ZIP/JSON) mediante seleção e aprovação do usuário.
- Triagem de segredos, categorização por `app_id` e pasta de destino (`folder_id`), deduplicação, proveniência e recuperação semântica.
- Testes de importação incremental, exclusão e preservação de decisões versus propostas.

### MVP 2 — programação versionada
- Acesso controlado ao GitHub, CODEBASE_MAP.md e Context7 MCP; preparar Figma MCP para tarefas de UI.
- Workspace remoto isolado sob demanda.
- LangGraph: planejar → implementar → testar → revisar → documentar.
- PR automático com explicação e aprovação humana.

### MVP 3 — execução local supervisionada
- Canal seguro da extensão/executor leve para edição e testes locais sob comando online.
- Integração ComfyUI MCP (ponte de acesso segura) e testes com RTX 3080, respeitando permissões; validar em prova de conceito.
- Eventos, confirmação de resultados, recuperação e conciliação.

### MVP 3.5 — agente de apresentações na nuvem (capacidade incremental)
- Geração remota `.pptx` editável com templates e `python-pptx`; modo download sem conta Microsoft conectada.
- Microsoft Graph + OneDrive com OAuth e permissões mínimas; abertura e edição via PowerPoint para a Web.
- Versões de arquivo, ligação a `app_id`/`task_id`, aprovações e métricas de custo; integração Gamma opcional e adiada.

### MVP 4 — observabilidade e qualidade avançadas
- LangSmith, traces correlacionados e **painel nativo de Observabilidade no chat web e na extensão VS Code**: visão geral, traces, custos, filtros e investigação por conversa.
- Grafo de conhecimento entre decisões, arquivos, testes e PRs.
- Recuperação de estado, conflito e concorrência mais sofisticados.

> **Nota:** observabilidade mínima, IDs e auditoria devem existir desde o MVP 1; o MVP 4 aprofunda visualizações e análises.

## 15. Questões abertas (não decidir por suposição)

- Forma de autenticação e multiusuário: uso pessoal primeiro ou produto desde o início?
- Banco PostgreSQL gerenciado, custos e estratégia de migração/backup.
- Implementação do workspace remoto efêmero e seus limites de tempo, rede e armazenamento.
- Protocolo seguro de execução local quando o VS Code estiver aberto e quando estiver fechado.
- Nível de transmissão de patches/checkpoints e política de privacidade para arquivos locais.
- Modelo de retenção de traces LangSmith, dados sensíveis e custos.
- Validar OpenRouter MCP no backend Python, scopes/OAuth e disponibilidade das ferramentas de consulta; definir limites de despesa e frequência de reconciliação de custos.
- Estratégia de criação de branch e PR para tarefas pequenas ou simultâneas.
- Critérios mensuráveis de qualidade e aprovação de testes/documentação.
- Configuração de GitHub MCP, ComfyUI MCP, Context7 MCP, Figma MCP, Playwright MCP e Sentry MCP e permissões efetivas.
- Avaliar custos de Sentry e Firecrawl, e compatibilidade do Playwright MCP/CLI com os executores remotos.
- Definir escopo read-only e política de dados para eventual PostgreSQL MCP.
- Verificar autenticação, compatibilidade do cliente MCP customizado com o Figma remoto e eventuais limites de uso/plano.
- Validar conexão autenticada entre cérebro online e ComfyUI local, descoberta de workflows e monitoramento real de GPU; não expor a API local à internet.
- Política de aprovação de comandos sensíveis, testes GPU longos e deploys.
- Definir prazo de retenção do arquivo bruto de exportação, armazenamento de anexos e custo/limites de importações volumosas.
- Definir formatos efetivos e variações da exportação do ChatGPT que deverão ser aceitos; validar em amostras reais autorizadas.
- Definir regras de exclusão/restauração de pastas, limites de profundidade e tratamento de conversas quando uma pasta for removida.
- Confirmar tipo de assinatura Microsoft 365 (Personal/Family/empresarial), permissões Graph, escopos OAuth e local de armazenamento OneDrive.
- Validar geração/renderização de PPTX no executor remoto e compatibilidade de layouts no PowerPoint web; tratar fontes ausentes e exportação PDF como avaliação separada.
- Nome final, estrutura do monorepo e organização dos pacotes.

## 16. Registro de decisões

| Data | Decisão | Estado |
|---|---|---|
| 2026-11-23 | Um único cérebro online, não dois agentes independentes | Definida |
| 2026-11-23 | OpenRouter como provedor exclusivo de inferência de IA | Definida |
| 2026-11-23 | Medir tokens, custo real, latência, retries e qualidade por modelo/agente/tarefa; incluir MCP OpenRouter oficial como consulta complementar à API | Definida como especificação; integração pendente |
| 2026-11-23 | VS Code como IDE local, extensão DevHub como interface | Definida |
| 2026-11-23 | Chat web compartilhando memória e identidade com extensão | Definida |
| 2026-11-23 | Workspace remoto necessário para programação online real | Definida |
| 2026-11-23 | Cloud Run proposto para API/orquestração | Proposta aceita, dimensionamento pendente |
| 2026-11-23 | GitHub como hub e PR obrigatório ao fim de tarefa | Definida |
| 2026-11-23 | Aprovação humana antes do merge | Definida |
| 2026-11-23 | `CODEBASE_MAP.md` por repositório | Definida |
| 2026-11-23 | LangGraph/LangChain; LangSmith para observabilidade | Stack proposta |
| 2026-11-23 | Exibir observabilidade no DevHub web e VS Code, com LangSmith para investigação profunda e perguntas ao cérebro baseadas em evidências | Definida como requisito de interface; implementação pendente |
| 2026-11-23 | MCP Context7 e GitHub | Definida como integração planejada |
| 2026-11-23 | Formalizar GitHub MCP como integração essencial e ComfyUI MCP como ferramenta de GPU por aplicação | Definida como especificação; implementação pendente |
| 2026-11-23 | Cada aplicação possui `app_id` único | Definida |
| 2026-11-23 | Testador também cria e mantém arquivos de teste | Definida |
| 2026-11-23 | Incluir Figma MCP remoto no DevHub para design-to-code e documentação de UI | Integração planejada; autenticação e compatibilidade a validar |
| 2026-11-23 | Priorizar avaliação de Playwright MCP e Sentry MCP | Recomendação documentada; integração pendente |
| 2026-11-23 | Postgres MCP restrito; Firecrawl opcional; Linear adiado; Gemini MCP Tool não incluído | Avaliação documentada |

| 2026-11-23 | Separar CineForge (produção), editor com timeline (finalização) e CineForge Publisher (publicação e analytics); n8n MCP opcional no DevHub para desenvolver workflows, YouTube APIs/MCP e n8n operacionais no Publisher | Definida como arquitetura planejada; integrações pendentes |

| 2026-11-23 | Implementar importador de memória e conhecimento do ChatGPT, com seleção, revisão humana, `app_id`, proveniência, privacidade e deduplicação | Definida como requisito; implementação pendente |

| 2026-11-23 | Organizar conversas em projetos, pastas e subpastas, com memória compartilhada por `app_id`, conversas gerais, movimentação e importação com aprovação | Definida como requisito do MVP |

| 2026-11-23 | Integração Microsoft 365 para apresentações: DevHub gera PPTX editável em executor remoto, Microsoft Graph/OneDrive hospeda e PowerPoint web permite edição no Ubuntu, sem Office instalado | Definida como requisito; implementação pendente |

## 17. Histórico deste documento

- **v0.1.10 — 2026-11-23:** especificados o painel nativo de Observabilidade no chat web e extensão VS Code, visão geral, traces, custos, filtros, investigação conversacional, ligação ao LangSmith e critérios de aceitação.

- **v0.1.9 — 2026-11-23:** acrescentado agente de apresentações online, geração remota de `.pptx` com python-pptx, integração Microsoft Graph/OneDrive, edição via PowerPoint para a Web no Ubuntu, limites de licenciamento, segurança e critérios de aceitação.

- **v0.1.8 — 2026-11-23:** adicionada organização hierárquica de projetos, pastas/subpastas e conversas; isolamento e compartilhamento de memória por `app_id`, pesquisa, movimentação, importação por pasta, sincronização entre interfaces e critérios de aceitação no MVP.

- **v0.1.7 — 2026-11-23:** especificado importador seletivo e incremental de histórico/memória do ChatGPT, com triagem de dados sensíveis, classificação por aplicativo, rastreabilidade, revisão humana e critérios de aceitação; inserido no roadmap.

- **v0.1.6 — 2026-11-23:** observabilidade e eficiência econômica por modelo/atividade; seleção de modelos apoiada pelo MCP oficial OpenRouter, APIs de geração, analytics e créditos, mantendo API direta para inferência.

- **v0.1.5 — 2026-11-23:** acrescentadas instruções explícitas para a IA construtora, escopo positivo/negativo, fronteira entre DevHub e aplicativos clientes, processo obrigatório e critérios de aceitação iniciais.

- **v0.1.4 — 2026-11-23:** definição de responsabilidades entre CineForge, editor com timeline, CineForge Publisher e DevHub; localização de YouTube APIs/MCP e n8n/n8n MCP, fluxo editorial e controles de publicação.

- **v0.1.3 — 2026-11-23:** formalização do GitHub MCP como integração fundamental e inclusão do ComfyUI MCP oficial como ferramenta de execução supervisionada para workflows com GPU, com requisitos de segurança e rastreabilidade.

- **v0.1.2 — 2026-11-23:** avaliação dos sete MCPs do artigo Code Capital, priorização de Playwright e Sentry, diretrizes de segurança e integração ao Testador/observabilidade.

- **v0.1.1 — 2026-11-23:** adicionada integração planejada com Figma MCP remoto, papel de design de interface, rastreabilidade de design e pontos de validação.
- **v0.1.0 — 2026-11-23:** consolidação inicial das decisões discutidas; nenhuma implementação ou repositório criado por este documento.


## 18. Registro da primeira implementação — 2026-11-23

Este adendo registra a entrega de engenharia; os requisitos e decisões das seções 1–17 da especificação v0.1.10 foram preservados integralmente. Não é declaração de conclusão dos demais MVPs.

O MVP 1 foi construído com FastAPI, LangGraph, API OpenRouter, PostgreSQL, chat Vue 3 e extensão TypeScript VS Code, compartilhando um cérebro e histórico/memória persistidos. A escolha de identidade pessoal com token revogável e o destino Cloud Run/PostgreSQL gerenciado foram confirmados pelo proprietário. Memória aprovada lexical tem proveniência e isolamento por app_id; semântica/importação continuam no MVP 1.5. Organização, preview de movimento, streaming, tarefas, eventos, checkpoints e custos mínimos são reais, não dados demo.

Os testes locais e o smoke real OpenRouter estão documentados em `docs/VALIDATION.md`; código e responsabilidades em `CODEBASE_MAP.md`; instalação em `README.md`; resultados e pendências em `docs/IMPLEMENTATION_STATUS.md`. A imagem Docker e o deploy Cloud Run não foram executados neste sandbox, e o host gráfico do VS Code ainda exige teste manual. Nenhum serviço pago foi contratado nem PR/merge GitHub remoto foi realizado. A documentação de release prepara migrations separadas e PostgreSQL externo ao container.

Executor isolado, MCPs de programação/PR, execução local/ComfyUI, apresentações/OneDrive e observabilidade avançada permanecem nas fases previstas. Nenhum aplicativo futuro do DevHub foi implementado.
