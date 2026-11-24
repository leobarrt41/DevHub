import * as vscode from "vscode";
import { AUTHORIZED_ORIGIN_SECRET_KEY, DevHubApi, DevHubApiError } from "./api";
import { ChatViewProvider } from "./chatViewProvider";
import type { Application, Conversation, Folder, MemoryItem, MovePreview, ObservabilityResponse, SearchResponse, Task } from "./types";
import { eligibleReparentFolderIds, formatCostUsd, validateBackendUrl } from "./utils";
import { DevHubTreeProvider, type TreeNode } from "./treeProvider";

interface DestinationChoice extends vscode.QuickPickItem {
  appId: string | null;
  folderId: string | null;
}

interface ArchiveChoice extends vscode.QuickPickItem {
  node: TreeNode;
}

interface ParentChoice extends vscode.QuickPickItem {
  parentFolderId: string | null;
}

interface SearchScopeChoice extends vscode.QuickPickItem {
  appId?: string;
}

interface SearchChoice extends vscode.QuickPickItem {
  resultKind: "project" | "folder" | "conversation" | "memory";
  node?: TreeNode;
  content?: string;
}

function backendUrl(): string {
  return vscode.workspace.getConfiguration("devhub").get<string>("backendUrl", "http://localhost:8000");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Falha inesperada na extensão DevHub.";
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const api = new DevHubApi(backendUrl, context.secrets);
  const tree = new DevHubTreeProvider(api);
  const treeView = vscode.window.createTreeView("devhub.tree", {
    treeDataProvider: tree,
    showCollapseAll: true,
  });
  const chat = new ChatViewProvider(context.extensionUri, api, () => tree.refresh());
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.name = "DevHub AI";
  status.command = "devhub.connect";
  context.subscriptions.push(
    tree,
    treeView,
    chat,
    status,
    vscode.window.registerWebviewViewProvider("devhub.chat", chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const updateStatus = async (): Promise<void> => {
    const connected = await api.hasToken();
    status.text = connected ? "$(plug) DevHub" : "$(plug) Conectar DevHub";
    status.tooltip = connected ? "DevHub conectado; clique para atualizar" : "Conectar token pessoal do DevHub";
    status.command = connected ? "devhub.refresh" : "devhub.connect";
    status.show();
  };

  const register = (command: string, callback: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
  };

  register("devhub.connect", async () => {
    let normalizedBackend: string;
    try {
      normalizedBackend = validateBackendUrl(backendUrl());
    } catch (error) {
      void vscode.window.showErrorMessage(errorText(error));
      return;
    }
    const token = await vscode.window.showInputBox({
      title: "Conectar ao DevHub",
      prompt: `Token pessoal para ${normalizedBackend}`,
      placeHolder: "Cole o token de acesso pessoal",
      password: true,
      ignoreFocusOut: true,
    });
    if (!token || !token.trim()) {
      return;
    }
    chat.cancelActiveStream();
    try {
      await api.bindToken(normalizedBackend, token.trim());
      await api.getSession();
      await updateStatus();
      await tree.refresh();
      await chat.refresh();
      void vscode.window.showInformationMessage("Token aceito; conexão DevHub pronta.");
    } catch (error) {
      if (error instanceof DevHubApiError && (error.status === 401 || error.status === 403)) {
        await api.clearBoundToken(normalizedBackend);
      }
      await updateStatus();
      void vscode.window.showErrorMessage(`Falha ao validar a conexão: ${errorText(error)}`);
    }
  });

  register("devhub.disconnect", async () => {
    const answer = await vscode.window.showWarningMessage(
      "Remover o token pessoal DevHub deste armazenamento seguro?",
      { modal: true },
      "Desconectar",
    );
    if (answer !== "Desconectar") {
      return;
    }
    chat.cancelActiveStream();
    await api.clearBoundToken();
    await tree.refresh();
    await chat.refresh();
    await updateStatus();
  });

  register("devhub.refresh", async () => {
    await tree.refresh(true);
    await chat.refresh();
  });

  register("devhub.createProject", async () => {
    const name = await vscode.window.showInputBox({
      title: "Criar projeto DevHub",
      prompt: "Nome do projeto",
      validateInput: (value) => value.trim() ? undefined : "Informe um nome.",
    });
    if (!name?.trim()) return;
    try {
      await api.post<Application>("/api/v1/applications", { name: name.trim() });
      await tree.refresh();
      void vscode.window.showInformationMessage("Projeto criado no backend DevHub.");
    } catch (error) {
      void vscode.window.showErrorMessage(errorText(error));
    }
  });

  register("devhub.createFolder", async (...args: unknown[]) => {
    const node = asTreeNode(args[0]);
    const target = node ? targetFromNode(node) : await pickDestination(tree, "Selecione o projeto, a pasta-pai ou Conversas gerais.");
    if (!target) return;
    const name = await vscode.window.showInputBox({
      title: "Criar pasta DevHub",
      prompt: "Nome da pasta",
      validateInput: (value) => value.trim() ? undefined : "Informe um nome.",
    });
    if (!name?.trim()) return;
    try {
      await api.post<Folder>("/api/v1/folders", {
        name: name.trim(),
        app_id: target.appId,
        parent_folder_id: target.folderId,
      });
      await tree.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(errorText(error));
    }
  });

  register("devhub.createConversation", async (...args: unknown[]) => {
    const node = asTreeNode(args[0]);
    const target = node ? targetFromNode(node) : await pickDestination(tree, "Selecione o destino da conversa.");
    if (!target) return;
    const title = await vscode.window.showInputBox({
      title: "Criar conversa DevHub",
      prompt: "Título da conversa",
      validateInput: (value) => value.trim() ? undefined : "Informe um título.",
    });
    if (!title?.trim()) return;
    try {
      const conversation = await api.post<Conversation>("/api/v1/conversations", {
        title: title.trim(),
        app_id: target.appId,
        folder_id: target.folderId,
      });
      await tree.refresh();
      const conversationNode: TreeNode = {
        kind: "conversation",
        id: conversation.conversation_id,
        label: conversation.title,
        appId: conversation.app_id,
        folderId: conversation.folder_id,
      };
      await vscode.commands.executeCommand("workbench.view.extension.devhub");
      chat.selectConversation(conversationNode);
    } catch (error) {
      void vscode.window.showErrorMessage(errorText(error));
    }
  });

  register("devhub.openConversation", async (...args: unknown[]) => {
    let node = asTreeNode(args[0]);
    if (!node || node.kind !== "conversation") {
      const conversations = tree.getConversations();
      const choices = conversations.map((conversation) => ({
        label: conversation.title,
        description: conversation.conversation_id.slice(0, 8),
        node: conversationToNode(conversation),
      }));
      const selected = await vscode.window.showQuickPick(choices, { placeHolder: "Abrir conversa compartilhada" });
      node = selected?.node;
    }
    if (!node || node.kind !== "conversation") return;
    await vscode.commands.executeCommand("workbench.view.extension.devhub");
    chat.selectConversation(node);
    await revealTreeNode(treeView, node);
  });

  register("devhub.renameItem", async (...args: unknown[]) => {
    let node = asTreeNode(args[0]);
    if (!node || node.kind === "general") {
      const selected = await vscode.window.showQuickPick<ArchiveChoice>(organizableChoices(tree), {
        placeHolder: "Selecione projeto, pasta ou conversa para renomear",
        matchOnDescription: true,
      });
      node = selected?.node;
    }
    if (!node || node.kind === "general") return;
    const name = await vscode.window.showInputBox({
      title: `Renomear ${node.kind === "project" ? "projeto" : node.kind === "folder" ? "pasta" : "conversa"}`,
      value: node.label,
      prompt: "Novo nome",
      validateInput: (value) => value.trim() ? undefined : "Informe um nome.",
    });
    if (!name?.trim()) return;
    const label = name.trim();
    try {
      const id = encodeURIComponent(node.id);
      if (node.kind === "project") {
        await api.patch<Application>(`/api/v1/applications/${id}`, { name: label });
      } else if (node.kind === "folder") {
        await api.patch<Folder>(`/api/v1/folders/${id}`, { name: label });
      } else {
        await api.patch<Conversation>(`/api/v1/conversations/${id}`, { title: label });
        chat.updateConversationTitle(node.id, label);
      }
      await tree.refresh();
      await revealTreeNode(treeView, { ...node, label });
      void vscode.window.showInformationMessage("Item renomeado no backend DevHub.");
    } catch (error) {
      void vscode.window.showErrorMessage(errorText(error));
    }
  });

  register("devhub.reparentFolder", async (...args: unknown[]) => {
    let node = asTreeNode(args[0]);
    if (!node || node.kind !== "folder") {
      const selected = await vscode.window.showQuickPick<ArchiveChoice>(organizableChoices(tree).filter((choice) => choice.node.kind === "folder"), {
        placeHolder: "Selecione a pasta que será movida dentro do mesmo projeto",
        matchOnDescription: true,
      });
      node = selected?.node;
    }
    if (!node || node.kind !== "folder") return;

    const folders = tree.getFolders(true);
    const source = folders.find((folder) => folder.folder_id === node?.id);
    if (!source) {
      void vscode.window.showErrorMessage("A pasta não está na árvore carregada. Atualize a árvore e tente novamente.");
      return;
    }
    if (source.app_id && tree.getApplications(true).find((app) => app.app_id === source.app_id)?.archived) {
      void vscode.window.showInformationMessage("Reabra o projeto antes de mover uma pasta; o backend só aceita destinos ativos.");
      return;
    }

    const eligibleIds = new Set(eligibleReparentFolderIds(source.folder_id, folders));
    const choices: ParentChoice[] = [];
    if (source.parent_folder_id !== null) {
      choices.push({
        label: source.app_id ? "Raiz do projeto" : "Raiz de Conversas gerais",
        description: source.app_id ? applicationName(tree.getApplications(true), source.app_id) : "Sem pasta-pai",
        parentFolderId: null,
      });
    }
    choices.push(...folders
      .filter((folder) => !folder.archived && eligibleIds.has(folder.folder_id) && folder.folder_id !== source.parent_folder_id)
      .map((folder) => ({
        label: folder.app_id ? `${applicationName(tree.getApplications(true), folder.app_id)} / ${folderPath(folder, folders)}` : `Conversas gerais / ${folderPath(folder, folders)}`,
        description: folder.folder_id.slice(0, 8),
        parentFolderId: folder.folder_id,
      })));
    if (choices.length === 0) {
      void vscode.window.showInformationMessage("Não há outro destino ativo permitido para esta pasta neste app.");
      return;
    }
    const destination = await vscode.window.showQuickPick(choices, {
      placeHolder: "Escolha uma pasta-pai no mesmo app; a própria pasta e seus descendentes não aparecem.",
      matchOnDescription: true,
    });
    if (!destination) return;
    try {
      const updated = await api.patch<Folder>(`/api/v1/folders/${encodeURIComponent(source.folder_id)}`, {
        parent_folder_id: destination.parentFolderId,
      });
      await tree.refresh();
      await revealTreeNode(treeView, folderToNode(updated));
      void vscode.window.showInformationMessage(`Pasta movida para “${destination.label}”.`);
    } catch (error) {
      void vscode.window.showErrorMessage(errorText(error));
    }
  });

  register("devhub.toggleArchived", async () => {
    const showing = tree.toggleArchived();
    await tree.refresh(true);
    void vscode.window.showInformationMessage(showing ? "Itens arquivados incluídos na árvore." : "Itens arquivados ocultos na árvore.");
  });

  register("devhub.restoreItem", async (...args: unknown[]) => {
    let node = asTreeNode(args[0]);
    if (!node || !node.archived || node.kind === "general") {
      if (!tree.archivedVisible) {
        tree.toggleArchived();
        await tree.refresh(true);
      }
      const selected = await vscode.window.showQuickPick<ArchiveChoice>(archivedChoices(tree), {
        placeHolder: "Selecione um item arquivado para reabrir",
        matchOnDescription: true,
      });
      node = selected?.node;
    }
    if (!node || !node.archived || node.kind === "general") return;
    await restoreItem(api, tree, treeView, chat, node);
  });

  register("devhub.search", async () => {
    const q = await vscode.window.showInputBox({
      title: "Pesquisar no DevHub",
      prompt: "Pesquise projetos, pastas, conversas e memória no backend compartilhado",
      placeHolder: "Texto de 1 a 200 caracteres",
      validateInput: (value) => value.trim().length >= 1 && value.trim().length <= 200
        ? undefined
        : "Informe de 1 a 200 caracteres.",
    });
    if (!q?.trim()) return;
    const scopes: SearchScopeChoice[] = [
      { label: "Global do proprietário", description: "Todos os escopos deste owner · app_id omitido" },
      { label: "Conversas gerais", description: "Somente itens gerais · app_id=general", appId: "general" },
      ...tree.getApplications().map((application) => ({
        label: application.name,
        description: `Projeto · ${application.app_id.slice(0, 8)}`,
        appId: application.app_id,
      })),
    ];
    const scope = await vscode.window.showQuickPick(scopes, { placeHolder: "Escopo: ownerglobal, general ou um projeto" });
    if (!scope) return;
    try {
      const result = await api.get<SearchResponse>("/api/v1/search", {
        q: q.trim(),
        archived: "false",
        ...(scope.appId ? { app_id: scope.appId } : {}),
      });
      const choices = searchChoices(result);
      if (choices.length === 0) {
        void vscode.window.showInformationMessage("A pesquisa real do backend não encontrou resultados.");
        return;
      }
      const selected = await vscode.window.showQuickPick<SearchChoice>(choices, {
        placeHolder: `Resultados reais para “${q.trim()}” · ${scope.label}`,
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (!selected) return;
      if (selected.resultKind === "conversation" && selected.node) {
        await openConversationInTree(treeView, chat, selected.node);
      } else if (selected.node) {
        await revealTreeNode(treeView, selected.node);
      } else if (selected.resultKind === "memory" && selected.content) {
        void vscode.window.showInformationMessage(selected.content);
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Falha na pesquisa real do backend: ${errorText(error)}`);
    }
  });

  register("devhub.archiveItem", async (...args: unknown[]) => {
    let node = asTreeNode(args[0]);
    if (!node || node.kind === "general") {
      const choices = archiveChoices(tree);
      const selected = await vscode.window.showQuickPick(choices, { placeHolder: "Selecione projeto, pasta ou conversa para arquivar" });
      node = selected?.node;
    }
    if (!node || node.kind === "general") return;
    const answer = await vscode.window.showWarningMessage(
      `Arquivar “${node.label}” no backend?`,
      { modal: true },
      "Arquivar",
    );
    if (answer !== "Arquivar") return;
    try {
      if (node.kind === "project") {
        await api.patch<Application>(`/api/v1/applications/${encodeURIComponent(node.id)}`, { archived: true });
      } else if (node.kind === "folder") {
        await api.patch<Folder>(`/api/v1/folders/${encodeURIComponent(node.id)}`, { archived: true });
      } else {
        await api.patch<Conversation>(`/api/v1/conversations/${encodeURIComponent(node.id)}`, { archived: true });
      }
      await tree.refresh();
    } catch (error) {
      void vscode.window.showErrorMessage(errorText(error));
    }
  });

  register("devhub.moveConversation", async (...args: unknown[]) => {
    let node = asTreeNode(args[0]);
    if (!node || node.kind !== "conversation") {
      const choices = tree.getConversations().map((conversation) => ({
        label: conversation.title,
        description: conversation.conversation_id.slice(0, 8),
        node: conversationToNode(conversation),
      }));
      const selected = await vscode.window.showQuickPick(choices, { placeHolder: "Selecione a conversa que será movida" });
      node = selected?.node;
    }
    if (!node || node.kind !== "conversation") return;
    const destination = await pickDestination(tree, "Escolha projeto, pasta ou Conversas gerais como destino.");
    if (!destination) return;

    try {
      const preview = await api.post<MovePreview>(
        `/api/v1/conversations/${encodeURIComponent(node.id)}/move-preview`,
        { app_id: destination.appId, folder_id: destination.folderId },
      );
      const warning = preview.warning || "O backend não retornou aviso adicional; confira o destino e as memórias candidatas.";
      const proceed = await vscode.window.showWarningMessage(
        warning,
        { modal: true, detail: `Destino: ${destination.label}` },
        "Revisar memórias e continuar",
      );
      if (proceed !== "Revisar memórias e continuar") return;

      const candidates = Array.isArray(preview.candidates) ? preview.candidates : [];
      let approved: MemoryItem[] = [];
      if (candidates.length) {
        const memoryChoices = candidates.map((item) => ({
          label: item.category,
          description: item.source_label || "Origem não informada",
          detail: `${item.memory_item_id} · ${item.content}`,
          item,
        }));
        const selected = await vscode.window.showQuickPick(memoryChoices, {
          canPickMany: true,
          placeHolder: "Marque somente as memórias que autoriza incorporar ao destino; nenhuma seleção transfere conhecimento.",
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (!selected) return;
        approved = selected.map((choice) => choice.item);
      }

      const confirmed = await vscode.window.showWarningMessage(
        `Confirmar movimento de “${node.label}” para “${destination.label}”?`,
        { modal: true, detail: `${approved.length} memória(s) explicitamente selecionada(s).` },
        "Confirmar movimento",
      );
      if (confirmed !== "Confirmar movimento") return;

      await api.patch<Conversation>(`/api/v1/conversations/${encodeURIComponent(node.id)}`, {
        app_id: destination.appId,
        folder_id: destination.folderId,
        move_token: preview.move_token,
        approved_memory_ids: approved.map((item) => item.memory_item_id),
      });
      await tree.refresh();
      void vscode.window.showInformationMessage("Conversa movida com a prévia e a confirmação do usuário.");
    } catch (error) {
      void vscode.window.showErrorMessage(errorText(error));
    }
  });

  register("devhub.openObservability", async () => {
    const scopeChoices: Array<vscode.QuickPickItem & { appId: string }> = [
      { label: "Conversas gerais", description: "app_id=general", appId: "general" },
      ...tree.getApplications().map((application) => ({
        label: application.name,
        description: `app_id=${application.app_id}`,
        appId: application.app_id,
      })),
    ];
    const selectedScope = await vscode.window.showQuickPick(scopeChoices, { placeHolder: "Escopo de observabilidade" });
    if (!selectedScope) return;

    try {
      const result = await api.getObservability(selectedScope.appId);
      await showObservabilityDetails(api, result);
    } catch (error) {
      void vscode.window.showErrorMessage(`Falha ao consultar observabilidade real do backend: ${errorText(error)}`);
    }
  });

  context.subscriptions.push(context.secrets.onDidChange((event) => {
    if (event.key === AUTHORIZED_ORIGIN_SECRET_KEY) {
      chat.cancelActiveStream();
      void updateStatus();
      void tree.refresh();
      void chat.refresh();
    }
  }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("devhub.backendUrl")) {
      chat.cancelActiveStream();
      void tree.refresh();
      void chat.refresh();
      void updateStatus();
    }
  }));
  context.subscriptions.push(tree.startPolling());
  await updateStatus();
}

export function deactivate(): void {}

function asTreeNode(value: unknown): TreeNode | undefined {
  if (typeof value !== "object" || value === null || !("kind" in value) || !("id" in value) || !("label" in value)) {
    return undefined;
  }
  const candidate = value as Partial<TreeNode>;
  if (
    (candidate.kind !== "project" && candidate.kind !== "folder" && candidate.kind !== "conversation" && candidate.kind !== "general") ||
    typeof candidate.id !== "string" ||
    typeof candidate.label !== "string"
  ) {
    return undefined;
  }
  return candidate as TreeNode;
}

function targetFromNode(node: TreeNode): DestinationChoice | undefined {
  if (node.kind === "project") {
    return { label: node.label, description: "Raiz do projeto", appId: node.id, folderId: null };
  }
  if (node.kind === "folder") {
    return { label: node.label, description: "Subpasta", appId: node.appId, folderId: node.id };
  }
  if (node.kind === "general") {
    return { label: "Conversas gerais", description: "Sem projeto", appId: null, folderId: null };
  }
  return undefined;
}

async function pickDestination(tree: DevHubTreeProvider, placeHolder: string): Promise<DestinationChoice | undefined> {
  const applications = tree.getApplications();
  const folders = tree.getFolders();
  const choices: DestinationChoice[] = [
    { label: "Conversas gerais", description: "Raiz sem app_id", appId: null, folderId: null },
    ...applications.map((application) => ({
      label: application.name,
      description: `Raiz do projeto · ${application.app_id.slice(0, 8)}`,
      appId: application.app_id,
      folderId: null,
    })),
    ...folders.map((folder) => ({
      label: `${folder.app_id ? applicationName(applications, folder.app_id) : "Conversas gerais"} / ${folderPath(folder, folders)}`,
      description: folder.folder_id.slice(0, 8),
      appId: folder.app_id,
      folderId: folder.folder_id,
    })),
  ];
  return vscode.window.showQuickPick(choices, { placeHolder, matchOnDescription: true });
}

function applicationName(applications: Application[], appId: string): string {
  return applications.find((application) => application.app_id === appId)?.name || appId.slice(0, 8);
}

function folderPath(folder: Folder, folders: Folder[]): string {
  const names = [folder.name];
  let parentId = folder.parent_folder_id;
  const seen = new Set([folder.folder_id]);
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = folders.find((candidate) => candidate.folder_id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parent_folder_id;
  }
  return names.join(" / ");
}

function conversationToNode(conversation: Conversation): TreeNode {
  return {
    kind: "conversation",
    id: conversation.conversation_id,
    label: conversation.title,
    appId: conversation.app_id,
    folderId: conversation.folder_id,
    archived: conversation.archived,
  };
}

function applicationToNode(application: Application): TreeNode {
  return {
    kind: "project",
    id: application.app_id,
    label: application.name,
    appId: application.app_id,
    folderId: null,
    archived: application.archived,
  };
}

function folderToNode(folder: Folder): TreeNode {
  return {
    kind: "folder",
    id: folder.folder_id,
    label: folder.name,
    appId: folder.app_id,
    folderId: folder.folder_id,
    archived: folder.archived,
  };
}

function organizableChoices(tree: DevHubTreeProvider): ArchiveChoice[] {
  return [
    ...tree.getApplications(true).map((application) => ({
      label: `$(project) ${application.name}`,
      description: `${application.archived ? "Arquivado · " : ""}${application.app_id.slice(0, 8)}`,
      node: applicationToNode(application),
    })),
    ...tree.getFolders(true).map((folder) => ({
      label: `$(folder) ${folder.name}`,
      description: `${folder.archived ? "Arquivada · " : ""}${folder.folder_id.slice(0, 8)}`,
      node: folderToNode(folder),
    })),
    ...tree.getConversations(true).map((conversation) => ({
      label: `$(comment) ${conversation.title}`,
      description: `${conversation.archived ? "Arquivada · " : ""}${conversation.conversation_id.slice(0, 8)}`,
      node: conversationToNode(conversation),
    })),
  ];
}

function archivedChoices(tree: DevHubTreeProvider): ArchiveChoice[] {
  return organizableChoices(tree).filter((choice) => choice.node.archived);
}

function searchChoices(result: SearchResponse): SearchChoice[] {
  return [
    ...(Array.isArray(result.applications) ? result.applications : []).map((application) => ({
      label: `$(project) ${application.name}`,
      description: `Projeto · ${application.app_id.slice(0, 8)}`,
      resultKind: "project" as const,
      node: applicationToNode(application),
    })),
    ...(Array.isArray(result.folders) ? result.folders : []).map((folder) => ({
      label: `$(folder) ${folder.name}`,
      description: `Pasta · ${folder.app_id || "Conversas gerais"} · ${folder.folder_id.slice(0, 8)}`,
      resultKind: "folder" as const,
      node: folderToNode(folder),
    })),
    ...(Array.isArray(result.conversations) ? result.conversations : []).map((conversation) => ({
      label: `$(comment) ${conversation.title}`,
      description: `Conversa · ${conversation.app_id || "Conversas gerais"} · ${conversation.conversation_id.slice(0, 8)}`,
      resultKind: "conversation" as const,
      node: conversationToNode(conversation),
    })),
    ...(Array.isArray(result.memory_items) ? result.memory_items : []).map((item) => ({
      label: `$(database) ${truncate(item.content.replace(/\s+/g, " "), 100)}`,
      description: `Memória · ${item.category} · ${item.source_label || "Origem declarada"}`,
      detail: item.content,
      resultKind: "memory" as const,
      content: item.content,
    })),
  ];
}

function archivedAncestors(tree: DevHubTreeProvider, node: TreeNode): TreeNode[] {
  const ancestors: TreeNode[] = [];
  if (node.appId) {
    const application = tree.getApplications(true).find((item) => item.app_id === node.appId);
    if (application?.archived) ancestors.push(applicationToNode(application));
  }

  const folders = tree.getFolders(true);
  let parentFolderId: string | null = null;
  if (node.kind === "folder") {
    parentFolderId = folders.find((folder) => folder.folder_id === node.id)?.parent_folder_id ?? null;
  } else if (node.kind === "conversation") {
    parentFolderId = node.folderId;
  }
  const folderChain: Folder[] = [];
  const seen = new Set<string>();
  while (parentFolderId && !seen.has(parentFolderId)) {
    seen.add(parentFolderId);
    const parent = folders.find((folder) => folder.folder_id === parentFolderId);
    if (!parent) break;
    folderChain.push(parent);
    parentFolderId = parent.parent_folder_id;
  }
  folderChain.reverse();
  ancestors.push(...folderChain.filter((folder) => folder.archived).map(folderToNode));
  return ancestors;
}

async function setArchived(api: DevHubApi, node: TreeNode, archived: boolean): Promise<void> {
  const id = encodeURIComponent(node.id);
  if (node.kind === "project") {
    await api.patch<Application>(`/api/v1/applications/${id}`, { archived });
  } else if (node.kind === "folder") {
    await api.patch<Folder>(`/api/v1/folders/${id}`, { archived });
  } else if (node.kind === "conversation") {
    await api.patch<Conversation>(`/api/v1/conversations/${id}`, { archived });
  }
}

async function restoreItem(
  api: DevHubApi,
  tree: DevHubTreeProvider,
  treeView: vscode.TreeView<TreeNode>,
  chat: ChatViewProvider,
  node: TreeNode,
): Promise<void> {
  const ancestors = archivedAncestors(tree, node);
  const detail = ancestors.length
    ? `Também reabrir, em ordem: ${ancestors.map((item) => item.label).join(" → ")}. Outros filhos arquivados não serão restaurados.`
    : "Filhos arquivados não serão restaurados automaticamente.";
  const confirmed = await vscode.window.showWarningMessage(
    `Reabrir “${node.label}” no backend?`,
    { modal: true, detail },
    "Reabrir",
  );
  if (confirmed !== "Reabrir") return;

  try {
    for (const ancestor of ancestors) {
      await setArchived(api, ancestor, false);
    }
    let restored: TreeNode;
    if (node.kind === "project") {
      restored = applicationToNode(await api.patch<Application>(`/api/v1/applications/${encodeURIComponent(node.id)}`, { archived: false }));
    } else if (node.kind === "folder") {
      restored = folderToNode(await api.patch<Folder>(`/api/v1/folders/${encodeURIComponent(node.id)}`, { archived: false }));
    } else {
      restored = conversationToNode(await api.patch<Conversation>(`/api/v1/conversations/${encodeURIComponent(node.id)}`, { archived: false }));
    }
    await tree.refresh();
    if (restored.kind === "conversation") {
      await openConversationInTree(treeView, chat, restored);
    } else {
      await revealTreeNode(treeView, restored);
    }
    void vscode.window.showInformationMessage(`“${restored.label}” reaberto. Os demais filhos continuam no estado anterior.`);
  } catch (error) {
    void vscode.window.showErrorMessage(`Falha ao reabrir o item ou uma ancestral: ${errorText(error)}`);
  }
}

async function openConversationInTree(
  treeView: vscode.TreeView<TreeNode>,
  chat: ChatViewProvider,
  node: TreeNode,
): Promise<void> {
  await vscode.commands.executeCommand("workbench.view.extension.devhub");
  chat.selectConversation(node);
  await revealTreeNode(treeView, node);
}

async function revealTreeNode(treeView: vscode.TreeView<TreeNode>, node: TreeNode): Promise<void> {
  try {
    await treeView.reveal(node, { expand: true, focus: true, select: true });
  } catch {
    // A tree may not yet contain the refreshed item; the provider still retains its correct ancestry.
  }
}

function archiveChoices(tree: DevHubTreeProvider): ArchiveChoice[] {
  return [
    ...tree.getApplications().map((application) => ({
      label: `$(project) ${application.name}`,
      description: "Projeto",
      node: {
        kind: "project" as const,
        id: application.app_id,
        label: application.name,
        appId: application.app_id,
        folderId: null,
      },
    })),
    ...tree.getFolders().map((folder) => ({
      label: `$(folder) ${folder.name}`,
      description: folder.folder_id.slice(0, 8),
      node: {
        kind: "folder" as const,
        id: folder.folder_id,
        label: folder.name,
        appId: folder.app_id,
        folderId: folder.folder_id,
      },
    })),
    ...tree.getConversations().map((conversation) => ({
      label: `$(comment) ${conversation.title}`,
      description: conversation.conversation_id.slice(0, 8),
      node: conversationToNode(conversation),
    })),
  ];
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function showObservabilityDetails(api: DevHubApi, result: ObservabilityResponse): Promise<void> {
  const summary = [
    `Tarefas: ${result.total_tasks}`,
    `Concluídas: ${result.completed_tasks}`,
    `Falhas: ${result.failed_tasks}`,
    `Ativas: ${result.active_tasks}`,
    `Custo confirmado: ${formatCostUsd(result.confirmed_cost_usd)}`,
    `Sem contabilização: ${result.unaccounted_tasks}`,
  ].join(" · ");
  void vscode.window.showInformationMessage(`Observabilidade real do backend — ${summary}`);

  if (!Array.isArray(result.tasks) || result.tasks.length === 0) {
    void vscode.window.showInformationMessage("O backend não retornou tarefas para este escopo.");
    return;
  }
  const choices = result.tasks.map((task: Task) => ({
    label: `$(pulse) ${task.status} · ${task.task_id.slice(0, 8)}`,
    description: `custo ${formatCostUsd(task.cost_usd)} · ${task.model_id || "modelo indisponível"}`,
    detail: `trace_id: ${task.trace_id || "indisponível"} · ${task.created_at || "data indisponível"}`,
    task,
  }));
  const selected = await vscode.window.showQuickPick(choices, {
    placeHolder: "Selecione tarefa para consultar seus eventos persistidos",
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!selected) return;

  try {
    const details = await api.getTaskDetails(selected.task.task_id);
    if (details.task.status === "running") {
      const action = await vscode.window.showQuickPick(["Ver eventos", "Reconciliar estado interrompido"], {
        placeHolder: "Uma tarefa ativa pode ter perdido o executor; reconciliar não repete a chamada.",
      });
      if (!action) return;
      if (action === "Reconciliar estado interrompido") {
        const confirmed = await vscode.window.showWarningMessage(
          "Marcar esta tarefa como interrompida, sem executar novamente? O backend bloqueia se houver atividade recente.",
          { modal: true, detail: `task_id: ${details.task.task_id}` },
          "Reconciliar sem repetir",
        );
        if (confirmed !== "Reconciliar sem repetir") return;
        const reconciled = await api.post<Task>(`/api/v1/tasks/${encodeURIComponent(details.task.task_id)}/reconcile`, {});
        void vscode.window.showInformationMessage(`Estado persistido: ${reconciled.status}. Nenhuma inferência repetida.`);
        return;
      }
    }
    const eventChoices = details.events.map((event) => ({
      label: `${event.sequence}. ${event.kind} · ${event.status}`,
      description: event.created_at,
      detail: truncate(JSON.stringify(event.payload) || "{}", 450),
    }));
    const taskSummary = `task_id: ${details.task.task_id} · status: ${details.task.status} · custo: ${formatCostUsd(details.task.cost_usd)} · tokens: ${details.task.input_tokens ?? "indisponível"}/${details.task.output_tokens ?? "indisponível"} · duração: ${details.task.duration_ms ?? "indisponível"} ms`;
    if (eventChoices.length === 0) {
      void vscode.window.showInformationMessage(`${taskSummary} · Nenhum evento retornado pelo backend.`);
      return;
    }
    await vscode.window.showQuickPick(eventChoices, {
      placeHolder: `${taskSummary} — eventos persistidos`,
      matchOnDescription: true,
      matchOnDetail: true,
    });
  } catch (error) {
    void vscode.window.showErrorMessage(`Falha ao consultar eventos da tarefa: ${errorText(error)}`);
  }
}
