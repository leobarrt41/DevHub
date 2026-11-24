<script setup lang="ts">
import { ref } from 'vue';
import { Database, RefreshCw, Search, Trash2 } from 'lucide-vue-next';
import type { MemoryItem } from '../types/api';

const props = defineProps<{ items: MemoryItem[]; scopeLabel: string; loading: boolean; error: string }>();
const emit = defineEmits<{ reload: [query: string]; remove: [memory: MemoryItem] }>();
const query = ref('');
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}
</script>

<template>
  <aside class="side-panel" aria-label="Memória aprovada do projeto">
    <header class="side-panel-header">
      <div><p class="eyebrow">CONTEXTO COMPARTILHADO</p><h2>Memória</h2><p class="side-panel-subtitle">{{ scopeLabel }}</p></div>
      <button class="tiny-icon" type="button" title="Atualizar memórias" :disabled="loading" @click="emit('reload', query)"><RefreshCw :size="14" :class="{ spin: loading }" /></button>
    </header>
    <form class="memory-search" @submit.prevent="emit('reload', query)">
      <Search :size="15" /><input v-model="query" type="search" placeholder="Filtrar memória…" /><button type="submit" aria-label="Pesquisar memória"><Search :size="14" /></button>
    </form>
    <div v-if="loading" class="panel-loading"><span class="button-spinner"></span> Carregando da API…</div>
    <p v-else-if="error" class="inline-error panel-error" role="alert">{{ error }}</p>
    <div v-else-if="items.length" class="memory-list">
      <article v-for="memory in items" :key="memory.memory_item_id" class="memory-card">
        <div class="memory-card-top"><span class="memory-category">{{ memory.category }}</span><button class="tiny-icon danger-hover" type="button" title="Remover memória" @click="emit('remove', memory)"><Trash2 :size="14" /></button></div>
        <p>{{ memory.content }}</p>
        <footer><span>{{ memory.source_label }}</span><time>{{ formatDate(memory.created_at) }}</time></footer>
        <code class="memory-id">{{ memory.memory_item_id }}</code>
      </article>
    </div>
    <div v-else class="panel-empty"><Database :size="18" /><p>Nenhuma memória retornada para este escopo.</p><small>Itens só entram aqui após aprovação explícita.</small></div>
  </aside>
</template>
