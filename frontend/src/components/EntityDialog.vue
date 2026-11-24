<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';

const props = defineProps<{
  open: boolean;
  title: string;
  label: string;
  initialName?: string;
  context?: string;
  saving: boolean;
}>();
const emit = defineEmits<{ close: []; save: [name: string] }>();
const name = ref('');
const inputId = computed(() => `entity-name-${props.label.toLowerCase().replace(/\W+/g, '-')}`);

watch(() => [props.open, props.initialName], () => { name.value = props.initialName ?? ''; }, { immediate: true });
</script>

<template>
  <div v-if="open" class="modal-scrim" @click.self="!saving && emit('close')" @keydown.esc="!saving && emit('close')">
    <section class="modal-card small-modal" role="dialog" aria-modal="true" :aria-labelledby="`${inputId}-title`">
      <header class="modal-header">
        <div><p class="eyebrow">ORGANIZAÇÃO</p><h2 :id="`${inputId}-title`">{{ title }}</h2></div>
        <button class="icon-button" type="button" aria-label="Fechar" :disabled="saving" @click="emit('close')"><X :size="18" /></button>
      </header>
      <p v-if="context" class="modal-context">{{ context }}</p>
      <form @submit.prevent="name.trim() && emit('save', name.trim())">
        <label class="field-label" :for="inputId">{{ label }}</label>
        <input :id="inputId" v-model="name" class="text-input" type="text" maxlength="160" required autofocus :disabled="saving" />
        <footer class="modal-actions">
          <button class="button button-quiet" type="button" :disabled="saving" @click="emit('close')">Cancelar</button>
          <button class="button button-primary" type="submit" :disabled="saving || !name.trim()">{{ saving ? 'Salvando…' : 'Salvar' }}</button>
        </footer>
      </form>
    </section>
  </div>
</template>
