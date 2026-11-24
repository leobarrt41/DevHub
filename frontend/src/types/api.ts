export interface SessionInfo {
  owner_id: string;
  name: string;
  default_model: string;
  openrouter_configured: boolean;
  max_output_tokens: number;
}

export interface Application {
  app_id: string;
  name: string;
  slug: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  folder_id: string;
  app_id: string | null;
  parent_folder_id: string | null;
  name: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  conversation_id: string;
  app_id: string | null;
  folder_id: string | null;
  title: string;
  archived: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TreeResponse {
  applications: Application[];
  folders: Folder[];
  conversations: Conversation[];
}

export type MessageRole = 'user' | 'assistant';
export type MessageStatus = 'completed' | 'streaming' | 'failed' | 'cancelled' | 'interrupted';

export interface Message {
  message_id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  task_id: string | null;
  created_at: string;
  context_sources: unknown[];
}

export type MemoryCategory = 'decision' | 'technical' | 'preference';

export interface MemoryItem {
  memory_item_id: string;
  app_id: string | null;
  conversation_id: string | null;
  source_message_id: string | null;
  content: string;
  category: MemoryCategory;
  confirmation: 'approved';
  created_at: string;
  source_label: string;
}

export interface ModelPricing {
  prompt: string | number | null;
  completion: string | number | null;
}

export interface ModelInfo {
  id: string;
  name: string;
  context_length: number | null;
  pricing: ModelPricing;
  [key: string]: unknown;
}

export interface ModelsResponse {
  models: ModelInfo[];
  default_model: string;
}

export interface MovePreview {
  move_token: string;
  from_app_id: string | null;
  to_app_id: string | null;
  candidates: MemoryItem[];
  warning: string;
}

export interface SearchResponse {
  applications: Application[];
  folders: Folder[];
  conversations: Conversation[];
  memory_items: MemoryItem[];
}

export interface SearchFilter {
  /** Omitido = busca global autorizada; `general` = conversas gerais; UUID = projeto. */
  app_id?: string;
  folder_id?: string;
  conversation_id?: string;
  category?: MemoryCategory;
  date_from?: string;
  date_to?: string;
  /** A API interpreta true como incluir ativos e arquivados. */
  archived?: boolean;
}

export interface SearchRequest {
  query: string;
  filter: SearchFilter;
}

export interface Task {
  task_id: string;
  conversation_id: string;
  app_id: string | null;
  status: string;
  model_id: string | null;
  trace_id: string | null;
  generation_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  cost_status: string | null;
  reserved_cost_usd: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
  error_code: string | null;
}

export interface TaskEvent {
  event_id: string;
  task_id: string;
  app_id: string | null;
  sequence: number;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TaskDetailResponse {
  task: Task;
  events: TaskEvent[];
}

export interface ObservabilityResponse {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  active_tasks: number;
  confirmed_cost_usd: string | null;
  unaccounted_tasks: number;
  tasks: Task[];
}

export interface StreamTaskEvent {
  task_id: string;
  trace_id: string;
  status: string;
}

export interface StreamContextEvent {
  sources: MemoryItem[];
}

export interface StreamDoneEvent {
  task_id: string;
  message_id: string;
  status: string;
  usage: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    cost_usd: string | null;
    cost_status: string | null;
  };
  duration_ms: number | null;
}

export interface StreamErrorEvent {
  task_id?: string | null;
  message: string;
  code?: string | null;
}

export interface ApiErrorPayload {
  detail?: string | Record<string, unknown>;
}
