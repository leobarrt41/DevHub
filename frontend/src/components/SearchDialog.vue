<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ArchiveRestore, ArrowUpRight, Search, X } from 'lucide-vue-next';
import { folderPathLabel } from '../services/folders';
import type { Application, Conversation, Folder, MemoryItem, SearchRequest, SearchResponse } from '../types/api';

const props = defineProps<{
  open: boolean;
  applications: Application[];
  folders: Folder[];
  results: SearchResponse | null;
  loading: boolean;
  error: string;
}>();
const emit = defineEmits<{
  close: [];
  search: [request: SearchRequest];
  selectConversation: [conversation: Conversation];
  restoreConversation: [conversation: Conversation];
}>();

const query = ref('');
const scope = ref('global');
const folderId = ref('');
const conversationId = ref('');
const category = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const includeArchived = ref(false);
const validationError = ref('');
const scopeApplications = computed(() => [...new Map(
  [...props.applications, ...(props.results?.applications ?? [])].map((application) => [application.app_id, application]),
).values()]);
const knownFolders = computed(() => [...new Map(
  [...props.folders, ...(props.results?.folders ?? [])].map((folder) => [folder.folder_id, folder]),
).values()]);
const hasResults = computed(() => {
  const results = props.results;
  return !!results && ((results.applications?.length ?? 0) + (results.folders?.length ?? 0) + results.conversations.length + results.memory_items.length > 0);
});
const folderOptions = computed(() => {
  if (scope.value === 'global') return knownFolders.value;
  if (scope.value === 'general') return knownFolders.value.filter((folder) => folder.app_id === null);
  return knownFolders.value.filter((folder) => folder.app_id === scope.value);
});

watch(() => props.open, (isOpen) => {
  if (!isOpen) return;
  query.value = '';
  scope.value = 'global';
  folderId.value = '';
  conversationId.value = '';
  category.value = '';
  dateFrom.value = '';
  dateTo.value = '';
  includeArchived.value = false;
  validationError.value = '';
});
watch(scope, () => {
  if (folderId.value && !folderOptions.value.some((folder) => folder.folder_id === folderId.value)) folderId.value = '';
});
watch([scope, folderId, conversationId, category, dateFrom, dateTo, includeArchived], () => {
  if (props.open) submit();
});

function toIsoDate(value: string, endOfDay: boolean): string | undefined {
  if (!value) return undefined;
  const time = endOfDay ? '23:59:59.999' : '00:00:00.000';
  return new Date(`${value}T${time}Z`).toISOString();
}

function submit() {
  validationError.value = dateFrom.value && dateTo.value && dateFrom.value > dateTo.value
    ? 'A data inicial deve ser anterior ou igual à data final.'
    : '';
  if (validationError.value) {
    emit('search', { query: '', filter: {} });
    return;
  }
  const appId = scope.value === 'global' ? undefined : scope.value === 'general' ? 'general' : scope.value;
  emit('search', {
    query: query.value.trim(),
    filter: {
      ...(appId !== undefined ? { app_id: appId } : {}),
      ...(folderId.value ? { folder_id: folderId.value } : {}),
      ...(conversationId.value.trim() ? { conversation_id: conversationId.value.trim() } : {}),
      ...(category.value ? { category: category.value as 'decision' | 'technical' | 'preference' } : {}),
      ...(dateFrom.value ? { date_from: toIsoDate(dateFrom.value, false) } : {}),
      ...(dateTo.value ? { date_to: toIsoDate(dateTo.value, true) } : {}),
      archived: includeArchived.value,
    },
  });
}

function selectConversation(conversation: Conversation) {
  emit('selectConversation', conversation);
  emit('close');
}
function scopeLabel(appId: string | null): string {
  if (appId === null) return 'Geral';
  const application = [...props.applications, ...(props.results?.applications ?? [])].find((item) => item.app_id === appId);
  return application?.name ?? `Indisponível (${appId.slice(0, 8)})`;
}
function folderLabel(id: string | null): string {
  if (id === null) return 'Sem pasta';
  const folder = [...props.folders, ...(props.results?.folders ?? [])].find((item) => item.folder_id === id);
  return folder ? folderPathLabel(folder, [...props.folders, ...(props.results?.folders ?? [])]) : `Indisponível (${id.slice(0, 8)})`;
}
function memoryScope(memory: MemoryItem) {
  return `Escopo: ${memory.app_id ? scopeLabel(memory.app_id) : 'Geral'} · Pasta: indisponível`;
}
function useApplicationScope(application: Application) {
  scope.value = application.app_id;
  folderId.value = '';
  submit();
}
function useFolderScope(folder: Folder) {
  scope.value = folder.app_id ?? 'general';
  folderId.value = folder.folder_id;
  submit();
}
</script>

