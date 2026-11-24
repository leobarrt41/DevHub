<script setup lang="ts">
import { ref, watch } from 'vue';
import { ShieldCheck, X } from 'lucide-vue-next';
import type { MemoryCategory, Message } from '../types/api';

const props = defineProps<{ open: boolean; message: Message | null; scopeLabel: string; saving: boolean; error: string }>();
const emit = defineEmits<{
  close: [];
  approve: [payload: { content: string; category: MemoryCategory }];
}>();
const content = ref('');
const category = ref<MemoryCategory>('decision');

watch(() => [props.open, props.message?.message_id], () => {
  content.value = props.message?.content ?? '';
  category.value = 'decision';
}, { immediate: true });
</script>

<template>
  <div v-if="open && message" class="modal-scrim" @click.self="!saving && emit('close')">
    <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="memory-approval-title">
      <header class="modal-header">
        <div><p class="eyebrow">MEMÓRIA EXPLÍCITA</p><h2 id="memory-approval-title">Aprovar para {{ scopeLabel }}</h2></div>
        <button class="icon-button" type="button" aria-label="Fechar" :disabled="saving" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="approval-callout"><ShieldCheck :size="17" /><span>Esta informação só será compartilhada no escopo indicado após sua confirmação.</span></div>
      <form @submit.prevent="content.trim() && emit('approve', { content: content.trim(), category })">
        <label class="field-label" for="memory-content">Conteúdo revisável</label>
        <textarea id="memory-content" v-model="content" class="text-input memory-editor" rows="7" maxlength="6000" required />
        <label class="field-label" for="memory-category">Categoria</label>
        <select id="memory-category" v-model="category" class="text-input">
          <option value="decision">Decisão confirmada</option>
          <option value="technical">Conhecimento técnico</option>
          <option value="preference">Preferência</option>
        </select>
        <p class="form-hint">Origem: mensagem {{ message.message_id.slice(0, 8) }} · o vínculo será enviado à API.</p>
        <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
        <footer class="modal-actions">
          <button class="button button-quiet" type="button" :disabled="saving" @click="emit('close')">Cancelar</button>
          <button class="button button-primary" type="submit" :disabled="saving || !content.trim()">{{ saving ? 'Salvando…' : 'Aprovar memória' }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>
