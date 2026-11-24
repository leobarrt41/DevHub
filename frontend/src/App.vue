<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { LogOut, ShieldCheck } from 'lucide-vue-next';
import TokenGate from './components/TokenGate.vue';
import SidebarTree from './components/SidebarTree.vue';
import ChatView from './components/ChatView.vue';
import EntityDialog from './components/EntityDialog.vue';
import MemoryApprovalDialog from './components/MemoryApprovalDialog.vue';
import MoveConversationDialog from './components/MoveConversationDialog.vue';
import SearchDialog from './components/SearchDialog.vue';
import ReparentFolderDialog from './components/ReparentFolderDialog.vue';
import MemoryPanel from './components/MemoryPanel.vue';
import ObservabilityPanel from './components/ObservabilityPanel.vue';
import { ApiClient, ApiError } from './services/api';
import { descendantFolderIds } from './services/folders';
import { consumeSSEStream, parseEventJson } from './services/sse';
import type {
  Application,
  Conversation,
  Folder,
  MemoryCategory,
  MemoryItem,
  Message,
  MessageStatus,
  ModelInfo,
  MovePreview,
  ObservabilityResponse,
  SearchResponse,
  SearchRequest,
  SessionInfo,
  StreamContextEvent,
  StreamDoneEvent,
  StreamErrorEvent,
  StreamTaskEvent,
  Task,
  TaskDetailResponse,
  TreeResponse,
} from './types/api';

const TOKEN_KEY = 'devhub.access-token';
const emptyTree = (): TreeResponse => ({ applications: [], folders: [], conversations: [] });

const api = shallowRef<ApiClient | null>(null);
const session = ref<SessionInfo | null>(null);
const isAuthenticating = ref(false);
const gateError = ref('');
const globalError = ref('');
const tree = ref<TreeResponse>(emptyTree());
const showArchived = ref(false);
const models = ref<ModelInfo[]>([]);
const selectedModel = ref('');
const selectedConversationId = ref<string | null>(null);
const selectedConversationFallback = shallowRef<Conversation | null>(null);
const messages = ref<Message[]>([]);
const draft = ref('');
const loadingHistory = ref(false);
const chatError = ref('');
const streaming = ref(false);
const currentTaskId = ref<string | null>(null);
const currentTraceId = ref<string | null>(null);
const mobileSidebarOpen = ref(false);
const activePanel = ref<'memory' | 'observability' | null>(null);
const memoryItems = ref<MemoryItem[]>([]);
const memoryLoading = ref(false);
const memoryError = ref('');
const observation = ref<ObservabilityResponse | null>(null);
const observationLoading = ref(false);
const observationError = ref('');
const taskDetail = ref<TaskDetailResponse | null>(null);
const taskDetailLoading = ref(false);
const taskDetailError = ref('');
const searchOpen = ref(false);
const searchResults = ref<SearchResponse | null>(null);
const searchLoading = ref(false);
const searchError = ref('');
const reparentOpen = ref(false);
const reparentFolder = shallowRef<Folder | null>(null);
const reparentSaving = ref(false);
const reparentError = ref('');
const reconcilingTaskId = ref<string | null>(null);
const moveOpen = ref(false);
const moveConversation = shallowRef<Conversation | null>(null);
const movePreview = ref<MovePreview | null>(null);
const moveLoading = ref(false);
const moveError = ref('');
const approvalOpen = ref(false);
const approvalMessage = shallowRef<Message | null>(null);
const approvalLoading = ref(false);
const approvalError = ref('');
const entityDialog = ref<{
  title: string;
  label: string;
  initialName?: string;
  context?: string;
  saving: boolean;
  save: (name: string) => Promise<void>;
} | null>(null);
let pollTimer: number | undefined;
let streamController: AbortController | null = null;
let searchTimer: number | undefined;
let searchGeneration = 0;
let treeGeneration = 0;
let historyGeneration = 0;
let memoryGeneration = 0;
let observationGeneration = 0;
let taskDetailGeneration = 0;

