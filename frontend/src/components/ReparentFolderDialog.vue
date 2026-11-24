<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { folderPathLabel, reparentCandidates } from '../services/folders';
import type { Folder } from '../types/api';

const props = defineProps<{
  open: boolean;
  folder: Folder | null;
  folders: Folder[];
  saving: boolean;
  error: string;
}>();
const emit = defineEmits<{ close: []; save: [parentFolderId: string | null] }>();
const selectedParentId = ref('');
const candidates = computed(() => props.folder ? reparentCandidates(props.folders, props.folder) : []);
const rootLabel = computed(() => props.folder?.app_id ? 'Raiz do projeto' : 'Raiz das conversas gerais');

watch(() => [props.open, props.folder?.folder_id, props.folder?.parent_folder_id], () => {
  selectedParentId.value = props.folder?.parent_folder_id ?? '';
}, { immediate: true });

function submit() {
  if (!props.folder || props.saving) return;
  emit('save', selectedParentId.value || null);
}
</script>

<template>
  <div v-if="open" class="modal-scrim" @click.self="!saving && emit('close')" @keydown.esc="!saving && emit('close')">
    <section class="modal-card small-modal" role="dialog" aria-modal="true" aria-labelledby="reparent-title">
      <header class="modal-header">
        <div><p class="eyebrow">ORGANIZAÇÃO</p><h2 id="reparent-title">Reorganizar pasta</h2></div>
        <button class="icon-button" type="button" aria-label="Fechar" :disabled="saving" @click="emit('close')"><X :size="18" /></button>
      </header>
      <p v-if="folder" class="modal-context">
        <strong>{{ folder.name }}</strong> permanece no mesmo {{ folder.app_id ? 'projeto' : 'escopo geral' }}. O ID da pasta não muda.
      </p>
      <form @submit.prevent="submit">
        <label class="field-label" for="folder-parent">Pasta pai</label>
        <select id="folder-parent" v-model="selectedParentId" class="text-input" :disabled="saving || !folder">
          <option value="">{{ rootLabel }}</option>
          <option v-for="candidate in candidates" :key="candidate.folder_id" :value="candidate.folder_id">
            {{ folderPathLabel(candidate, folders) }}
          </option>
        </select>
        <p class="form-hint">A própria pasta e suas descendentes não aparecem como destino. A API também valida que a árvore não forme ciclos.</p>
        <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
        <footer class="modal-actions">
          <button class="button button-quiet" type="button" :disabled="saving" @click="emit('close')">Cancelar</button>
          <button class="button button-primary" type="submit" :disabled="saving || !folder">{{ saving ? 'Salvando…' : 'Mover pasta' }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>
