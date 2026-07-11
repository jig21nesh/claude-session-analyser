import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const WEB_PORT = Number.parseInt(process.env.PORT || '15800', 10);
const API_PORT = Number.parseInt(process.env.API_PORT || '15801', 10);

export default defineConfig({
  plugins: [react()],
  server: {
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
