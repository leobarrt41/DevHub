import type { SecretStorage } from "vscode";
import {
  buildApiUrl,
  parseSseFrames,
  validateBackendUrl,
  type SseFrame,
} from "./utils";
import type {
  ModelsResponse,
  ObservabilityResponse,
  SessionResponse,
  TaskDetailsResponse,
  TreeResponse,
} from "./types";

export const LEGACY_TOKEN_SECRET_KEY = "devhub.accessToken";
export const AUTHORIZED_ORIGIN_SECRET_KEY = "devhub.authorizedOrigin";
const TOKEN_SECRET_PREFIX = `${LEGACY_TOKEN_SECRET_KEY}.origin.`;

function tokenSecretKeyForOrigin(origin: string): string {
  return `${TOKEN_SECRET_PREFIX}${encodeURIComponent(origin)}`;
}

export class DevHubApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "DevHubApiError";
  }
}

export interface StreamCallbacks {
  onEvent: (event: string, data: Record<string, unknown>) => void;
  onInterrupted: () => void;
}

export class DevHubApi {
  constructor(
    private readonly backendUrl: () => string,
    private readonly secrets: SecretStorage,
  ) {}

  async hasToken(): Promise<boolean> {
    let origin: string;
    try {
      origin = this.currentOrigin();
    } catch {
      return false;
    }
    const authorizedOrigin = await this.secrets.get(AUTHORIZED_ORIGIN_SECRET_KEY);
    if (authorizedOrigin !== origin) {
      return false;
    }
    return Boolean(await this.secrets.get(tokenSecretKeyForOrigin(origin)));
  }

  /** Store a credential only after an explicit connect action for this exact origin. */
  async bindToken(origin: string, token: string): Promise<void> {
    const normalizedOrigin = validateBackendUrl(origin);
    if (normalizedOrigin !== origin) {
      throw new Error("A origem do backend mudou. Execute DevHub: Conectar novamente.");
    }
    if (this.currentOrigin() !== normalizedOrigin) {
      throw new Error("A origem do backend mudou. Execute DevHub: Conectar novamente.");
    }
    const cleanToken = token.trim();
    if (!cleanToken) {
      throw new Error("Informe um token pessoal DevHub.");
    }

    const previousOrigin = await this.secrets.get(AUTHORIZED_ORIGIN_SECRET_KEY);
    if (this.currentOrigin() !== normalizedOrigin) {
      throw new Error("A origem do backend mudou. Execute DevHub: Conectar novamente.");
    }
    await this.secrets.store(tokenSecretKeyForOrigin(normalizedOrigin), cleanToken);
    await this.secrets.store(AUTHORIZED_ORIGIN_SECRET_KEY, normalizedOrigin);
    await this.secrets.delete(LEGACY_TOKEN_SECRET_KEY);
    if (previousOrigin && previousOrigin !== normalizedOrigin) {
      await this.secrets.delete(tokenSecretKeyForOrigin(previousOrigin));
    }
  }

