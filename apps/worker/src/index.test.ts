import { describe, expect, it } from 'vitest';

import worker from './index.js';

describe('worker foundation', () => {
  it('serves liveness without exposing secrets', async () => {
    const response = await worker.fetch(new Request('https://crapi.test/health'), {
      APP_ENV: 'test',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'crapi',
      environment: 'test',
    });
  });

  it('fails readiness closed when secrets are missing', async () => {
    const response = await worker.fetch(new Request('https://crapi.test/ready'), {
      APP_ENV: 'test',
    });

    expect(response.status).toBe(503);
  });
});
