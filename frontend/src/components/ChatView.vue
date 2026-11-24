<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Activity, Check, Copy, Database, MessageSquareText, PanelLeftOpen,
  Send, ShieldCheck, Square, Workflow,
} from 'lucide-vue-next';
import type { Conversation, MemoryItem, Message, ModelInfo } from '../types/api';

const props = defineProps<{
  conversation: Conversation | null;
  scopeLabel: string;
  messages: Message[];
  models: ModelInfo[];
  selectedModel: string;
  draft: string;
  streaming: boolean;
  loadingHistory: boolean;
  currentTaskId: string | null;
  currentTraceId: string | null;
  openrouterConfigured: boolean;
  error: string;
}>();
const emit = defineEmits<{
  'update:selectedModel': [value: string];
  'update:draft': [value: string];
  send: [];
  stop: [];
  approveMemory: [message: Message];
  toggleMemory: [];
  toggleObservability: [];
  toggleMobileSidebar: [];
}>();
const messageContainer = ref<HTMLElement | null>(null);
const copiedId = ref<string | null>(null);
const sortedMessages = computed(() => props.messages);

watch(() => props.messages.map((message) => `${message.message_id}:${message.content}`).join('\u0000'), async () => {
  await nextTick();
  if (messageContainer.value) messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
});

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function sourceCaption(source: unknown): string {
  if (typeof source === 'string') return source;
  if (!source || typeof source !== 'object') return 'Fonte de contexto';
  const item = source as Partial<MemoryItem> & { label?: string; title?: string };
  return item.source_label || item.label || item.title || item.memory_item_id?.slice(0, 8) || 'Fonte de contexto';
}
function modelTitle(model: ModelInfo) {
  const prompt = model.pricing?.prompt;
  const completion = model.pricing?.completion;
  const price = (value: string | number | null | undefined) => value == null ? '—' : `$${value}`;
  return `${model.name} · ${model.id} · entrada ${price(prompt)}/token · saída ${price(completion)}/token`;
}
async function copyMessage(message: Message) {
  try {
    await navigator.clipboard.writeText(message.content);
    copiedId.value = message.message_id;
    window.setTimeout(() => { copiedId.value = null; }, 1500);
  } catch {
    copiedId.value = null;
  }
}
function submit() {
  if (!props.streaming && props.draft.trim() && props.conversation && props.selectedModel) emit('send');
}
</script>

