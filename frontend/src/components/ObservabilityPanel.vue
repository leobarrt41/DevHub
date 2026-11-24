<script setup lang="ts">
import { computed } from 'vue';
import { Activity, Clock3, RefreshCw, RotateCcw, X } from 'lucide-vue-next';
import type { ObservabilityResponse, Task, TaskDetailResponse } from '../types/api';
import { formatCost } from '../services/api';

const props = defineProps<{
  summary: ObservabilityResponse | null;
  loading: boolean;
  error: string;
  detail: TaskDetailResponse | null;
  detailLoading: boolean;
  detailError: string;
  reconcilingTaskId: string | null;
}>();
const emit = defineEmits<{ reload: []; selectTask: [task: Task]; closeDetail: []; reconcileTask: [task: Task] }>();
const recentTasks = computed(() => props.summary?.tasks ?? []);
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function tokenValue(value: number | null) { return value == null ? 'Indisponível' : value.toLocaleString('pt-BR'); }
function safePayload(payload: Record<string, unknown>) {
  try { return JSON.stringify(payload); } catch { return 'Payload indisponível'; }
}
</script>

<template>
  <aside class="side-panel observability-panel" aria-label="Observabilidade mínima">
    <header class="side-panel-header">
      <div><p class="eyebrow">REGISTROS DA API</p><h2>Atividade</h2><p class="side-panel-subtitle">Tarefas e custos confirmados</p></div>
      <button class="tiny-icon" type="button" title="Atualizar observabilidade" :disabled="loading" @click="emit('reload')"><RefreshCw :size="14" :class="{ spin: loading }" /></button>
    </header>

    <div v-if="loading && !summary" class="panel-loading"><span class="button-spinner"></span> Consultando tarefas…</div>
    <p v-else-if="error && !summary" class="inline-error panel-error" role="alert">{{ error }}</p>
    <template v-else-if="summary">
      <div class="metrics-grid">
        <div><span>Tarefas</span><strong>{{ summary.total_tasks }}</strong></div>
        <div><span>Concluídas</span><strong>{{ summary.completed_tasks }}</strong></div>
        <div><span>Falhas</span><strong>{{ summary.failed_tasks }}</strong></div>
        <div><span>Ativas</span><strong>{{ summary.active_tasks }}</strong></div>
      </div>
      <div class="cost-summary"><span>Custo confirmado</span><strong>{{ formatCost(summary.confirmed_cost_usd) }}</strong><small>{{ summary.unaccounted_tasks }} tarefa(s) sem contabilização confirmada</small></div>
      <p v-if="error" class="inline-error panel-error" role="alert">{{ error }}</p>
      <div class="task-list-head"><span class="eyebrow">TAREFAS</span><span>{{ recentTasks.length }} registro(s)</span></div>
      <div v-if="recentTasks.length" class="task-list">
        <button v-for="task in recentTasks" :key="task.task_id" class="task-row" type="button" @click="emit('selectTask', task)">
          <span class="task-status-dot" :class="`task-${task.status}`"></span>
          <span class="task-row-main"><strong>{{ task.model_id || 'Modelo indisponível' }}</strong><small>{{ task.task_id.slice(0, 8) }} · {{ task.status }}</small></span>
          <span class="task-row-cost">{{ formatCost(task.cost_usd) }}</span>
        </button>
      </div>
      <p v-else class="panel-empty compact-panel-empty"><Activity :size="17" />Nenhuma tarefa retornada pela API.</p>
    </template>

    <section v-if="detail || detailLoading || detailError" class="task-detail">
      <header class="task-detail-heading"><div><p class="eyebrow">DETALHE</p><h3>{{ detail?.task.task_id.slice(0, 12) ?? 'Tarefa' }}</h3></div><button class="tiny-icon" type="button" aria-label="Fechar detalhe" @click="emit('closeDetail')"><X :size="14" /></button></header>
      <div v-if="detailLoading" class="panel-loading"><span class="button-spinner"></span> Carregando eventos…</div>
      <p v-else-if="detailError" class="inline-error panel-error" role="alert">{{ detailError }}</p>
      <template v-else-if="detail">
        <div v-if="detail.task.status === 'running'" class="task-reconcile">
          <p>A API só permite reconciliar após 600s sem heartbeat; recusas mostram o erro real. A ação não repete a chamada ao provedor.</p>
          <button class="button button-quiet" type="button" :disabled="reconcilingTaskId === detail.task.task_id" @click="emit('reconcileTask', detail.task)">
            <RotateCcw :size="13" /> {{ reconcilingTaskId === detail.task.task_id ? 'Reconciliando…' : 'Reconciliar estado' }}
          </button>
        </div>
        <dl class="task-facts">
          <div><dt>Status</dt><dd>{{ detail.task.status }}</dd></div>
          <div><dt>Modelo</dt><dd>{{ detail.task.model_id || 'Indisponível' }}</dd></div>
          <div><dt>Trace</dt><dd class="mono">{{ detail.task.trace_id || 'Indisponível' }}</dd></div>
          <div><dt>Tokens entrada / saída</dt><dd>{{ tokenValue(detail.task.input_tokens) }} / {{ tokenValue(detail.task.output_tokens) }}</dd></div>
          <div><dt>Custo</dt><dd>{{ formatCost(detail.task.cost_usd) }} · {{ detail.task.cost_status || 'Indisponível' }}</dd></div>
          <div><dt>Duração</dt><dd><Clock3 :size="13" /> {{ detail.task.duration_ms == null ? 'Indisponível' : `${detail.task.duration_ms} ms` }}</dd></div>
        </dl>
        <div class="event-list">
          <p class="eyebrow">EVENTOS PERSISTIDOS</p>
          <article v-for="event in detail.events" :key="event.event_id" class="event-row">
            <span class="event-sequence mono">{{ event.sequence.toString().padStart(2, '0') }}</span>
            <div><strong>{{ event.kind }} · {{ event.status }}</strong><small>{{ formatDate(event.created_at) }}</small><code>{{ safePayload(event.payload) }}</code></div>
          </article>
          <p v-if="!detail.events.length" class="form-hint">Nenhum evento retornado.</p>
        </div>
      </template>
    </section>
  </aside>
</template>