<template>
  <div v-if="open" class="modal-scrim search-scrim" @click.self="emit('close')" @keydown.esc="emit('close')">
    <section class="modal-card search-modal" role="dialog" aria-modal="true" aria-labelledby="search-title">
      <header class="search-header">
        <Search :size="19" />
        <form class="search-form" @submit.prevent="submit">
          <label id="search-title" class="sr-only" for="global-search">Pesquisar conversas, projetos, pastas e memórias</label>
          <input id="global-search" v-model="query" autofocus placeholder="Pesquisar conversas, projetos, pastas e memórias…" @input="submit" />
        </form>
        <button class="icon-button" type="button" aria-label="Fechar busca" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="search-filters">
        <label class="search-filter-field"><span>Escopo</span>
          <select v-model="scope" class="text-input" aria-label="Escopo da busca">
            <option value="global">Global (escopo autorizado pelo token)</option>
            <option value="general">Conversas gerais</option>
            <option v-for="application in scopeApplications" :key="application.app_id" :value="application.app_id">
              {{ application.name }}{{ application.archived ? ' · arquivado' : '' }}
            </option>
          </select>
        </label>
        <label class="search-filter-field"><span>Pasta</span>
          <select v-model="folderId" class="text-input" aria-label="Filtrar por pasta">
            <option value="">Todas as pastas / sem filtro</option>
            <option v-for="folder in folderOptions" :key="folder.folder_id" :value="folder.folder_id">
              {{ folderPathLabel(folder, folders) }}{{ folder.archived ? ' · arquivada' : '' }}
            </option>
          </select>
        </label>
        <label class="search-filter-field"><span>ID da conversa</span><input v-model="conversationId" class="text-input" type="text" placeholder="Opcional" /></label>
        <label class="search-filter-field"><span>Categoria da memória</span>
          <select v-model="category" class="text-input" aria-label="Filtrar categoria da memória">
            <option value="">Todas as categorias</option><option value="decision">decision</option><option value="technical">technical</option><option value="preference">preference</option>
          </select>
        </label>
        <label class="search-filter-field"><span>Data inicial</span><input v-model="dateFrom" class="text-input" type="date" /></label>
        <label class="search-filter-field"><span>Data final</span><input v-model="dateTo" class="text-input" type="date" /></label>
        <label class="search-archived-toggle"><input v-model="includeArchived" type="checkbox" /> <span>Incluir arquivados</span></label>
        <p class="search-filter-note">Com esta opção, a API retorna itens ativos e arquivados. Datas são enviadas como ISO 8601.</p>
      </div>

      <div class="search-results" aria-live="polite">
        <p v-if="validationError" class="inline-error search-error" role="alert">{{ validationError }}</p>
        <p v-if="error" class="inline-error search-error" role="alert">{{ error }}</p>
        <div v-if="loading" class="panel-loading"><span class="button-spinner"></span> Consultando a API…</div>
        <template v-else-if="results && hasResults">
          <div v-if="results.applications?.length" class="search-result-group">
            <p class="eyebrow">PROJETOS</p>
            <article v-for="application in results.applications ?? []" :key="application.app_id" class="search-entity-result">
              <span><strong>{{ application.name }}</strong><small>Escopo: {{ application.name }} · ID {{ application.app_id }} · {{ application.archived ? 'Arquivado' : 'Ativo' }}</small></span>
              <button class="button button-quiet" type="button" @click="useApplicationScope(application)">Filtrar neste projeto</button>
            </article>
          </div>
          <div v-if="results.folders?.length" class="search-result-group">
            <p class="eyebrow">PASTAS</p>
            <article v-for="folder in results.folders ?? []" :key="folder.folder_id" class="search-entity-result">
              <span><strong>{{ folder.name }}</strong><small>Escopo: {{ scopeLabel(folder.app_id) }} · Caminho: {{ folderPathLabel(folder, [...folders, ...results.folders]) }} · ID {{ folder.folder_id }} · {{ folder.archived ? 'Arquivada' : 'Ativa' }}</small></span>
              <button class="button button-quiet" type="button" @click="useFolderScope(folder)">Filtrar nesta pasta</button>
            </article>
          </div>
          <div v-if="results.conversations.length" class="search-result-group">
            <p class="eyebrow">CONVERSAS</p>
            <div v-for="conversation in results.conversations" :key="conversation.conversation_id" class="search-result-row">
              <button class="search-result" type="button" @click="selectConversation(conversation)">
                <span><strong>{{ conversation.title }}</strong><small>Escopo: {{ scopeLabel(conversation.app_id) }} · Pasta: {{ folderLabel(conversation.folder_id) }} · ID {{ conversation.conversation_id }} · {{ conversation.archived ? 'Arquivada' : 'Ativa' }}</small></span><ArrowUpRight :size="16" />
              </button>
              <button v-if="conversation.archived" class="button button-quiet search-restore" type="button" title="Reabrir conversa" @click="emit('restoreConversation', conversation)"><ArchiveRestore :size="14" /> Reabrir</button>
            </div>
          </div>
          <div v-if="results.memory_items.length" class="search-result-group">
            <p class="eyebrow">MEMÓRIAS APROVADAS</p>
            <article v-for="memory in results.memory_items" :key="memory.memory_item_id" class="memory-search-result">
              <span class="memory-category">{{ memory.category }}</span>
              <p>{{ memory.content }}</p>
              <small>{{ memory.source_label }} · {{ memoryScope(memory) }} · ID {{ memory.memory_item_id }}</small>
            </article>
          </div>
        </template>
        <p v-else-if="query.trim().length >= 2 && results" class="empty-state compact-empty">Nenhum resultado retornado pela API.</p>
        <p v-else class="empty-state compact-empty">Digite ao menos dois caracteres para pesquisar no histórico persistido.</p>
      </div>
    </section>
  </div>
</template>
