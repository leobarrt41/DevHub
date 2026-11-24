import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'DEVHUB_');
  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/api': {
          target: env.DEVHUB_API_TARGET?.trim() || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.spec.ts'],
      clearMocks: true,
    },
  };
});