const isAuthenticated = computed(() => api.value !== null && session.value !== null);
const selectedConversation = computed(() => {
  const fromTree = tree.value.conversations.find((item) => item.conversation_id === selectedConversationId.value);
  return fromTree ?? selectedConversationFallback.value;
});
const scopeLabel = computed(() => {
  const appId = selectedConversation.value?.app_id;
  if (!appId) return 'Conversas gerais';
  return tree.value.applications.find((item) => item.app_id === appId)?.name ?? `Projeto ${appId.slice(0, 8)}`;
});
const observationAppId = computed(() => selectedConversation.value ? (selectedConversation.value.app_id ?? 'general') : undefined);

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status === 401) return 'Token recusado ou revogado. Conecte-se novamente com um token válido.';
    if (error.status === 409) return `Conflito informado pela API: ${error.message}`;
    if (error.status === 422) return `Dados rejeitados pela API: ${error.message}`;
    return `API (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}

function clearAuthenticatedState(message = '') {
  treeGeneration++;
  historyGeneration++;
  memoryGeneration++;
  observationGeneration++;
  taskDetailGeneration++;
  searchGeneration++;
  if (searchTimer !== undefined) window.clearTimeout(searchTimer);
  searchTimer = undefined;
  sessionStorage.removeItem(TOKEN_KEY);
  api.value = null;
  session.value = null;
  tree.value = emptyTree();
  showArchived.value = false;
  models.value = [];
  selectedModel.value = '';
  selectedConversationId.value = null;
  selectedConversationFallback.value = null;
  messages.value = [];
  loadingHistory.value = false;
  memoryItems.value = [];
  memoryLoading.value = false;
  memoryError.value = '';
  observation.value = null;
  observationLoading.value = false;
  observationError.value = '';
  taskDetail.value = null;
  taskDetailLoading.value = false;
  taskDetailError.value = '';
  searchResults.value = null;
  searchLoading.value = false;
  searchError.value = '';
  searchOpen.value = false;
  reparentOpen.value = false;
  reconcilingTaskId.value = null;
  activePanel.value = null;
  streaming.value = false;
  streamController?.abort();
  streamController = null;
  gateError.value = message;
}

function createClient(token: string, handleUnauthorized = true) {
  return new ApiClient(token, handleUnauthorized ? () => {
    clearAuthenticatedState('O token foi recusado pela API. Conecte-se novamente.');
  } : undefined);
}

async function refreshTree(silent = false) {
  const client = api.value;
  if (!client) return;
  const requestId = ++treeGeneration;
  const includeArchived = showArchived.value;
  try {
    const nextTree = await client.getTree(includeArchived);
    if (api.value !== client || requestId !== treeGeneration || includeArchived !== showArchived.value) return;
    tree.value = nextTree;
    if (selectedConversationId.value && !nextTree.conversations.some((item) => item.conversation_id === selectedConversationId.value)) {
      selectedConversationId.value = null;
      selectedConversationFallback.value = null;
      messages.value = [];
      loadingHistory.value = false;
      historyGeneration++;
    }
  } catch (error) {
    if (api.value !== client || requestId !== treeGeneration) return;
    const message = errorMessage(error);
    if (silent) globalError.value = message;
    else globalError.value = message;
  }
}

async function refreshModels() {
  const client = api.value;
  if (!client) return;
  try {
    const response = await client.getModels();
    if (api.value !== client) return;
    models.value = response.models;
    const preferred = response.default_model || session.value?.default_model || '';
    selectedModel.value = response.models.some((model) => model.id === preferred)
      ? preferred
      : response.models[0]?.id ?? '';
  } catch (error) {
    if (api.value !== client) return;
    models.value = [];
    globalError.value = errorMessage(error);
  }
}

async function authenticate(rawToken: string, restore = false) {
  const token = rawToken.trim();
  if (!token || isAuthenticating.value) return;
  isAuthenticating.value = true;
  gateError.value = '';
  globalError.value = '';
  const temporaryClient = createClient(token, false);
  try {
    const validatedSession = await temporaryClient.getSession();
    sessionStorage.setItem(TOKEN_KEY, token);
    session.value = validatedSession;
    api.value = createClient(token);
    await Promise.all([refreshTree(), refreshModels()]);
  } catch (error) {
    const message = errorMessage(error);
    if (!restore) gateError.value = message;
    else clearAuthenticatedState(message);
  } finally {
    isAuthenticating.value = false;
  }
}

function signOut() {
  clearAuthenticatedState('');
}

async function loadMessages(conversationId: string, preserveFallback = false) {
  const client = api.value;
  if (!client) return;
  const requestId = ++historyGeneration;
  loadingHistory.value = true;
  try {
    const response = await client.getMessages(conversationId);
    if (api.value !== client || requestId !== historyGeneration || selectedConversationId.value !== conversationId) return;
    if (response.length) messages.value = response;
    else if (preserveFallback) {
      messages.value = messages.value.filter((message) => message.conversation_id === conversationId
        && ((message.role === 'assistant'
          && (message.status === 'completed' && !message.message_id.startsWith('local-')
            || message.status === 'interrupted' || message.status === 'cancelled'))
          || (message.role === 'user' && message.status === 'interrupted' && message.message_id.startsWith('local-user-'))));
    } else messages.value = response;
  } catch (error) {
    if (api.value === client && requestId === historyGeneration && selectedConversationId.value === conversationId) chatError.value = errorMessage(error);
  } finally {
    if (api.value === client && requestId === historyGeneration && selectedConversationId.value === conversationId) loadingHistory.value = false;
  }
}

async function selectConversation(conversation: Conversation) {
  if (streaming.value && selectedConversationId.value !== conversation.conversation_id) stopStream();
  if (conversation.archived && !showArchived.value) {
    showArchived.value = true;
    void refreshTree(true);
  }
  selectedConversationFallback.value = conversation;
  selectedConversationId.value = conversation.conversation_id;
  messages.value = [];
  draft.value = '';
  chatError.value = '';
  currentTaskId.value = null;
  await loadMessages(conversation.conversation_id);
  if (selectedConversationId.value !== conversation.conversation_id) return;
  if (activePanel.value === 'memory') await loadMemory();
  if (activePanel.value === 'observability') await loadObservability();
}

function clearSelectedConversation() {
  selectedConversationId.value = null;
  selectedConversationFallback.value = null;
  messages.value = [];
  loadingHistory.value = false;
  historyGeneration++;
}

async function createConversation(appId: string | null, folderId: string | null) {
  if (!api.value) return;
  globalError.value = '';
  try {
    const created = await api.value.createConversation({ title: 'Nova conversa', app_id: appId, folder_id: folderId });
    await refreshTree();
    await selectConversation(created);
    mobileSidebarOpen.value = false;
  } catch (error) {
    globalError.value = errorMessage(error);
  }
}

function openEntityDialog(options: {
  title: string;
  label: string;
  initialName?: string;
  context?: string;
  save: (name: string) => Promise<void>;
}) {
  entityDialog.value = { ...options, saving: false };
}

function createApplicationDialog() {
  openEntityDialog({
    title: 'Criar aplicação',
    label: 'Nome da aplicação',
    save: async (name) => {
      if (!api.value) return;
      entityDialog.value!.saving = true;
      await api.value.createApplication({ name });
      entityDialog.value = null;
      await refreshTree();
    },
  });
}

function createFolderDialog(appId: string | null, parentFolderId: string | null) {
  const parent = parentFolderId ? tree.value.folders.find((item) => item.folder_id === parentFolderId) : null;
  const appName = appId ? tree.value.applications.find((item) => item.app_id === appId)?.name : null;
  openEntityDialog({
    title: parent ? 'Criar subpasta' : 'Criar pasta',
    label: 'Nome da pasta',
    context: parent?.name ?? appName ?? 'Conversas gerais',
    save: async (name) => {
      if (!api.value) return;
      entityDialog.value!.saving = true;
      await api.value.createFolder({ name, app_id: appId, parent_folder_id: parentFolderId });
      entityDialog.value = null;
      await refreshTree();
    },
  });
}

function renameApplicationDialog(application: Application) {
  openEntityDialog({
    title: 'Renomear aplicação', label: 'Nome da aplicação', initialName: application.name,
    context: `ID preservado: ${application.app_id}`,
    save: async (name) => {
      if (!api.value) return;
      entityDialog.value!.saving = true;
      await api.value.updateApplication(application.app_id, { name });
      entityDialog.value = null;
      await refreshTree();
    },
  });
}

function renameFolderDialog(folder: Folder) {
  openEntityDialog({
    title: 'Renomear pasta', label: 'Nome da pasta', initialName: folder.name,
    context: `ID preservado: ${folder.folder_id}`,
    save: async (name) => {
      if (!api.value) return;
      entityDialog.value!.saving = true;
      await api.value.updateFolder(folder.folder_id, { name });
      entityDialog.value = null;
      await refreshTree();
    },
  });
}

function renameConversationDialog(conversation: Conversation) {
  openEntityDialog({
    title: 'Renomear conversa', label: 'Título da conversa', initialName: conversation.title,
    context: `ID preservado: ${conversation.conversation_id}`,
    save: async (name) => {
      if (!api.value) return;
      entityDialog.value!.saving = true;
      await api.value.updateConversation(conversation.conversation_id, { title: name });
      entityDialog.value = null;
      await refreshTree();
    },
  });
}

async function archiveApplication(application: Application) {
  if (!api.value || !window.confirm(`Arquivar “${application.name}” e o conteúdo abrangido pela API?`)) return;
  try {
    await api.value.updateApplication(application.app_id, { archived: true });
    await refreshTree();
    if (selectedConversation.value?.app_id === application.app_id) {
      clearSelectedConversation();
    }
  } catch (error) { globalError.value = errorMessage(error); }
}

async function archiveFolder(folder: Folder) {
  if (!api.value || !window.confirm(`Arquivar a pasta “${folder.name}” e o conteúdo descendente?`)) return;
  const folderIds = descendantFolderIds(tree.value.folders, folder.folder_id);
  const selectedFolderId = selectedConversation.value?.folder_id;
  try {
    await api.value.updateFolder(folder.folder_id, { archived: true });
    await refreshTree();
    if (selectedFolderId && folderIds.has(selectedFolderId)) {
      clearSelectedConversation();
    }
  } catch (error) { globalError.value = errorMessage(error); }
}

async function archiveConversation(conversation: Conversation) {
  if (!api.value || !window.confirm(`Arquivar a conversa “${conversation.title}”?`)) return;
  try {
    await api.value.updateConversation(conversation.conversation_id, { archived: true });
    await refreshTree();
    if (selectedConversationId.value === conversation.conversation_id) {
      clearSelectedConversation();
    }
  } catch (error) { globalError.value = errorMessage(error); }
}

async function restoreApplication(application: Application) {
  const client = api.value;
  if (!client) return;
  try {
    await client.updateApplication(application.app_id, { archived: false });
    if (api.value === client) await refreshTree();
  } catch (error) {
    if (api.value === client) globalError.value = `Não foi possível reabrir o projeto. Reabra-o antes das pastas e conversas arquivadas. ${errorMessage(error)}`;
  }
}

async function restoreFolder(folder: Folder) {
  const client = api.value;
  if (!client) return;
  try {
    await client.updateFolder(folder.folder_id, { archived: false });
    if (api.value === client) await refreshTree();
  } catch (error) {
    if (api.value === client) globalError.value = `Não foi possível reabrir a pasta. Reabra primeiro o projeto e as pastas ancestrais; reabrir esta pasta não restaura as descendentes. ${errorMessage(error)}`;
  }
}

async function restoreConversation(conversation: Conversation) {
  const client = api.value;
  if (!client) return;
  try {
    const updated = await client.updateConversation(conversation.conversation_id, { archived: false });
    if (api.value !== client) return;
    if (searchResults.value) {
      searchResults.value = {
        ...searchResults.value,
        conversations: searchResults.value.conversations.map((item) => item.conversation_id === updated.conversation_id ? updated : item),
      };
    }
    await refreshTree();
  } catch (error) {
    if (api.value !== client) return;
    const message = `Não foi possível reabrir a conversa. Se o projeto ou alguma pasta ancestral estiver arquivado, reabra primeiro esses pais em “Mostrar arquivados” e tente novamente. ${errorMessage(error)}`;
    if (searchOpen.value) searchError.value = message;
    else globalError.value = message;
  }
}

function startReparentFolder(folder: Folder) {
  reparentFolder.value = folder;
  reparentError.value = '';
  reparentOpen.value = true;
}

async function saveReparentFolder(parentFolderId: string | null) {
  const client = api.value;
  const folder = reparentFolder.value;
  if (!client || !folder || reparentSaving.value) return;
  reparentSaving.value = true;
  reparentError.value = '';
  try {
    await client.updateFolder(folder.folder_id, { parent_folder_id: parentFolderId });
    if (api.value !== client) return;
    reparentOpen.value = false;
    reparentFolder.value = null;
    await refreshTree();
  } catch (error) {
    if (api.value === client) reparentError.value = errorMessage(error);
  } finally {
    reparentSaving.value = false;
  }
}

function startMove(conversation: Conversation) {
  moveConversation.value = conversation;
  movePreview.value = null;
  moveError.value = '';
  moveOpen.value = true;
}

async function requestMovePreview(destination: { app_id: string | null; folder_id: string | null }) {
  if (!api.value || !moveConversation.value) return;
  moveLoading.value = true;
  moveError.value = '';
  movePreview.value = null;
  try {
    movePreview.value = await api.value.previewConversationMove(moveConversation.value.conversation_id, destination);
  } catch (error) { moveError.value = errorMessage(error); }
  finally { moveLoading.value = false; }
}

async function confirmMove(payload: { app_id: string | null; folder_id: string | null; move_token: string; approved_memory_ids: string[] }) {
  if (!api.value || !moveConversation.value) return;
  moveLoading.value = true;
  moveError.value = '';
  try {
    await api.value.updateConversation(moveConversation.value.conversation_id, {
      app_id: payload.app_id,
      folder_id: payload.folder_id,
      move_token: payload.move_token,
      approved_memory_ids: payload.approved_memory_ids,
    });
    moveOpen.value = false;
    movePreview.value = null;
    await refreshTree();
    if (selectedConversationId.value === moveConversation.value.conversation_id) {
      const updated = tree.value.conversations.find((item) => item.conversation_id === moveConversation.value?.conversation_id);
      if (updated) selectedConversationFallback.value = updated;
      if (activePanel.value === 'memory') await loadMemory();
      if (activePanel.value === 'observability') await loadObservability();
    }
  } catch (error) { moveError.value = errorMessage(error); }
  finally { moveLoading.value = false; }
}

async function loadMemory(query = '') {
  const client = api.value;
  const selectedId = selectedConversationId.value;
  const appId = selectedConversation.value?.app_id ?? null;
  const requestId = ++memoryGeneration;
  if (!client || !selectedId || !selectedConversation.value) {
    memoryItems.value = [];
    memoryLoading.value = false;
    return;
  }
  memoryLoading.value = true;
  memoryError.value = '';
  try {
    const items = await client.getMemory(appId, query);
    if (api.value === client && requestId === memoryGeneration && selectedConversationId.value === selectedId
      && selectedConversation.value?.app_id === appId && activePanel.value === 'memory') memoryItems.value = items;
  } catch (error) {
    if (api.value === client && requestId === memoryGeneration && selectedConversationId.value === selectedId
      && selectedConversation.value?.app_id === appId && activePanel.value === 'memory') memoryError.value = errorMessage(error);
  } finally {
    if (api.value === client && requestId === memoryGeneration && selectedConversationId.value === selectedId) memoryLoading.value = false;
  }
}

async function removeMemory(memory: MemoryItem) {
  const client = api.value;
  const selectedId = selectedConversationId.value;
  if (!client || !window.confirm('Remover esta memória aprovada? A operação será registrada pela API.')) return;
  try {
    await client.deleteMemory(memory.memory_item_id);
    if (api.value === client && selectedConversationId.value === selectedId && activePanel.value === 'memory') await loadMemory();
  } catch (error) {
    if (api.value === client && selectedConversationId.value === selectedId && activePanel.value === 'memory') memoryError.value = errorMessage(error);
  }
}

function toggleMemoryPanel() {
  activePanel.value = activePanel.value === 'memory' ? null : 'memory';
  if (activePanel.value === 'memory') void loadMemory();
  else {
    memoryGeneration++;
    memoryLoading.value = false;
  }
}

async function loadObservability() {
  const client = api.value;
  const selectedId = selectedConversationId.value;
  const appId = observationAppId.value;
  const requestId = ++observationGeneration;
  if (!client || activePanel.value !== 'observability') {
    observationLoading.value = false;
    return;
  }
  observationLoading.value = true;
  observationError.value = '';
  try {
    const summary = await client.getObservability(appId);
    if (api.value === client && requestId === observationGeneration && selectedConversationId.value === selectedId
      && observationAppId.value === appId && activePanel.value === 'observability') observation.value = summary;
  } catch (error) {
    if (api.value === client && requestId === observationGeneration && selectedConversationId.value === selectedId
      && observationAppId.value === appId && activePanel.value === 'observability') observationError.value = errorMessage(error);
  } finally {
    if (api.value === client && requestId === observationGeneration && selectedConversationId.value === selectedId) observationLoading.value = false;
  }
}

async function toggleObservabilityPanel() {
  activePanel.value = activePanel.value === 'observability' ? null : 'observability';
  observationGeneration++;
  taskDetailGeneration++;
  observationLoading.value = false;
  taskDetailLoading.value = false;
  taskDetail.value = null;
  if (activePanel.value === 'observability') await loadObservability();
}

async function loadTaskDetail(task: Task) {
  const client = api.value;
  if (!client || activePanel.value !== 'observability') return;
  const requestId = ++taskDetailGeneration;
  const selectedId = selectedConversationId.value;
  const appId = observationAppId.value;
  taskDetailLoading.value = true;
  taskDetailError.value = '';
  taskDetail.value = null;
  try {
    const detail = await client.getTaskDetail(task.task_id);
    if (api.value === client && requestId === taskDetailGeneration && selectedConversationId.value === selectedId
      && observationAppId.value === appId && activePanel.value === 'observability') taskDetail.value = detail;
  } catch (error) {
    if (api.value === client && requestId === taskDetailGeneration && selectedConversationId.value === selectedId
      && observationAppId.value === appId && activePanel.value === 'observability') taskDetailError.value = errorMessage(error);
  } finally {
    if (api.value === client && requestId === taskDetailGeneration && selectedConversationId.value === selectedId) taskDetailLoading.value = false;
  }
}

function closeTaskDetail() {
  taskDetailGeneration++;
  taskDetail.value = null;
  taskDetailLoading.value = false;
  taskDetailError.value = '';
}

async function reconcileTask(task: Task) {
  const client = api.value;
  if (!client || task.status !== 'running') return;
  const selectedId = selectedConversationId.value;
  const appId = observationAppId.value;
  const stillOnScope = () => api.value === client && activePanel.value === 'observability'
    && selectedConversationId.value === selectedId && observationAppId.value === appId;
  const approved = window.confirm(
    `Reconciliar a tarefa ${task.task_id}? A API só marcará como interrompida se seu heartbeat estiver expirado. Esta ação não repete a chamada ao provedor.`,
  );
  if (!approved) return;
  reconcilingTaskId.value = task.task_id;
  observationError.value = '';
  try {
    await client.reconcileTask(task.task_id);
    if (api.value !== client) return;
    const reloads: Promise<void>[] = [refreshTree(true)];
    if (stillOnScope()) reloads.push(loadObservability(), loadTaskDetail(task));
    if (selectedId === task.conversation_id && selectedConversationId.value === selectedId) reloads.push(loadMessages(task.conversation_id, true));
    await Promise.all(reloads);
  } catch (error) {
    if (stillOnScope()) observationError.value = errorMessage(error);
  } finally {
    if (api.value === client && reconcilingTaskId.value === task.task_id) reconcilingTaskId.value = null;
  }
}

function openMemoryApproval(message: Message) {
  approvalMessage.value = message;
  approvalError.value = '';
  approvalOpen.value = true;
}

async function approveMemory(payload: { content: string; category: MemoryCategory }) {
  if (!api.value || !approvalMessage.value || !selectedConversation.value) return;
  approvalLoading.value = true;
  approvalError.value = '';
  try {
    await api.value.createMemory({
      app_id: selectedConversation.value.app_id,
      content: payload.content,
      category: payload.category,
      source_message_id: approvalMessage.value.message_id,
    });
    approvalOpen.value = false;
    if (activePanel.value === 'memory') await loadMemory();
  } catch (error) { approvalError.value = errorMessage(error); }
  finally { approvalLoading.value = false; }
}

function openSearch() {
  searchGeneration++;
  if (searchTimer !== undefined) window.clearTimeout(searchTimer);
  searchTimer = undefined;
  searchOpen.value = true;
  searchResults.value = null;
  searchError.value = '';
  searchLoading.value = false;
}

function closeSearch() {
  searchOpen.value = false;
  searchGeneration++;
  if (searchTimer !== undefined) window.clearTimeout(searchTimer);
  searchTimer = undefined;
  searchLoading.value = false;
}

function runSearch(request: SearchRequest) {
  const generation = ++searchGeneration;
  if (searchTimer !== undefined) window.clearTimeout(searchTimer);
  const query = request.query.trim();
  if (query.length < 2) {
    searchResults.value = null;
    searchError.value = '';
    searchLoading.value = false;
    return;
  }
  searchTimer = window.setTimeout(async () => {
    const client = api.value;
    if (!client || !searchOpen.value) return;
    searchLoading.value = true;
    searchError.value = '';
    try {
      const results = await client.search(query, request.filter);
      if (api.value === client && generation === searchGeneration && searchOpen.value) searchResults.value = results;
    } catch (error) {
      if (api.value === client && generation === searchGeneration && searchOpen.value) searchError.value = errorMessage(error);
    } finally {
      if (api.value === client && generation === searchGeneration) searchLoading.value = false;
    }
  }, 250);
}

async function sendMessage() {
  const client = api.value;
  const conversation = selectedConversation.value;
  const content = draft.value.trim();
  const model = selectedModel.value;
  if (!client || !conversation || !content || !model || streaming.value || !session.value?.openrouter_configured) return;

  const requestId = crypto.randomUUID();
  const controller = new AbortController();
  streamController = controller;
  streaming.value = true;
  currentTaskId.value = null;
  currentTraceId.value = null;
  chatError.value = '';
  draft.value = '';
  const localUserId = `local-user-${requestId}`;
  const localAssistantId = `local-assistant-${requestId}`;
  const timestamp = new Date().toISOString();
  const outgoingMessage: Message = {
    message_id: localUserId,
    conversation_id: conversation.conversation_id,
    role: 'user',
    content,
    status: 'streaming',
    task_id: null,
    created_at: timestamp,
    context_sources: [],
  };
  const assistantMessage: Message = {
    message_id: localAssistantId,
    conversation_id: conversation.conversation_id,
    role: 'assistant',
    content: '',
    status: 'streaming',
    task_id: null,
    created_at: timestamp,
    context_sources: [],
  };
  messages.value = [...messages.value, outgoingMessage, assistantMessage];
  let terminalEvent: 'done' | 'error' | null = null;
  let streamError: string | null = null;

  const updateLocalMessage = (id: string, patch: Partial<Message>) => {
    messages.value = messages.value.map((message) => message.message_id === id ? { ...message, ...patch } : message);
  };

  try {
    const response = await client.streamMessage(conversation.conversation_id, {
      content,
      model,
      request_id: requestId,
    }, controller.signal);
    await consumeSSEStream(response.body!, (event) => {
      if (event.event === 'task') {
        const payload = parseEventJson<StreamTaskEvent>(event);
        currentTaskId.value = payload.task_id;
        currentTraceId.value = payload.trace_id;
        updateLocalMessage(localUserId, { task_id: payload.task_id });
        updateLocalMessage(localAssistantId, { task_id: payload.task_id });
      } else if (event.event === 'context') {
        const payload = parseEventJson<StreamContextEvent>(event);
        updateLocalMessage(localAssistantId, { context_sources: payload.sources });
      } else if (event.event === 'delta') {
        const payload = parseEventJson<{ content: string }>(event);
        const current = messages.value.find((message) => message.message_id === localAssistantId);
        updateLocalMessage(localAssistantId, { content: `${current?.content ?? ''}${payload.content}` });
      } else if (event.event === 'done') {
        const payload = parseEventJson<StreamDoneEvent>(event);
        terminalEvent = 'done';
        currentTaskId.value = payload.task_id;
        updateLocalMessage(localAssistantId, {
          message_id: payload.message_id,
          task_id: payload.task_id,
          status: (payload.status || 'completed') as MessageStatus,
        });
        updateLocalMessage(localUserId, { task_id: payload.task_id, status: 'completed' });
      } else if (event.event === 'error') {
        const payload = parseEventJson<StreamErrorEvent>(event);
        terminalEvent = 'error';
        streamError = payload.message;
        if (payload.task_id) currentTaskId.value = payload.task_id;
        updateLocalMessage(localAssistantId, {
          task_id: payload.task_id ?? currentTaskId.value,
          status: 'failed',
        });
      }
    }, controller.signal);

    if (!terminalEvent) {
      updateLocalMessage(localUserId, { status: 'interrupted' });
      updateLocalMessage(localAssistantId, { status: 'interrupted' });
      streamError = 'A conexão terminou sem evento done/error. O histórico persistido foi recarregado; não houve nova tentativa.';
      chatError.value = streamError;
    }
    if (terminalEvent === 'error') chatError.value = `A API encerrou a tarefa com erro: ${streamError ?? 'detalhe indisponível'}`;
    await loadMessages(conversation.conversation_id, terminalEvent !== 'error');
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
    const stillSelected = selectedConversationId.value === conversation.conversation_id;
    const localOutgoing = messages.value.find((message) => message.message_id === localUserId);
    const localAssistant = messages.value.find((message) => message.message_id === localAssistantId)
      ?? messages.value.find((message) => message.role === 'assistant' && message.conversation_id === conversation.conversation_id && message.created_at === timestamp);
    if (stillSelected && aborted) {
      updateLocalMessage(localAssistantId, { status: 'cancelled' });
      chatError.value = 'Stream cancelado. O histórico persistido foi recarregado; nenhuma chamada foi repetida.';
    } else if (stillSelected) {
      updateLocalMessage(localAssistantId, { status: 'interrupted' });
      chatError.value = `Falha no stream sem retry automático: ${errorMessage(error)}`;
    }
    await loadMessages(conversation.conversation_id);
    if (stillSelected && messages.value.length === 0) {
      messages.value = [
        ...(localOutgoing ? [{ ...localOutgoing, status: 'interrupted' as const }] : [{ ...outgoingMessage, status: 'interrupted' as const }]),
        ...(localAssistant ? [{ ...localAssistant, status: aborted ? 'cancelled' as const : 'interrupted' as const }] : []),
      ];
    }
    if (stillSelected && !aborted && !messages.value.some((message) => message.message_id === localUserId)) {
      messages.value = [...messages.value, { ...outgoingMessage, status: 'interrupted' }];
    }
    if (stillSelected && !aborted && draft.value === '') draft.value = content;
  } finally {
    streaming.value = false;
    streamController = null;
    currentTaskId.value = null;
    currentTraceId.value = null;
    await refreshTree(true);
    if (activePanel.value === 'observability') await loadObservability();
  }
}

function stopStream() {
  streamController?.abort();
}

async function saveEntity(name: string) {
  const dialog = entityDialog.value;
  if (!dialog || dialog.saving) return;
  dialog.saving = true;
  try {
    await dialog.save(name);
  } catch (error) {
    globalError.value = errorMessage(error);
    if (entityDialog.value) entityDialog.value.saving = false;
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (isAuthenticated.value) openSearch();
  }
}

watch(() => api.value !== null, (authenticated) => {
  if (pollTimer !== undefined) window.clearInterval(pollTimer);
  pollTimer = undefined;
  if (authenticated) {
    pollTimer = window.setInterval(() => {
      const conversationId = selectedConversationId.value;
      void refreshTree(true);
      if (conversationId && !streaming.value) void loadMessages(conversationId, true);
    }, 10_000);
  }
}, { immediate: true });

watch(() => `${selectedConversationId.value ?? ''}:${selectedConversation.value?.app_id ?? 'general'}`, async () => {
  if (activePanel.value === 'memory') await loadMemory();
  if (activePanel.value === 'observability') {
    taskDetailGeneration++;
    taskDetail.value = null;
    taskDetailLoading.value = false;
    taskDetailError.value = '';
    await loadObservability();
  }
});

function setShowArchived(value: boolean) {
  if (showArchived.value === value) return;
  showArchived.value = value;
  void refreshTree(true);
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
  const savedToken = sessionStorage.getItem(TOKEN_KEY);
  if (savedToken) void authenticate(savedToken, true);
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  if (pollTimer !== undefined) window.clearInterval(pollTimer);
  if (searchTimer !== undefined) window.clearTimeout(searchTimer);
  streamController?.abort();
});
</script>

<template>
  <TokenGate v-if="!isAuthenticated" :loading="isAuthenticating" :error="gateError" @authenticate="authenticate($event)" />
  <div v-else class="app-shell">
    <SidebarTree
      :applications="tree.applications"
      :folders="tree.folders"
      :conversations="tree.conversations"
      :selected-conversation-id="selectedConversationId"
      :mobile-open="mobileSidebarOpen"
      :show-archived="showArchived"
      @create-application="createApplicationDialog"
      @create-conversation="createConversation"
      @create-folder="createFolderDialog"
      @rename-application="renameApplicationDialog"
      @archive-application="archiveApplication"
      @restore-application="restoreApplication"
      @rename-folder="renameFolderDialog"
      @archive-folder="archiveFolder"
      @restore-folder="restoreFolder"
      @reparent-folder="startReparentFolder"
      @rename-conversation="renameConversationDialog"
      @archive-conversation="archiveConversation"
      @restore-conversation="restoreConversation"
      @move-conversation="startMove"
      @select-conversation="selectConversation"
      @search="openSearch"
      @show-archived="setShowArchived"
      @close-mobile="mobileSidebarOpen = false"
    />

    <main class="workspace-column">
      <div class="session-strip">
        <span class="session-status"><span class="status-dot"></span><ShieldCheck :size="14" /> Sessão autenticada</span>
        <div class="session-user"><span>{{ session?.name }}</span><span class="session-divider"></span><button type="button" @click="signOut"><LogOut :size="14" /> Sair</button></div>
      </div>
      <div v-if="globalError" class="global-error" role="alert"><span>{{ globalError }}</span><button type="button" aria-label="Dispensar erro" @click="globalError = ''">×</button></div>
      <div class="workspace-body">
        <ChatView
          :conversation="selectedConversation"
          :scope-label="scopeLabel"
          :messages="messages"
          :models="models"
          :selected-model="selectedModel"
          :draft="draft"
          :streaming="streaming"
          :loading-history="loadingHistory"
          :current-task-id="currentTaskId"
          :current-trace-id="currentTraceId"
          :openrouter-configured="session?.openrouter_configured ?? false"
          :error="chatError"
          @update:selected-model="selectedModel = $event"
          @update:draft="draft = $event"
          @send="sendMessage"
          @stop="stopStream"
          @approve-memory="openMemoryApproval"
          @toggle-memory="toggleMemoryPanel"
          @toggle-observability="toggleObservabilityPanel"
          @toggle-mobile-sidebar="mobileSidebarOpen = true"
        />
        <Transition name="panel-slide">
          <MemoryPanel
            v-if="activePanel === 'memory'"
            :items="memoryItems"
            :scope-label="scopeLabel"
            :loading="memoryLoading"
            :error="memoryError"
            @reload="loadMemory"
            @remove="removeMemory"
          />
          <ObservabilityPanel
            v-else-if="activePanel === 'observability'"
            :summary="observation"
            :loading="observationLoading"
            :error="observationError"
            :detail="taskDetail"
            :detail-loading="taskDetailLoading"
            :detail-error="taskDetailError"
            :reconciling-task-id="reconcilingTaskId"
            @reload="loadObservability"
            @select-task="loadTaskDetail"
            @close-detail="closeTaskDetail"
            @reconcile-task="reconcileTask"
          />
        </Transition>
      </div>
    </main>

    <div v-if="mobileSidebarOpen" class="mobile-sidebar-backdrop" @click="mobileSidebarOpen = false"></div>
    <EntityDialog
      :open="entityDialog !== null"
      :title="entityDialog?.title ?? ''"
      :label="entityDialog?.label ?? ''"
      :initial-name="entityDialog?.initialName"
      :context="entityDialog?.context"
      :saving="entityDialog?.saving ?? false"
      @close="entityDialog = null"
      @save="saveEntity"
    />
    <MemoryApprovalDialog
      :open="approvalOpen"
      :message="approvalMessage"
      :scope-label="scopeLabel"
      :saving="approvalLoading"
      :error="approvalError"
      @close="approvalOpen = false"
      @approve="approveMemory"
    />
    <MoveConversationDialog
      :open="moveOpen"
      :conversation="moveConversation"
      :applications="tree.applications"
      :folders="tree.folders"
      :preview="movePreview"
      :loading="moveLoading"
      :error="moveError"
      @close="moveOpen = false"
      @preview-move="requestMovePreview"
      @confirm-move="confirmMove"
    />
    <ReparentFolderDialog
      :open="reparentOpen"
      :folder="reparentFolder"
      :folders="tree.folders"
      :saving="reparentSaving"
      :error="reparentError"
      @close="reparentOpen = false"
      @save="saveReparentFolder"
    />
    <SearchDialog
      :open="searchOpen"
      :applications="tree.applications"
      :folders="tree.folders"
      :results="searchResults"
      :loading="searchLoading"
      :error="searchError"
      @close="closeSearch"
      @search="runSearch"
      @select-conversation="selectConversation"
      @restore-conversation="restoreConversation"
    />
  </div>
</template>
