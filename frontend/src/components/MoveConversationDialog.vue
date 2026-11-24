<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { AlertTriangle, ArrowRight, Check, LoaderCircle, X } from 'lucide-vue-next';
import type { Application, Conversation, Folder, MemoryItem, MovePreview } from '../types/api';

const props = defineProps<{
  open: boolean;
  conversation: Conversation | null;
  applications: Application[];
  folders: Folder[];
  preview: MovePreview | null;
  loading: boolean;
  error: string;
}>();
const emit = defineEmits<{
  close: [];
  previewMove: [destination: { app_id: string | null; folder_id: string | null }];
  confirmMove: [payload: { app_id: string | null; folder_id: string | null; move_token: string; approved_memory_ids: string[] }];
}>();

const destinationApp = ref('');
const destinationFolder = ref('');
const selectedMemories = ref<string[]>([]);
const requestedTarget = ref('');
const destinationFolders = computed(() => props.folders.filter((folder) => folder.archived === false && folder.app_id === (destinationApp.value || null)));
const targetKey = computed(() => `${destinationApp.value || 'general'}:${destinationFolder.value || ''}`);
const currentPreview = computed(() => props.preview && requestedTarget.value === targetKey.value ? props.preview : null);

watch(() => [props.open, props.conversation?.conversation_id], () => {
  if (!props.open || !props.conversation) return;
  destinationApp.value = props.conversation.app_id ?? '';
  destinationFolder.value = props.conversation.folder_id ?? '';
  selectedMemories.value = [];
  requestedTarget.value = '';
}, { immediate: true });
watch([destinationApp, destinationFolder], () => { selectedMemories.value = []; });
watch(destinationApp, () => {
  if (destinationFolder.value && !destinationFolders.value.some((folder) => folder.folder_id === destinationFolder.value)) {
    destinationFolder.value = '';
  }
});

function requestPreview() {
  if (props.loading) return;
  selectedMemories.value = [];
  requestedTarget.value = targetKey.value;
  emit('previewMove', { app_id: destinationApp.value || null, folder_id: destinationFolder.value || null });
}
function toggleMemory(memory: MemoryItem, checked: boolean) {
  selectedMemories.value = checked
    ? [...selectedMemories.value, memory.memory_item_id]
    : selectedMemories.value.filter((id) => id !== memory.memory_item_id);
}
function confirm() {
  if (!currentPreview.value || props.loading) return;
  emit('confirmMove', {
    app_id: destinationApp.value || null,
    folder_id: destinationFolder.value || null,
    move_token: currentPreview.value.move_token,
    approved_memory_ids: [...selectedMemories.value],
  });
}
</script>

<template>
  <div v-if="open && conversation" class="modal-scrim" @click.self="!loading && emit('close')">
    <section class="modal-card move-modal" role="dialog" aria-modal="true" aria-labelledby="move-title">
      <header class="modal-header">
        <div><p class="eyebrow">MUDANÇA DE ESCOPO</p><h2 id="move-title">Mover conversa</h2></div>
        <button class="icon-button" type="button" aria-label="Fechar" :disabled="loading" @click="emit('close')"><X :size="18" /></button>
      </header>
      <p class="modal-context move-conversation-title">{{ conversation.title }}</p>
      <div class="move-route"><span>{{ conversation.app_id ? (applications.find((item) => item.app_id === conversation?.app_id)?.name ?? 'Projeto atual') : 'Conversas gerais' }}</span><ArrowRight :size="16" /><span>{{ destinationApp ? (applications.find((item) => item.app_id === destinationApp)?.name ?? 'Projeto') : 'Conversas gerais' }}</span></div>
      <div class="form-grid">
        <div>
          <label class="field-label" for="move-app">Projeto de destino</label>
          <select id="move-app" v-model="destinationApp" class="text-input">
            <option value="">Conversas gerais</option>
            <option v-for="application in applications" :key="application.app_id" :value="application.app_id">{{ application.name }}</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="move-folder">Pasta de destino</label>
          <select id="move-folder" v-model="destinationFolder" class="text-input">
            <option value="">Sem pasta</option>
            <option v-for="folder in destinationFolders" :key="folder.folder_id" :value="folder.folder_id">{{ folder.name }}</option>
          </select>
        </div>
      </div>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <button class="button button-secondary preview-button" type="button" :disabled="loading" @click="requestPreview">
        <LoaderCircle v-if="loading" class="spin" :size="16" />
        <span>{{ loading ? 'Consultando prévia…' : 'Consultar prévia de movimentação' }}</span>
      </button>

      <section v-if="currentPreview" class="move-preview" aria-live="polite">
        <div class="warning-block"><AlertTriangle :size="17" /><p>{{ currentPreview.warning }}</p></div>
        <p class="form-hint">Revise as memórias candidatas. Nenhuma será incorporada sem seleção explícita.</p>
        <div v-if="currentPreview.candidates.length" class="candidate-list">
          <label v-for="memory in currentPreview.candidates" :key="memory.memory_item_id" class="candidate-row">
            <input type="checkbox" :checked="selectedMemories.includes(memory.memory_item_id)" @change="toggleMemory(memory, ($event.target as HTMLInputElement).checked)" />
            <span class="candidate-copy"><strong>{{ memory.category }}</strong><span>{{ memory.content }}</span><small>{{ memory.source_label }} · {{ memory.memory_item_id.slice(0, 8) }}</small></span>
          </label>
        </div>
        <p v-else class="tree-empty">A API não retornou memórias candidatas para esta movimentação.</p>
        <div class="explicit-consent"><Check :size="15" /><span>Somente {{ selectedMemories.length }} selecionada(s) será(ão) considerada(s).</span></div>
      </section>
      <footer class="modal-actions">
        <button class="button button-quiet" type="button" :disabled="loading" @click="emit('close')">Cancelar</button>
        <button class="button button-primary" type="button" :disabled="!currentPreview || loading" @click="confirm">Confirmar movimentação</button>
      </footer>
    </section>
  </div>
</template>
