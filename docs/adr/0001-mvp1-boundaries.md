# ADR 0001 — limites da primeira fatia funcional

Status: decisão de implementação para MVP 1, 2026-11-23. Fonte normativa: DEVHUB_AI.md v0.1.10. Usuário confirmou uso pessoal com token revogável, destino Cloud Run e PostgreSQL gerenciado, sem contratar/deploy externo nesta tarefa.

Mantemos Vue 3/TypeScript, FastAPI/Python, LangGraph e OpenRouter exclusivo. Inicialização WebDev é usada apenas para código/Preview no Manus, não substitui o destino Google Cloud nem usa MySQL ou LLM Manus no produto. PostgreSQL local no sandbox serve testes; PostgreSQL gerenciado será conectado por DATABASE_URL quando autorizado. O próprio token da aplicação difere de senhas/chaves OpenRouter e não é embutido nos clientes.

Web e extensão consultam a mesma API e IDs; sincronização por polling autenticado a cada 10 segundos é uma primeira implementação verificável, não sincronização bidirecional fictícia. Dados operacionais e checkpoints estão em SQL. O grafo não usa InMemory como memória principal e não tenta replay automático de chamada paga em interrupção. Reconciliação explícita marca resultado incerto sem inventar recuperação de bytes não recebidos.

A recuperação de conhecimento do MVP 1 é lexical e apenas de itens aprovados do mesmo app_id. Pesquisa vetorial/semântica e o importador ChatGPT pertencem ao MVP 1.5. Uma memória de origem pode ser copiada na movimentação entre projetos somente com prévia assinada e seleção explícita. Históricos próprios não são concatenados no prompt de outras conversas; só trechos aprovados com origem entram como contexto.

Não implementamos ainda workspace/executor/PR no produto. Expor subprocesso/Docker socket dentro de FastAPI violaria isolamento e confundiria planejamento com execução; não será usado como atalho. GitHub MCP/Context7 e executor dedicado são MVP 2 e precisam de configuração/autorização. Não construir os aplicativos exemplos, GPU workloads, apresentações ou Publisher.

Consequências: este MVP pode conversar e manter continuidade real entre interfaces, mas não programa repositórios nem cria PR de tarefa pelo próprio DevHub. Container e instruções de release são preparados; deploy e imagem Cloud Run só poderão ser declarados validados após execução autorizada. Tracing externo LangSmith está explicitamente desativado até política de dados/retenção ser aprovada; eventos mínimos locais não contêm prompts nem chaves.
