import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { attachLanSignaling, handleLanInfo, LAN_INFO_PATH } from './scripts/lan-signaling.mjs';
import { createMockMiddleware } from './scripts/mock-preview.mjs';

function lanSignalingPlugin() {
  return {
    name: 'lan-signaling',
    configureServer(server: import('vite').ViteDevServer) {
      attachLanSignaling(server.httpServer);
      server.middlewares.use(LAN_INFO_PATH, handleLanInfo);
    },
    configurePreviewServer(server: import('vite').PreviewServer) {
      attachLanSignaling(server.httpServer);
      server.middlewares.use(LAN_INFO_PATH, handleLanInfo);
    },
  };
}

const DEMO_MOCK_SNAPSHOT = JSON.stringify({
  mockSnapshot: 1,
  name: 'local-preview',
  routes: [{ method: 'GET', path: '/users/:id', status: 200, headers: [], body: '{"id":"{{params.id}}","trace":"{{$uuid}}"}', delayMs: 0 }],
});

/** 本地验证 api-mock 行为：GET http://localhost:5173/__mock/users/42（快照可用 env 或 mock-snapshot.json 覆盖）。 */
function mockPreviewPlugin() {
  const snapshotFile = path.resolve(__dirname, 'mock-snapshot.json');
  const plugin = {
    name: 'mock-preview',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(createMockMiddleware(
        process.env.MOCK_PREVIEW_CONFIG ?? (existsSync(snapshotFile) ? readFileSync(snapshotFile, 'utf8') : DEMO_MOCK_SNAPSHOT),
      ));
    },
  };
  return plugin;
}

const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss(), lanSignalingPlugin(), mockPreviewPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // 'react-dom/client' 必须单列：只写 'react-dom' 时 scheduler 与 client 入口
          // 会落回主入口，导致框架代码和应用代码混在同一块里，发版后用户要重下整包。
          react: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
      reporter: ['text', 'html'],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});
