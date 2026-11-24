<script setup lang="ts">
import { ref } from 'vue';
import { ArrowRight, KeyRound, ShieldCheck } from 'lucide-vue-next';

const props = defineProps<{ loading: boolean; error: string }>();
const emit = defineEmits<{ authenticate: [token: string] }>();
const token = ref('');

function submit() {
  const value = token.value.trim();
  if (value && !props.loading) emit('authenticate', value);
}
</script>

<template>
  <main class="auth-shell">
    <section class="auth-card" aria-labelledby="auth-title">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true"><span>DH</span></div>
        <div><strong>DevHub</strong><span class="brand-ai">AI</span></div>
      </div>
      <div class="auth-kicker"><span class="status-dot"></span> CONEXÃO PESSOAL</div>
      <h1 id="auth-title">Seu trabalho técnico,<br /><em>com continuidade.</em></h1>
      <p class="auth-copy">Conecte-se ao seu DevHub para abrir conversas, decisões e tarefas persistidas.</p>
      <form class="auth-form" @submit.prevent="submit">
        <label for="access-token">Token de acesso pessoal</label>
        <div class="token-input-wrap">
          <KeyRound :size="17" aria-hidden="true" />
          <input
            id="access-token"
            v-model="token"
            type="password"
            name="token"
            autocomplete="current-password"
            placeholder="Cole seu token revogável"
            required
            :disabled="loading"
          />
        </div>
        <p class="privacy-note"><ShieldCheck :size="15" /> O token fica apenas nesta aba e só é guardado após validação.</p>
        <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
        <button class="button button-primary auth-submit" type="submit" :disabled="loading || !token.trim()">
          <span>{{ loading ? 'Validando acesso…' : 'Conectar ao DevHub' }}</span>
          <ArrowRight v-if="!loading" :size="17" />
          <span v-else class="button-spinner" aria-hidden="true"></span>
        </button>
      </form>
      <div class="auth-foot"><span class="mono">API /api/v1</span><span>Origem autenticada · HTTPS recomendado</span></div>
    </section>
    <div class="auth-side-note"><span class="mono">DH / 01</span><p>Contexto aprovado<br />permanece no projeto.</p></div>
  </main>
</template>
