import { parseRegistryQuery } from '@crapi/contracts';

import { ADMIN_PAGE } from './admin-page.js';
import { authenticateAdminRequest } from './admin-auth.js';
import { AdminService } from './admin-service.js';
import { authenticateApiRequest } from './api-key-auth.js';
import { RegistryService } from './registry-service.js';
import { SupabaseApiKeyRepository } from './supabase-api-key-repository.js';
import { SupabaseServerClient } from './supabase-server-client.js';

interface Env {
  APP_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  API_KEY_PEPPER?: string;
  ADMIN_TOKEN?: string;
}

interface WorkerHandler {
  fetch(request: Request, env: Env): Promise<Response>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

function hasStrongValue(value: string | undefined): boolean {
  return Boolean(value && new TextEncoder().encode(value).byteLength >= 32 && !value.includes('<'));
}

function runtimeState(env: Env) {
  return {
    database: Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY),
    api_key_pepper: hasStrongValue(env.API_KEY_PEPPER),
    admin_token: hasStrongValue(env.ADMIN_TOKEN),
  };
}

function createDb(env: Env): SupabaseServerClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('DATABASE_NOT_CONFIGURED');
  return new SupabaseServerClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) throw new Error('JSON_REQUIRED');
  try {
    return await request.json();
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function operationalError(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';

  const clientErrors = new Set([
    'INVALID_BODY',
    'INVALID_ID',
    'INVALID_APPLICATION_SLUG',
    'INVALID_APPLICATION_NAME',
    'INVALID_KEY_NAME',
    'INVALID_KEY_ENVIRONMENT',
    'INVALID_DAILY_LIMIT',
    'INVALID_SCOPES',
    'INVALID_EXPIRATION',
    'JSON_REQUIRED',
    'INVALID_JSON',
  ]);
  if (clientErrors.has(message)) return json({ error: message }, 400);
  if (message === 'API_KEY_NOT_FOUND') return json({ error: message }, 404);
  if (message.includes('SUPABASE_REQUEST_FAILED:409')) return json({ error: 'CONFLICT' }, 409);
  if (message.includes('SUPABASE_REQUEST_FAILED:400'))
    return json({ error: 'INVALID_OPERATION' }, 400);

  return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
}

async function handleAdminApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (!(await authenticateAdminRequest(request, env.ADMIN_TOKEN))) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }

  if (!env.API_KEY_PEPPER || !hasStrongValue(env.API_KEY_PEPPER)) {
    return json({ error: 'SECURITY_NOT_CONFIGURED' }, 503);
  }

  let service: AdminService;
  try {
    service = new AdminService(createDb(env), env.API_KEY_PEPPER);
  } catch (error) {
    return operationalError(error);
  }

  try {
    if (request.method === 'GET' && url.pathname === '/admin/api/applications') {
      return json({ applications: await service.listApplications() });
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/applications') {
      const application = await service.createApplication(await parseJsonBody(request));
      return json({ application }, 201);
    }

    if (request.method === 'GET' && url.pathname === '/admin/api/audit') {
      const limit = Number(url.searchParams.get('limit') ?? '50');
      return json({ events: await service.listAudit(Number.isFinite(limit) ? limit : 50) });
    }

    const applicationKeys = /^\/admin\/api\/applications\/([^/]+)\/keys$/.exec(url.pathname);
    if (applicationKeys) {
      const applicationId = decodeURIComponent(applicationKeys[1] ?? '');
      if (request.method === 'GET') {
        return json({ keys: await service.listApiKeys(applicationId) });
      }
      if (request.method === 'POST') {
        const key = await service.createApiKey(applicationId, await parseJsonBody(request));
        return json({ key }, 201);
      }
    }

    const keyAction = /^\/admin\/api\/keys\/([^/]+)\/(revoke|rotate)$/.exec(url.pathname);
    if (request.method === 'POST' && keyAction) {
      const apiKeyId = decodeURIComponent(keyAction[1] ?? '');
      const action = keyAction[2];
      if (action === 'revoke') {
        return json({ key: await service.revokeApiKey(apiKeyId) });
      }
      const body = request.headers.get('content-type')?.includes('application/json')
        ? await parseJsonBody(request)
        : {};
      return json({ key: await service.rotateApiKey(apiKeyId, body) }, 201);
    }

    return json({ error: 'NOT_FOUND' }, 404);
  } catch (error) {
    return operationalError(error);
  }
}

async function handleRegistryVerify(request: Request, env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.API_KEY_PEPPER) {
    return json({ error: 'SERVICE_NOT_READY' }, 503);
  }

  try {
    const repository = new SupabaseApiKeyRepository(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
    const authentication = await authenticateApiRequest(
      request,
      repository,
      env.API_KEY_PEPPER,
      'registry:verify',
    );

    if (!authentication.ok) {
      return json({ error: authentication.code }, authentication.status);
    }

    const parsed = parseRegistryQuery(await parseJsonBody(request));
    if (!parsed.ok) {
      return json({ error: 'VALIDATION_ERROR', details: parsed.errors }, 400);
    }

    const result = await new RegistryService(createDb(env)).verify(
      parsed.value,
      authentication.principal,
    );
    return json(result.body, result.status);
  } catch {
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
}

const worker: WorkerHandler = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        status: 'ok',
        service: 'crapi',
        environment: env.APP_ENV ?? 'unknown',
      });
    }

    if (request.method === 'GET' && url.pathname === '/ready') {
      const state = runtimeState(env);
      const ready = state.database && state.api_key_pepper && state.admin_token;
      return json(
        {
          status: ready ? 'ready' : 'not_ready',
          dependencies: {
            database: state.database ? 'configured' : 'missing',
            api_key_pepper: state.api_key_pepper ? 'configured' : 'missing',
            admin_token: state.admin_token ? 'configured' : 'missing',
          },
        },
        ready ? 200 : 503,
      );
    }

    if (request.method === 'GET' && url.pathname === '/admin') {
      return html(ADMIN_PAGE);
    }

    if (url.pathname.startsWith('/admin/api/')) {
      return handleAdminApi(request, env, url);
    }

    if (request.method === 'POST' && url.pathname === '/v1/professional-registrations/verify') {
      return handleRegistryVerify(request, env);
    }

    return json({ error: 'NOT_FOUND', message: 'Route not found.' }, 404);
  },
};

export default worker;
