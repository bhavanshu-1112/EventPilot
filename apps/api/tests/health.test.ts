import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/server.js';

const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  ANTHROPIC_API_KEY: 'sk-ant-test-placeholder',
  LLM_MODE: 'fixture',
  NOTIFY_MODE: 'dry-run',
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
};

describe('health endpoints', () => {
  it('GET /healthz returns 200 with status ok', async () => {
    const app = await buildApp(TEST_ENV);

    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();

    await app.close();
  });

  it('GET /readyz returns 200 with check statuses', async () => {
    const app = await buildApp(TEST_ENV);

    const response = await app.inject({
      method: 'GET',
      url: '/readyz',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.checks).toBeDefined();

    await app.close();
  });
});
