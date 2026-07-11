import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read PORT/API_PORT from the shell or the repo-root .env file.
  const env = { ...loadEnv(mode, path.resolve(import.meta.dirname, '..'), ''), ...process.env };
  const webPort = Number.parseInt(env.PORT || '15800', 10);
  const apiPort = Number.parseInt(env.API_PORT || '15801', 10);

  return {
  plugins: [react()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
  };
});
