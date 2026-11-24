import * as vscode from "vscode";
import { DevHubApi } from "./api";
import type { Application, Conversation, Folder, TreeResponse } from "./types";

export type TreeNodeKind = "project" | "folder" | "conversation" | "general";

export interface TreeNode {
  kind: TreeNodeKind;
  id: string;
  label: string;
  appId: string | null;
  folderId: string | null;
  archived?: boolean;
}

const EMPTY_TREE: TreeResponse = { applications: [], folders: [], conversations: [] };

export class DevHubTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private data: TreeResponse = EMPTY_TREE;
  private polling: ReturnType<typeof setInterval> | undefined;
  private lastError: string | undefined;
  private showArchived = false;
  private refreshRevision = 0;

  constructor(private readonly api: DevHubApi) {}

  get errorMessage(): string | undefined {
    return this.lastError;
  }

  get archivedVisible(): boolean {
    return this.showArchived;
  }

  toggleArchived(): boolean {
    this.showArchived = !this.showArchived;
    return this.showArchived;
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    const collapsible = node.kind === "project" || node.kind === "folder" || node.kind === "general"
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem(node.label, collapsible);
    item.id = `${node.kind}:${node.id}`;
    item.contextValue = `${node.archived ? "devhubArchived" : "devhub"}${node.kind[0].toUpperCase()}${node.kind.slice(1)}`;
    if (node.kind === "project") {
      item.iconPath = new vscode.ThemeIcon("project");
    } else if (node.kind === "folder" || node.kind === "general") {
      item.iconPath = new vscode.ThemeIcon(node.kind === "general" ? "comment-discussion" : "folder");
    } else {
      item.iconPath = new vscode.ThemeIcon("comment");
      item.command = {
        command: "devhub.openConversation",
        title: "Abrir conversa",
        arguments: [node],
      };
      item.description = `${node.archived ? "Arquivado · " : ""}${node.id.slice(0, 8)}`;
    }
    if (node.archived && node.kind !== "conversation") {
      item.description = "Arquivado";
    }
    return item;
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) {
      const projects = this.data.applications
        .filter((application) => this.isVisible(application.archived))
        .map((application) => this.projectNode(application));
      return [...projects, this.generalNode()];
    }

    if (node.kind === "project") {
      return this.projectChildren(node.id, null);
    }
    if (node.kind === "general") {
      return this.generalChildren(null);
    }
    if (node.kind === "folder") {
      const folder = this.data.folders.find((item) => item.folder_id === node.id);
      if (!folder) {
        return [];
      }
      return folder.app_id === null
        ? this.generalChildren(folder.folder_id)
        : this.projectChildren(folder.app_id, folder.folder_id);
    }
    return [];
  }

  getParent(node: TreeNode): TreeNode | undefined {
    if (node.kind === "folder") {
      const folder = this.data.folders.find((item) => item.folder_id === node.id);
      if (!folder) return undefined;
      if (folder.parent_folder_id) {
        const parent = this.data.folders.find((item) => item.folder_id === folder.parent_folder_id);
        return parent ? this.folderNode(parent) : undefined;
      }
      return folder.app_id ? this.projectById(folder.app_id) : this.generalNode();
    }
    if (node.kind === "conversation") {
      const conversation = this.data.conversations.find((item) => item.conversation_id === node.id);
      if (!conversation) return undefined;
      if (conversation.folder_id) {
        const folder = this.data.folders.find((item) => item.folder_id === conversation.folder_id);
        return folder ? this.folderNode(folder) : undefined;
      }
      return conversation.app_id ? this.projectById(conversation.app_id) : this.generalNode();
    }
    return undefined;
  }

  async refresh(showErrors = false): Promise<void> {
    const revision = ++this.refreshRevision;
    try {
      const connected = await this.api.hasToken();
      if (revision !== this.refreshRevision) return;
      if (!connected) {
        this.data = EMPTY_TREE;
        this.lastError = undefined;
        this.changeEmitter.fire();
        return;
      }
      const data = await this.api.getTree(this.showArchived);
      if (revision !== this.refreshRevision) return;
      this.data = data;
      this.lastError = undefined;
    } catch (error) {
      if (revision !== this.refreshRevision) return;
      this.data = EMPTY_TREE;
      this.lastError = error instanceof Error ? error.message : "Falha ao atualizar a árvore.";
      if (showErrors) {
        void vscode.window.showErrorMessage(this.lastError);
      }
    }
    this.changeEmitter.fire();
  }

  startPolling(): vscode.Disposable {
    this.stopPolling();
    void this.refresh();
    this.polling = setInterval(() => void this.refresh(), 10_000);
    return new vscode.Disposable(() => this.stopPolling());
  }

  dispose(): void {
    this.stopPolling();
    this.refreshRevision++;
    this.changeEmitter.dispose();
  }

  getApplications(includeArchived = false): Application[] {
    return this.data.applications.filter((application) => includeArchived || !application.archived);
  }

  getFolders(includeArchived = false): Folder[] {
    return this.data.folders.filter((folder) => includeArchived || !folder.archived);
  }

  getConversations(includeArchived = false): Conversation[] {
    return this.data.conversations.filter((conversation) => includeArchived || !conversation.archived);
  }

  private isVisible(archived: boolean): boolean {
    return this.showArchived || !archived;
  }

  private generalNode(): TreeNode {
    return { kind: "general", id: "general", label: "Conversas gerais", appId: null, folderId: null };
  }

  private projectById(appId: string): TreeNode | undefined {
    const application = this.data.applications.find((item) => item.app_id === appId);
    return application ? this.projectNode(application) : undefined;
  }

  private stopPolling(): void {
    if (this.polling !== undefined) {
      clearInterval(this.polling);
      this.polling = undefined;
    }
  }

  private projectNode(application: Application): TreeNode {
    return {
      kind: "project",
      id: application.app_id,
      label: application.name,
      appId: application.app_id,
      folderId: null,
      archived: application.archived,
    };
  }

  private projectChildren(appId: string, parentFolderId: string | null): TreeNode[] {
    const folders = this.data.folders
      .filter((folder) => this.isVisible(folder.archived) && folder.app_id === appId && folder.parent_folder_id === parentFolderId)
      .map((folder) => this.folderNode(folder));
    const conversations = this.data.conversations
      .filter((conversation) => this.isVisible(conversation.archived) && conversation.app_id === appId && conversation.folder_id === parentFolderId)
      .map((conversation) => this.conversationNode(conversation));
    return [...folders, ...conversations];
  }

  private generalChildren(parentFolderId: string | null): TreeNode[] {
    const folders = this.data.folders
      .filter((folder) => this.isVisible(folder.archived) && folder.app_id === null && folder.parent_folder_id === parentFolderId)
      .map((folder) => this.folderNode(folder));
    const conversations = this.data.conversations
      .filter((conversation) => this.isVisible(conversation.archived) && conversation.app_id === null && conversation.folder_id === parentFolderId)
      .map((conversation) => this.conversationNode(conversation));
    return [...folders, ...conversations];
  }

  private folderNode(folder: Folder): TreeNode {
    return {
      kind: "folder",
      id: folder.folder_id,
      label: folder.name,
      appId: folder.app_id,
      folderId: folder.folder_id,
      archived: folder.archived,
    };
  }

  private conversationNode(conversation: Conversation): TreeNode {
    return {
      kind: "conversation",
      id: conversation.conversation_id,
      label: conversation.title,
      appId: conversation.app_id,
      folderId: conversation.folder_id,
      archived: conversation.archived,
    };
  }
}