<template>
  <main class="chat-main">
    <header class="conversation-header">
      <div class="header-leading">
        <button class="icon-button mobile-only" type="button" aria-label="Abrir navegação" @click="emit('toggleMobileSidebar')"><PanelLeftOpen :size="18" /></button>
        <div class="conversation-heading">
          <div class="breadcrumbs"><span>{{ scopeLabel }}</span><span class="crumb-separator">/</span><span class="mono">{{ conversation?.conversation_id.slice(0, 8) ?? 'SEM CONVERSA' }}</span></div>
          <h1>{{ conversation?.title ?? 'DevHub AI' }}</h1>
        </div>
      </div>
      <div class="header-actions">
        <button class="toolbar-button" type="button" :disabled="!conversation" @click="emit('toggleMemory')"><Database :size="15" /><span>Memória</span></button>
        <button class="toolbar-button" type="button" @click="emit('toggleObservability')"><Activity :size="15" /><span>Atividade</span></button>
      </div>
    </header>

    <div v-if="conversation" ref="messageContainer" class="message-scroll" aria-live="polite">
      <div v-if="loadingHistory" class="history-loading"><span class="button-spinner"></span><span>Carregando histórico preservado…</span></div>
      <div v-else-if="!sortedMessages.length && !streaming" class="empty-chat">
        <div class="empty-mark"><MessageSquareText :size="20" /></div>
        <p class="eyebrow">CONVERSA PERSISTENTE</p>
        <h2>Qual é o próximo passo<br />do seu projeto?</h2>
        <p>O histórico desta conversa é separado. Memórias aprovadas são recuperadas pelo projeto quando disponíveis.</p>
      </div>
      <article
        v-for="message in sortedMessages"
        :key="message.message_id || 'streaming-message'"
        class="message-block"
        :class="[`message-${message.role}`, { 'message-live': message.status === 'streaming' }]"
      >
        <div class="message-avatar" :class="message.role">
          <span v-if="message.role === 'user'">{{ 'EU' }}</span>
          <span v-else class="assistant-mark">DH</span>
        </div>
        <div class="message-content-wrap">
          <div class="message-meta">
            <strong>{{ message.role === 'user' ? 'Você' : 'DevHub AI' }}</strong>
            <span v-if="message.created_at" class="message-date">{{ formatDate(message.created_at) }}</span>
            <span v-if="message.status !== 'completed'" class="message-status" :class="`status-${message.status}`">{{ message.status }}</span>
          </div>
          <div class="message-content" :class="{ 'stream-cursor': message.status === 'streaming' }">{{ message.content || (message.status === 'streaming' ? 'Pensando…' : '') }}</div>
          <div v-if="message.context_sources?.length" class="context-sources">
            <span class="context-label"><Workflow :size="13" /> CONTEXTO RECUPERADO</span>
            <span v-for="(source, index) in message.context_sources" :key="index" class="context-source" :title="sourceCaption(source)">{{ sourceCaption(source) }}</span>
          </div>
          <div class="message-tools">
            <button v-if="message.content" class="message-tool" type="button" :title="copiedId === message.message_id ? 'Copiado' : 'Copiar mensagem'" @click="copyMessage(message)"><Check v-if="copiedId === message.message_id" :size="13" /><Copy v-else :size="13" /><span>{{ copiedId === message.message_id ? 'Copiado' : 'Copiar' }}</span></button>
            <button v-if="message.message_id && !message.message_id.startsWith('local-') && message.status === 'completed'" class="message-tool" type="button" @click="emit('approveMemory', message)"><ShieldCheck :size="13" /><span>Aprovar memória</span></button>
            <span v-if="message.task_id" class="message-task mono" :title="`Tarefa ${message.task_id}`">task {{ message.task_id.slice(0, 8) }}</span>
          </div>
        </div>
      </article>
      <div v-if="currentTaskId" class="stream-task-line"><span class="status-dot pulse"></span><span>Resposta em andamento</span><span class="mono">task {{ currentTaskId.slice(0, 8) }}</span><span v-if="currentTraceId" class="mono">trace {{ currentTraceId.slice(0, 8) }}</span></div>
      <p v-if="error" class="chat-error" role="alert">{{ error }}</p>
    </div>

    <div v-else class="no-conversation-state">
      <div class="empty-mark"><MessageSquareText :size="20" /></div>
      <p class="eyebrow">ESPAÇO DE TRABALHO</p>
      <h2>Conversa primeiro.<br /><em>Contexto em seguida.</em></h2>
      <p>Selecione uma conversa existente ou crie uma nova pela navegação lateral.</p>
    </div>

    <footer class="composer-shell" :class="{ 'composer-disabled': !conversation }">
      <div v-if="conversation && !openrouterConfigured" class="configuration-warning"><span class="status-dot attention"></span> O servidor indica que OpenRouter não está configurado. O envio ficará indisponível.</div>
      <form class="composer" @submit.prevent="submit">
        <label class="sr-only" for="message-draft">Escreva uma mensagem</label>
        <textarea
          id="message-draft"
          :value="draft"
          :disabled="!conversation || !openrouterConfigured || streaming"
          rows="3"
          placeholder="Descreva o que você quer resolver…"
          @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)"
          @keydown.enter.exact.prevent="submit"
        />
        <div class="composer-footer">
          <div class="model-control">
            <span class="model-label">MODELO</span>
            <select :value="selectedModel" :disabled="!models.length || streaming" aria-label="Selecionar modelo do catálogo OpenRouter" @change="emit('update:selectedModel', ($event.target as HTMLSelectElement).value)">
              <option v-if="!models.length" value="">Catálogo indisponível</option>
              <option v-for="model in models" :key="model.id" :value="model.id" :title="modelTitle(model)">{{ model.name }} · {{ model.id }}</option>
            </select>
            <span v-if="models.find((model) => model.id === selectedModel)" class="model-price">US$/token · in {{ models.find((model) => model.id === selectedModel)?.pricing.prompt ?? '—' }} · out {{ models.find((model) => model.id === selectedModel)?.pricing.completion ?? '—' }}</span>
          </div>
          <div class="composer-actions">
            <span class="composer-hint">Enter envia · Shift+Enter quebra linha</span>
            <button v-if="streaming" class="button button-stop" type="button" @click="emit('stop')"><Square :size="13" fill="currentColor" /> Parar</button>
            <button v-else class="send-button" type="submit" aria-label="Enviar mensagem" :disabled="!conversation || !openrouterConfigured || !selectedModel || !draft.trim()"><Send :size="16" /></button>
          </div>
        </div>
      </form>
      <p class="composer-disclaimer">Sem retry automático. Uma desconexão pode deixar resultado parcial; o histórico será recarregado.</p>
    </footer>
  </main>
</template>
