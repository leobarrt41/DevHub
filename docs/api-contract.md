# Contrato do MVP 1

Prefixo `/api/v1`, JSON UTF-8, Bearer `DEVHUB_ACCESS_TOKEN` obrigatório para todos os dados privados `/api/v1`. Health, manifesto, assets e documentação OpenAPI são públicos. Frontend mantém credencial apenas em sessionStorage; extensão em SecretStorage vinculado à origem autorizada. GET `/api/v1/session` → `{owner_id, name, default_model, openrouter_configured, max_output_tokens, stale_task_seconds}`. Erro → `{detail: string|object}`. IDs UUID em strings, datas ISO, custo em USD decimal string ou null. Dados ausentes nunca são zero inventado.

## Organização

GET `/api/v1/tree?archived=false` → `{applications: Application[], folders: Folder[], conversations: Conversation[]}`. Objetos têm `app_id`/`folder_id`/`conversation_id`, `name` ou `title`, `archived`, `created_at`, `updated_at`. Application tem `slug`; Folder tem `app_id:null|string`, `parent_folder_id:null|string`; Conversation tem `app_id`, `folder_id`, `version`.

POST `/applications` `{name,slug?}`; PATCH `/applications/{app_id}` `{name?,archived?}`.
POST `/folders` `{name,app_id:null|string,parent_folder_id:null|string}`; PATCH `/folders/{folder_id}` `{name?,parent_folder_id?,archived?}`. Mudança de parent só no mesmo app; ciclos rejeitados. Arquivar pasta arquiva descendentes e conversas; reabrir não restaura conversas automaticamente.
POST `/conversations` `{title,app_id:null|string,folder_id:null|string}`; PATCH `/conversations/{conversation_id}` `{title?,archived?,app_id?,folder_id?,move_token?,approved_memory_ids?:string[]}`. Mover entre apps exige prévia. Todas as operações retornam objeto atualizado.
POST `/conversations/{conversation_id}/move-preview` `{app_id:null|string,folder_id:null|string}` → `{move_token,from_app_id,to_app_id,candidates:MemoryItem[],warning}`. PATCH precisa incluir exatamente o destino e token; seleção explícita dos candidates é o único conhecimento incorporado ao destino. Token expira, é vinculado à versão da conversa e não permite transferência silenciosa.
GET `/search?q=...&app_id=UUID|general&folder_id=UUID&conversation_id=UUID&category=decision|technical|preference&date_from=ISO&date_to=ISO&archived=false` → `{applications:Application[],folders:Folder[],conversations:Conversation[],memory_items:MemoryItem[]}`. Omitir app_id significa busca global de usuário proprietário; `general` limita ao escopo geral. Cada resultado respeita ownership. Filtros são opcionais, q tem 1–200 caracteres, datas usam criação e são normalizadas para UTC. Categoria restringe a memória; IDs de pasta/conversa devem ser compatíveis com o app informado. `archived=true` inclui ativos e arquivados; reabertura exige ancestrais ativos e não restaura filhos implicitamente.

## Chat e memória

GET `/conversations/{conversation_id}/messages` → Message[]. Message: `{message_id,conversation_id,role,content,status,task_id,created_at,context_sources:object[]}`. Roles user/assistant; status completed/streaming/failed/cancelled/interrupted.
POST `/conversations/{conversation_id}/messages/stream` `{content,model,request_id:UUID}` → SSE via fetch POST com Authorization. Eventos: `task` `{task_id,trace_id,status}`, `context` `{sources:MemoryItem[]}`, `delta` `{content:string}`, `done` `{task_id,message_id,status,usage:{prompt_tokens,completion_tokens,cost_usd,cost_status},duration_ms}`, `error` `{task_id?,message,code}`. SSE tem event/data separados por linha vazia. `request_id` evita gerar novamente em retries; repetir devolve 409 com task_id. Um stream só termina com done/error; desconexão não autoriza reexecutar. Tratar cancelamento/disconnect como resultado parcial e recarregar dados persistidos.
GET `/models` → `{models:[{id,name,context_length,pricing:{prompt,completion},...}],default_model}` do catálogo real OpenRouter; não lista modelos inventados.
GET `/memory?app_id=UUID|general&q=...` → MemoryItem[]. POST `/memory` `{app_id:null|string,content,category:'decision'|'technical'|'preference',source_message_id?:string}` exige origem do mesmo app. MemoryItem: `{memory_item_id,app_id,conversation_id,source_message_id,content,category,confirmation:'approved',created_at,source_label}`. Sem origem, source_label indica declaração explícita do usuário. DELETE `/memory/{memory_item_id}` remove com evento de auditoria. Conversas gerais não recebem memória de aplicações. Contexto recuperado referencia IDs da origem, sem concatenar todas as conversas.

## Tarefas e observabilidade mínima

GET `/tasks?app_id=UUID|general` → Task[]. GET `/tasks/{task_id}` → `{task:Task,events:Event[]}`. Task tem `task_id,conversation_id,app_id,status,model_id,trace_id,generation_id,input_tokens,output_tokens,cost_usd,cost_status,reserved_cost_usd,duration_ms,created_at,updated_at,error_code`. Event tem `event_id,task_id,app_id,sequence,kind,status,payload,created_at`. Sem prompts/segredos em eventos. GET `/observability?app_id=UUID|general` → `{total_tasks,completed_tasks,failed_tasks,active_tasks,confirmed_cost_usd,unaccounted_tasks,tasks:Task[]}`.
POST `/tasks/{task_id}/reconcile` retorna Task e apenas marca uma tarefa `running` antiga/sem confirmação como interrupted após limite de inatividade (600s por padrão, informado na sessão); nunca repete uma chamada. Tarefa com atividade recente devolve 409. Interfaces exigem confirmação explícita antes da ação. A API registra tarefas na transação antes da inferência e persiste resultados/custos antes de done.

## Fora deste contrato

MVP 2 (workspace/programação/PR), importação semântica do MVP 1.5, ComfyUI e apresentações não são endpoints simulados. Qualquer catálogo de integração deve indicar planejado/não conectado. A mesma API alimenta web e VS Code; sincronização da árvore por polling autenticado, nunca por segunda IA.
