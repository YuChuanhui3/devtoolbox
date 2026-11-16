import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['tests/native/pdf/**/*.test.js'],exclude:['**/e2e/**'],testTimeout:20000,pool:'forks',maxWorkers:2}});
