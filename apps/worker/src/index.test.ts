import { describe, expect, it } from 'vitest';

import worker from './index.js';

const authEnv = {
  APP_ENV: 'test',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwxyz',
  API_KEY_PEPPER: '0123456789abcdef0123456789abcdef',
};

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

  it('fails readiness closed when required runtime configuration is missing', async () => {
    const response = await worker.fetch(new Request('https://crapi.test/ready'), {
      APP_ENV: 'test',
    });

    expect(response.status).toBe(503);
  });

  it('reports ready when database, auth and API key security are configured', async () => {
    const response = await worker.fetch(new Request('https://crapi.test/ready'), {
      ...authEnv,
      SUPABASE_SECRET_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ready',
      dependencies: {
        database: 'configured',
        auth: 'configured',
        api_key_pepper: 'configured',
        bootstrap_token: 'missing',
      },
    });
  });

  it('serves a dedicated login experience without embedding server credentials', async () => {
    const response = await worker.fetch(new Request('https://crapi.test/login'), {
      APP_ENV: 'test',
    });
    const page = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(page).toContain('Entrar');
    expect(page).toContain('/criar-conta');
    expect(page).toContain('/recuperar-senha');
    expect(page).not.toContain('SUPABASE_SECRET_KEY');
    expect(page).not.toContain('ADMIN_TOKEN');
  });

  it('redirects unauthenticated browsers from the Control Plane to login', async () => {
    const response = await worker.fetch(new Request('https://crapi.test/admin'), authEnv);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/login');
  });

  it('rejects Control Plane API calls without an authenticated user session', async () => {
    const response = await worker.fetch(
      new Request('https://crapi.test/admin/api/applications'),
      authEnv,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'UNAUTHORIZED' });
  });

  it('does not accept a human user JWT as a Registry API key', async () => {
    const response = await worker.fetch(
      new Request('https://crapi.test/v1/professional-registrations/verify', {
        method: 'POST',
        headers: {
          authorization: 'Bearer eyJhbGciOiJFUzI1NiJ9.user.session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ council: 'CREF', uf: 'SC', registration_number: '123' }),
      }),
      {
        APP_ENV: 'test',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz',
        API_KEY_PEPPER: '0123456789abcdef0123456789abcdef',
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'UNAUTHORIZED' });
  });
});