  /** Remove the active binding before deleting its origin-scoped credential. */
  async clearBoundToken(expectedOrigin?: string): Promise<void> {
    const authorizedOrigin = await this.secrets.get(AUTHORIZED_ORIGIN_SECRET_KEY);
    if (expectedOrigin !== undefined && authorizedOrigin !== expectedOrigin) {
      return;
    }
    if (authorizedOrigin) {
      await this.secrets.delete(AUTHORIZED_ORIGIN_SECRET_KEY);
      await this.secrets.delete(tokenSecretKeyForOrigin(authorizedOrigin));
    } else {
      await this.secrets.delete(AUTHORIZED_ORIGIN_SECRET_KEY);
    }
    // The legacy key is never read, but remove it when the user disconnects or reconnects.
    await this.secrets.delete(LEGACY_TOKEN_SECRET_KEY);
  }

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: "GET" }, query);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async getTree(archived = false): Promise<TreeResponse> {
    return this.get<TreeResponse>("/api/v1/tree", { archived: String(archived) });
  }

  async getSession(): Promise<SessionResponse> {
    return this.get<SessionResponse>("/api/v1/session");
  }

  async getModels(): Promise<ModelsResponse> {
    return this.get<ModelsResponse>("/api/v1/models");
  }

  async getTaskDetails(taskId: string): Promise<TaskDetailsResponse> {
    return this.get<TaskDetailsResponse>(`/api/v1/tasks/${encodeURIComponent(taskId)}`);
  }

  async streamConversation(
    conversationId: string,
    body: { content: string; model: string; request_id: string },
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const origin = this.currentOrigin();
    const token = await this.requireToken(origin);
    const url = buildApiUrl(
      origin,
      `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/stream`,
    );
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        callbacks.onInterrupted();
        return;
      }
      throw error;
    }

    if (!response.ok) {
      throw await this.httpError(response, token);
    }
    if (!response.body) {
      callbacks.onInterrupted();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let terminalEventSeen = false;
    const dispatch = (frame: SseFrame): void => {
      if (!frame.data.trim()) {
        return;
      }
      const decoded: unknown = JSON.parse(frame.data);
      if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
        throw new Error("Evento SSE inválido.");
      }
      const event = frame.event;
      callbacks.onEvent(event, decoded as Record<string, unknown>);
      if (event === "done" || event === "error") {
        terminalEventSeen = true;
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          const finalResult = parseSseFrames(buffer, true);
          for (const frame of finalResult.frames) {
            dispatch(frame);
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseFrames(buffer);
        buffer = parsed.remainder;
        for (const frame of parsed.frames) {
          dispatch(frame);
        }
        if (terminalEventSeen) {
          await reader.cancel();
          break;
        }
      }
    } catch {
      await reader.cancel().catch(() => undefined);
      callbacks.onInterrupted();
      return;
    }

    if (!terminalEventSeen) {
      callbacks.onInterrupted();
    }
  }

  async getObservability(appId: string): Promise<ObservabilityResponse> {
    return this.get<ObservabilityResponse>("/api/v1/observability", { app_id: appId });
  }

  private async request<T>(path: string, init: RequestInit, query?: Record<string, string>): Promise<T> {
    // Capture once before any await: credentials and request URL must share the same origin.
    const origin = this.currentOrigin();
    const token = await this.requireToken(origin);
    const url = new URL(buildApiUrl(origin, path));
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
      }
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      throw await this.httpError(response, token);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private currentOrigin(): string {
    return validateBackendUrl(this.backendUrl());
  }

  private async requireToken(origin: string): Promise<string> {
    const authorizedOrigin = await this.secrets.get(AUTHORIZED_ORIGIN_SECRET_KEY);
    if (authorizedOrigin !== origin) {
      throw new Error("Token não autorizado para a origem atual. Execute DevHub: Conectar.");
    }
    const token = await this.secrets.get(tokenSecretKeyForOrigin(origin));
    if (!token) {
      throw new Error("Conecte sua conta DevHub pelo comando ‘DevHub: Conectar’.");
    }
    // Recheck in case a disconnect or another explicit binding occurred during secret reads.
    if (await this.secrets.get(AUTHORIZED_ORIGIN_SECRET_KEY) !== origin) {
      throw new Error("Token não autorizado para a origem atual. Execute DevHub: Conectar.");
    }
    return token;
  }

  private async httpError(response: Response, token: string): Promise<DevHubApiError> {
    let detail = `HTTP ${response.status}`;
    try {
      const payload: unknown = await response.json();
      if (typeof payload === "object" && payload !== null && "detail" in payload) {
        const value = (payload as { detail?: unknown }).detail;
        detail = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
      }
    } catch {
      // Keep a status-only error when the backend response is not JSON.
    }
    if (token) {
      detail = detail.split(token).join("[redacted]");
    }
    return new DevHubApiError(`Backend DevHub (${response.status}): ${detail}`, response.status);
  }
}
