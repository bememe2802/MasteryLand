import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The client lives in client/ and builds to dist/, which the Node server serves.
// `npm run dev:client` serves it with hot reload on 5174 and forwards /api and /ws to the game server.
export default defineConfig({
  root: 'client',
  plugins: [vue()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:5173',
      '/ws': { target: 'ws://localhost:5173', ws: true },
    },
  },
});
