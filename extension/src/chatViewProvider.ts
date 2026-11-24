import { randomBytes, randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { DevHubApi } from "./api";
import type { Message, ModelInfo } from "./types";
import type { TreeNode } from "./treeProvider";

interface WebviewMessage {
  type?: unknown;
  content?: unknown;
  model?: unknown;
}

export class ChatViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private selectedConversation: TreeNode | undefined;
  private activeStream = false;
  private activeStreamController: AbortController | undefined;
  private modelIds = new Set<string>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly api: DevHubApi,
    private readonly refreshTree: () => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = this.getHtml(view.webview);
    this.disposables.push(view.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleWebviewMessage(message);
    }));
    this.disposables.push(view.onDidDispose(() => {
      this.view = undefined;
    }));
  }

  selectConversation(node: TreeNode): void {
    if (node.kind !== "conversation") {
      return;
    }
    this.selectedConversation = node;
    if (this.view) {
      void this.loadConversation(node);
    }
  }

  updateConversationTitle(conversationId: string, title: string): void {
    if (this.selectedConversation?.id !== conversationId) {
      return;
    }
    this.selectedConversation = { ...this.selectedConversation, label: title };
    if (this.view) {
      void this.loadConversation(this.selectedConversation);
    }
  }

  async refresh(): Promise<void> {
    if (this.selectedConversation) {
      await this.loadConversation(this.selectedConversation);
    } else {
      this.post("idle");
    }
  }

  dispose(): void {
    this.cancelActiveStream();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  cancelActiveStream(): void {
    this.activeStreamController?.abort();
  }

  private async handleWebviewMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "ready") {
      if (this.selectedConversation) {
        await this.loadConversation(this.selectedConversation);
      } else {
        this.post("idle");
      }
      return;
    }
    if (message.type === "send") {
      await this.sendMessage(message);
    }
  }

  private async loadConversation(node: TreeNode): Promise<void> {
    if (!this.view || this.selectedConversation?.id !== node.id) {
      return;
    }
    this.post("loading", node.id, { title: node.label });
    try {
      if (!(await this.api.hasToken())) {
        this.post("backendStatus", node.id, { message: "Conecte pelo comando DevHub: Conectar para carregar histórico." });
        this.post("history", node.id, { title: node.label, messages: [] });
        this.post("models", node.id, { models: [], defaultModel: null });
        return;
      }

      const [messagesResult, modelsResult] = await Promise.allSettled([
        this.api.get<Message[]>(`/api/v1/conversations/${encodeURIComponent(node.id)}/messages`),
        this.api.getModels(),
      ]);
      if (this.selectedConversation?.id !== node.id) {
        return;
      }

      if (modelsResult.status === "fulfilled") {
        const models = modelsResult.value.models.filter((model): model is ModelInfo => typeof model.id === "string" && model.id.length > 0);
        this.modelIds = new Set(models.map((model) => model.id));
        this.post("models", node.id, { models, defaultModel: modelsResult.value.default_model });
      } else {
        this.modelIds.clear();
        this.post("models", node.id, { models: [], defaultModel: null });
        this.post("backendStatus", node.id, { message: `Catálogo de modelos indisponível: ${this.errorMessage(modelsResult.reason)}` });
      }

      if (messagesResult.status === "fulfilled") {
        this.post("history", node.id, { title: node.label, messages: messagesResult.value });
      } else {
        this.post("history", node.id, { title: node.label, messages: [] });
        this.post("backendStatus", node.id, { message: `Não foi possível carregar o histórico: ${this.errorMessage(messagesResult.reason)}` });
      }
    } catch (error) {
      this.post("backendStatus", node.id, { message: this.errorMessage(error) });
    }
  }

  private async sendMessage(message: WebviewMessage): Promise<void> {
    const conversation = this.selectedConversation;
    if (!conversation || conversation.kind !== "conversation") {
      this.post("error", undefined, { message: "Selecione uma conversa antes de enviar." });
      return;
    }
    if (this.activeStream) {
      this.post("error", conversation.id, { message: "Já existe um stream ativo; aguarde a conclusão ou interrupção." });
      return;
    }
    const content = typeof message.content === "string" ? message.content.trim() : "";
    const model = typeof message.model === "string" ? message.model : "";
    if (!content) {
      this.post("error", conversation.id, { message: "A mensagem está vazia." });
      return;
    }
    if (!model || !this.modelIds.has(model)) {
      this.post("error", conversation.id, { message: "Escolha um modelo presente no catálogo real do backend." });
      return;
    }

    const conversationId = conversation.id;
    const requestId = randomUUID();
    const controller = new AbortController();
    this.activeStreamController = controller;
    this.activeStream = true;
    let streamInterrupted = false;
    this.post("streamStart", conversationId, {});
    try {
      await this.api.streamConversation(conversationId, {
        content,
        model,
        request_id: requestId,
      }, {
        onEvent: (event, data) => {
          this.post(event, conversationId, data);
          if (event === "done" || event === "error") {
            void this.refreshTree();
          }
        },
        onInterrupted: () => {
          streamInterrupted = true;
        },
      }, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.post("error", conversationId, { message: this.errorMessage(error) });
      }
    } finally {
      if (this.activeStreamController === controller) {
        this.activeStreamController = undefined;
      }
      this.activeStream = false;
      await this.refreshTree();
      if (this.selectedConversation?.id === conversationId) {
        await this.reloadHistory(conversation);
        if (streamInterrupted) {
          this.post("streamInterrupted", conversationId, {});
        }
      }
    }
  }

  private async reloadHistory(node: TreeNode): Promise<void> {
    try {
      const messages = await this.api.get<Message[]>(`/api/v1/conversations/${encodeURIComponent(node.id)}/messages`);
      if (this.selectedConversation?.id === node.id) {
        this.post("history", node.id, { title: node.label, messages });
      }
    } catch (error) {
      if (this.selectedConversation?.id === node.id) {
        this.post("backendStatus", node.id, { message: `Falha ao recarregar histórico persistido: ${this.errorMessage(error)}` });
      }
    }
  }

  private post(type: string, conversationId?: string, payload: Record<string, unknown> = {}): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({
      type,
      ...(conversationId ? { conversationId } : {}),
      ...payload,
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Falha desconhecida ao falar com o backend.";
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(18).toString("base64");
    const stylesheet = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "chat.css"));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", "chat.js"));
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; connect-src 'none'; font-src ${webview.cspSource};">
  <link rel="stylesheet" href="${stylesheet}">
  <title>DevHub AI Chat</title>
</head>
<body>
  <header><div class="brand">DevHub AI · Chat</div><div id="status" role="status" aria-live="polite">Selecione uma conversa.</div></header>
  <div id="taskMeta" aria-live="polite"></div>
  <div id="contextPanel" aria-label="Fontes de contexto"></div>
  <main id="messages" aria-live="polite"></main>
  <form id="composer">
    <label class="hint" for="model">Modelo do catálogo do backend</label>
    <select id="model" aria-label="Modelo"></select>
    <label class="hint" for="content">Mensagem</label>
    <textarea id="content" placeholder="Escreva para o cérebro online do DevHub…" required></textarea>
    <button id="send" class="primary" type="submit">Enviar</button>
    <div class="hint">Mensagens são enviadas ao backend central. Nenhum código local é executado.</div>
  </form>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
