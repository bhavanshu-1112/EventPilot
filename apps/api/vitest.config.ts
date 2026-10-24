import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      ANTHROPIC_API_KEY: 'sk-ant-test-placeholder',
      LLM_MODE: 'fixture',
      NOTIFY_MODE: 'dry-run',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
    },
  },
});
