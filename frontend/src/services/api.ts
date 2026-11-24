import type {
  Application,
  Conversation,
  Folder,
  MemoryCategory,
  MemoryItem,
  Message,
  ModelsResponse,
  MovePreview,
  ObservabilityResponse,
  SearchResponse,
  SearchFilter,
  SessionInfo,
  TaskDetailResponse,
  TreeResponse,
} from '../types/api';

const API_ROOT = '/api/v1';

type JsonBody = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  constructor(
    private readonly token: string,
    private readonly onUnauthorized?: () => void,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('Accept', headers.get('Accept') ?? 'application/json');
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    try {
      response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha de rede';
      throw new ApiError(`Não foi possível conectar à API: ${message}`, 0);
    }

    if (response.status === 401) this.onUnauthorized?.();
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
      const detail = payload?.detail;
      const message = typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object'
          ? JSON.stringify(detail)
          : `${response.status} ${response.statusText || 'Erro da API'}`;
      throw new ApiError(message, response.status, detail);
    }

    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  private json(method: string, body?: JsonBody): RequestInit {
    return { method, ...(body ? { body: JSON.stringify(body) } : {}) };
  }

  getSession(): Promise<SessionInfo> {
    return this.request('/session');
  }

  getTree(archived = false): Promise<TreeResponse> {
    return this.request(`/tree?archived=${archived ? 'true' : 'false'}`);
  }

  createApplication(body: { name: string; slug?: string }): Promise<Application> {
    return this.request('/applications', this.json('POST', body));
  }

  updateApplication(appId: string, body: { name?: string; archived?: boolean }): Promise<Application> {
    return this.request(`/applications/${encodeURIComponent(appId)}`, this.json('PATCH', body));
  }

  createFolder(body: { name: string; app_id: string | null; parent_folder_id: string | null }): Promise<Folder> {
    return this.request('/folders', this.json('POST', body));
  }

  updateFolder(folderId: string, body: { name?: string; parent_folder_id?: string | null; archived?: boolean }): Promise<Folder> {
    return this.request(`/folders/${encodeURIComponent(folderId)}`, this.json('PATCH', body));
  }

  createConversation(body: { title: string; app_id: string | null; folder_id: string | null }): Promise<Conversation> {
    return this.request('/conversations', this.json('POST', body));
  }

  updateConversation(
    conversationId: string,
    body: {
      title?: string;
      archived?: boolean;
      app_id?: string | null;
      folder_id?: string | null;
      move_token?: string;
      approved_memory_ids?: string[];
    },
  ): Promise<Conversation> {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}`, this.json('PATCH', body));
  }

  previewConversationMove(
    conversationId: string,
    destination: { app_id: string | null; folder_id: string | null },
  ): Promise<MovePreview> {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/move-preview`, this.json('POST', destination));
  }

  search(query: string, filter: SearchFilter = {}): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (filter.app_id !== undefined) params.set('app_id', filter.app_id);
    if (filter.folder_id !== undefined) params.set('folder_id', filter.folder_id);
    if (filter.conversation_id !== undefined) params.set('conversation_id', filter.conversation_id);
    if (filter.category !== undefined) params.set('category', filter.category);
    if (filter.date_from !== undefined) params.set('date_from', filter.date_from);
    if (filter.date_to !== undefined) params.set('date_to', filter.date_to);
    if (filter.archived !== undefined) params.set('archived', String(filter.archived));
    return this.request(`/search?${params.toString()}`);
  }

  getMessages(conversationId: string): Promise<Message[]> {
    return this.request(`/conversations/${encodeURIComponent(conversationId)}/messages`);
  }

  getModels(): Promise<ModelsResponse> {
    return this.request('/models');
  }

  async streamMessage(
    conversationId: string,
    body: { content: string; model: string; request_id: string },
    signal: AbortSignal,
  ): Promise<Response> {
    const response = await fetch(`${API_ROOT}/conversations/${encodeURIComponent(conversationId)}/messages/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    }).catch((error: unknown) => {
      if (signal.aborted) throw error;
      const message = error instanceof Error ? error.message : 'Falha de rede';
      throw new ApiError(`A conexão do stream falhou: ${message}`, 0);
    });

    if (response.status === 401) this.onUnauthorized?.();
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
      const detail = payload?.detail;
      const message = typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object'
          ? JSON.stringify(detail)
          : `${response.status} ${response.statusText || 'Erro da API'}`;
      throw new ApiError(message, response.status, detail);
    }
    if (!response.body) throw new ApiError('A API iniciou uma resposta sem corpo de streaming.', response.status);
    return response;
  }

  getMemory(appId: string | null, query?: string): Promise<MemoryItem[]> {
    const params = new URLSearchParams({ app_id: appId ?? 'general' });
    if (query?.trim()) params.set('q', query.trim());
    return this.request(`/memory?${params.toString()}`);
  }

  createMemory(body: {
    app_id: string | null;
    content: string;
    category: MemoryCategory;
    source_message_id?: string;
  }): Promise<MemoryItem> {
    return this.request('/memory', this.json('POST', body));
  }

  deleteMemory(memoryItemId: string): Promise<void> {
    return this.request(`/memory/${encodeURIComponent(memoryItemId)}`, this.json('DELETE'));
  }

  getObservability(appId?: string | null): Promise<ObservabilityResponse> {
    const params = new URLSearchParams();
    if (appId !== undefined) params.set('app_id', appId ?? 'general');
    const query = params.toString();
    return this.request(`/observability${query ? `?${query}` : ''}`);
  }

  getTaskDetail(taskId: string): Promise<TaskDetailResponse> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}`);
  }

  reconcileTask(taskId: string): Promise<unknown> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/reconcile`, this.json('POST'));
  }
}

export function formatCost(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Indisponível';
  return `US$ ${value}`;
}
