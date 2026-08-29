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

  it('serves the navigable control plane without embedding credentials', async () => {
    const response = await worker.fetch(new Request('https://crapi.test/admin'), {
      APP_ENV: 'test',
    });
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(page).toContain('CrAPi Control Plane');
    expect(page).not.toContain('SUPABASE_SECRET_KEY');
  });

  it('rejects control plane API calls without the admin token', async () => {
    const response = await worker.fetch(
      new Request('https://crapi.test/admin/api/applications'),
      {
        APP_ENV: 'test',
        ADMIN_TOKEN: '0123456789abcdef0123456789abcdef',
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'UNAUTHORIZED' });
  });
});
