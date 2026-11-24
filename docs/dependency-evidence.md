# Documentação de dependências consultada

Em 2026-11-23 foram consultadas páginas oficiais antes da implementação. Context7 não estava configurado nesta sessão; usamos documentação oficial compatível e testes executáveis, sem alegar que Context7 foi conectado.

LangGraph 1.0.3 usa StateGraph/START/END e `get_stream_writer()` em nós assíncronos Python 3.12. `astream(stream_mode="custom")` permite emitir eventos do cliente HTTP OpenRouter sem outro provedor de IA. A persistência de negócio do MVP está em PostgreSQL, não em um checkpointer InMemory. O grafo não tenta retomar/repetir inferência depois de crash; as tarefas antigas requerem reconciliação explícita.

Fonte consultada: [Streaming LangGraph](https://docs.langchain.com/oss/python/langgraph/streaming). O documento explica integração com qualquer cliente LLM externo e a restrição de async para Python abaixo de 3.11.

OpenRouter Chat Completions SSE usa `data:`/comentários/linhas vazias, frames de delta, um frame final de usage e `[DONE]`. `usage.include` e `stream_options.include_usage` estão obsoletos na documentação atual; não são enviados. A presença de HTTP 200 não prova sucesso: erros em meio ao stream são tratados. A resposta mantém tokens/custo como indisponíveis quando não retornados, sem estimar faturamento como custo confirmado.

Fontes: [Streaming OpenRouter](https://openrouter.ai/docs/api_reference/streaming) e [Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

Consulta HTTP pública ao catálogo OpenRouter confirmou 477 modelos no momento da implementação e existência de `openrouter/free`, preços prompt/completion zero e saída texto. O código consulta o catálogo atual, não fixa esse total nem assume que um modelo indisponível exista. A reserva de orçamento usa preços por token do catálogo e limites conservadores, nunca preços hardcoded.

Todas as versões diretas e transitivas estão registradas em `backend/uv.lock` e `pnpm-lock.yaml`. LangSmith é dependência transitiva de LangGraph, mas tracing externo está desabilitado explicitamente até aprovação de privacidade/retenção.
