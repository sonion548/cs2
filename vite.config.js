import { defineConfig } from 'vite';

// In development the game server runs separately (npm run server, port 8080);
// the dev server forwards the WebSocket so the client can use the same origin.
export default defineConfig({
  server: { proxy: { '/ws': { target: 'ws://localhost:8080', ws: true } } },
  build: { chunkSizeWarningLimit: 2000, target: 'es2022' },
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
