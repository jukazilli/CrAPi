import { parseRegistryQuery } from '@crapi/contracts';

import { AdminAuthorizationService } from './admin-authorization.js';
import { authenticateAdminRequest } from './admin-auth.js';
import { ADMIN_PAGE } from './admin-page.js';
import { AdminService } from './admin-service.js';
import { authenticateApiRequest } from './api-key-auth.js';
import { appendSetCookies, AUTH_CALLBACK_PAGE } from './auth-page-bridge.js';
import {
  clearSessionCookies,
  resolveSession,
  sessionCookies,
  SupabaseAuthError,
  SupabaseAuthService,
  validateEmail,
  validatePassword,
} from './auth-service.js';
import { renderAccessPendingPage, renderAuthPage } from './auth-pages.js';
import { RegistryService } from './registry-service.js';
import { SupabaseApiKeyRepository } from './supabase-api-key-repository.js';
import { SupabaseServerClient } from './supabase-server-client.js';

interface Env {
  APP_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  API_KEY_PEPPER?: string;
  ADMIN_TOKEN?: string;
}

interface WorkerHandler {
  fetch(request: Request, env: Env): Promise<Response>;
}

type JsonRecord = Record<string, unknown>;

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

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
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

function redirect(location: string, status = 303): Response {
  return new Response(null, {
    status,
    headers: {
      location,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function hasStrongValue(value: string | undefined): boolean {
  return Boolean(value && new TextEncoder().encode(value).byteLength >= 32 && !value.includes('<'));
}

function runtimeState(env: Env) {
  return {
    database: Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY),
    auth: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY),
    api_key_pepper: hasStrongValue(env.API_KEY_PEPPER),
    bootstrap_token: hasStrongValue(env.ADMIN_TOKEN),
  };
}

function createDb(env: Env): SupabaseServerClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error('DATABASE_NOT_CONFIGURED');
  return new SupabaseServerClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
}

function createAuth(env: Env): SupabaseAuthService {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('AUTH_NOT_CONFIGURED');
  }
  return new SupabaseAuthService(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
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

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INVALID_BODY');
  }
  return value as JsonRecord;
}

function safeInternalPath(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

function enforceSameOrigin(request: Request): Response | null {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'FORBIDDEN' }, 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'FORBIDDEN' }, 403);
  }
  return null;
}

function authClientError(
  error: unknown,
  operation: 'login' | 'signup' | 'recover' | 'session' | 'password',
): Response {
  if (error instanceof SupabaseAuthError) {
    if (operation === 'login' && error.status < 500) {
      return json({ error: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' }, 401);
    }
    if (operation === 'signup' && error.status < 500) {
      return json({ error: 'SIGNUP_FAILED', message: 'Não foi possível criar a conta.' }, 400);
    }
    if (operation === 'recover' && error.status < 500) {
      return json({ ok: true });
    }
    if (operation === 'session' && error.status < 500) {
      return json({ error: 'UNAUTHORIZED' }, 401);
    }
    if (operation === 'password' && error.status < 500) {
      return json(
        { error: 'PASSWORD_UPDATE_FAILED', message: 'Não foi possível atualizar a senha.' },
        400,
      );
    }
  }
  return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
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
    'INVALID_EMAIL',
    'INVALID_PASSWORD',
    'JSON_REQUIRED',
    'INVALID_JSON',
  ]);
  if (clientErrors.has(message)) return json({ error: message }, 400);
  if (message === 'API_KEY_NOT_FOUND') return json({ error: message }, 404);
  if (message.includes('SUPABASE_REQUEST_FAILED:409')) return json({ error: 'CONFLICT' }, 409);
  if (message.includes('SUPABASE_REQUEST_FAILED:400')) {
    return json({ error: 'INVALID_OPERATION' }, 400);
  }
  return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
}

async function handleAuthApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const sameOriginError = enforceSameOrigin(request);
  if (sameOriginError) return sameOriginError;

  let auth: SupabaseAuthService;
  try {
    auth = createAuth(env);
  } catch {
    return json({ error: 'SERVICE_NOT_READY' }, 503);
  }

  if (url.pathname === '/auth/signup') {
    try {
      const body = asRecord(await parseJsonBody(request));
      const email = validateEmail(body.email);
      const password = validatePassword(body.password);
      const callback = `${url.origin}/auth/callback?next=${encodeURIComponent('/admin')}`;
      const result = await auth.signUp(email, password, callback);
      if (!result.tokens) {
        return json({ authenticated: false, requires_email_confirmation: true }, 201);
      }
      return appendSetCookies(
        json({ authenticated: true, requires_email_confirmation: false }, 201),
        sessionCookies(result.tokens),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'INVALID_EMAIL',
          'INVALID_PASSWORD',
          'INVALID_BODY',
          'JSON_REQUIRED',
          'INVALID_JSON',
        ].includes(error.message)
      ) {
        return operationalError(error);
      }
      return authClientError(error, 'signup');
    }
  }

  if (url.pathname === '/auth/login') {
    try {
      const body = asRecord(await parseJsonBody(request));
      const tokens = await auth.signIn(validateEmail(body.email), validatePassword(body.password));
      return appendSetCookies(json({ authenticated: true }), sessionCookies(tokens));
    } catch (error) {
      if (
        error instanceof Error &&
        [
          'INVALID_EMAIL',
          'INVALID_PASSWORD',
          'INVALID_BODY',
          'JSON_REQUIRED',
          'INVALID_JSON',
        ].includes(error.message)
      ) {
        return json({ error: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' }, 401);
      }
      return authClientError(error, 'login');
    }
  }

  if (url.pathname === '/auth/recover') {
    try {
      const body = asRecord(await parseJsonBody(request));
      const email = validateEmail(body.email);
      const callback = `${url.origin}/auth/callback?next=${encodeURIComponent('/redefinir-senha')}`;
      await auth.sendPasswordRecovery(email, callback);
    } catch (error) {
      if (
        error instanceof Error &&
        ['INVALID_EMAIL', 'INVALID_BODY', 'JSON_REQUIRED', 'INVALID_JSON'].includes(error.message)
      ) {
        return operationalError(error);
      }
      if (!(error instanceof SupabaseAuthError) || error.status >= 500) {
        return authClientError(error, 'recover');
      }
    }
    return json({ ok: true });
  }

  if (url.pathname === '/auth/session/adopt') {
    try {
      const body = asRecord(await parseJsonBody(request));
      const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
      const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
      const tokens = await auth.adoptSession(accessToken, refreshToken);
      return appendSetCookies(json({ authenticated: true }), sessionCookies(tokens));
    } catch (error) {
      return authClientError(error, 'session');
    }
  }

  if (url.pathname === '/auth/password') {
    try {
      const session = await resolveSession(request, auth);
      if (!session.user || !session.accessToken) {
        return appendSetCookies(json({ error: 'UNAUTHORIZED' }, 401), session.setCookies);
      }
      const body = asRecord(await parseJsonBody(request));
      await auth.updatePassword(session.accessToken, validatePassword(body.password));
      return appendSetCookies(json({ updated: true }), session.setCookies);
    } catch (error) {
      if (
        error instanceof Error &&
        ['INVALID_PASSWORD', 'INVALID_BODY', 'JSON_REQUIRED', 'INVALID_JSON'].includes(
          error.message,
        )
      ) {
        return operationalError(error);
      }
      return authClientError(error, 'password');
    }
  }

  if (url.pathname === '/auth/logout') {
    try {
      const session = await resolveSession(request, auth);
      await auth.logout(session.accessToken);
    } catch {
      // Logout remains local and fail-closed even if the remote Auth service is unavailable.
    }
    return appendSetCookies(json({ signed_out: true }), clearSessionCookies());
  }

  if (url.pathname === '/auth/bootstrap-owner') {
    try {
      const session = await resolveSession(request, auth);
      if (!session.user) {
        return appendSetCookies(json({ error: 'UNAUTHORIZED' }, 401), session.setCookies);
      }
      if (!(await authenticateAdminRequest(request, env.ADMIN_TOKEN))) {
        return appendSetCookies(json({ error: 'FORBIDDEN' }, 403), session.setCookies);
      }
      const authorization = new AdminAuthorizationService(createDb(env));
      if (await authorization.ownerExists()) {
        return appendSetCookies(
          json({ error: 'OWNER_ALREADY_BOOTSTRAPPED' }, 409),
          session.setCookies,
        );
      }
      const membership = await authorization.bootstrapOwner(session.user.id);
      return appendSetCookies(json({ membership }, 201), session.setCookies);
    } catch (error) {
      return operationalError(error);
    }
  }

  return json({ error: 'NOT_FOUND' }, 404);
}

async function handleAuthConfirm(request: Request, env: Env, url: URL): Promise<Response> {
  let auth: SupabaseAuthService;
  try {
    auth = createAuth(env);
  } catch {
    return json({ error: 'SERVICE_NOT_READY' }, 503);
  }

  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const type = url.searchParams.get('type') ?? '';
  const requestedNext = safeInternalPath(url.searchParams.get('next'), '/admin');

  try {
    const tokens = await auth.verifyOtp(tokenHash, type);
    const destination = type === 'recovery' ? '/redefinir-senha' : requestedNext;
    return appendSetCookies(redirect(destination), sessionCookies(tokens));
  } catch {
    return redirect('/login?auth_error=invalid_or_expired_link');
  }
}

async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  try {
    const auth = createAuth(env);
    const session = await resolveSession(request, auth);
    if (!session.user) {
      return appendSetCookies(json({ authenticated: false }, 401), session.setCookies);
    }
    const authorization = new AdminAuthorizationService(createDb(env));
    const membership = await authorization.isAuthorized(session.user.id);
    const ownerExists = membership ? true : await authorization.ownerExists();
    return appendSetCookies(
      json({
        authenticated: true,
        authorized: Boolean(membership),
        role: membership?.role ?? null,
        owner_bootstrap_available: !ownerExists,
      }),
      session.setCookies,
    );
  } catch {
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
}

async function authorizeAdminRequest(request: Request, env: Env) {
  const auth = createAuth(env);
  const session = await resolveSession(request, auth);
  if (!session.user)
    return {
      ok: false as const,
      response: appendSetCookies(json({ error: 'UNAUTHORIZED' }, 401), session.setCookies),
    };

  const db = createDb(env);
  const authorization = new AdminAuthorizationService(db);
  const membership = await authorization.isAuthorized(session.user.id);
  if (!membership) {
    return {
      ok: false as const,
      response: appendSetCookies(json({ error: 'FORBIDDEN' }, 403), session.setCookies),
    };
  }

  return {
    ok: true as const,
    user: session.user,
    membership,
    db,
    setCookies: session.setCookies,
  };
}

async function handleAdminApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.API_KEY_PEPPER || !hasStrongValue(env.API_KEY_PEPPER)) {
    return json({ error: 'SECURITY_NOT_CONFIGURED' }, 503);
  }
  if (request.method !== 'GET') {
    const sameOriginError = enforceSameOrigin(request);
    if (sameOriginError) return sameOriginError;
  }

  let authorization;
  try {
    authorization = await authorizeAdminRequest(request, env);
  } catch {
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  }
  if (!authorization.ok) return authorization.response;

  const service = new AdminService(
    authorization.db,
    env.API_KEY_PEPPER,
    `auth-user:${authorization.user.id}`,
  );

  try {
    let response: Response;
    if (request.method === 'GET' && url.pathname === '/admin/api/applications') {
      response = json({ applications: await service.listApplications() });
    } else if (request.method === 'POST' && url.pathname === '/admin/api/applications') {
      const application = await service.createApplication(await parseJsonBody(request));
      response = json({ application }, 201);
    } else if (request.method === 'GET' && url.pathname === '/admin/api/audit') {
      const limit = Number(url.searchParams.get('limit') ?? '50');
      response = json({ events: await service.listAudit(Number.isFinite(limit) ? limit : 50) });
    } else {
      const applicationKeys = /^\/admin\/api\/applications\/([^/]+)\/keys$/.exec(url.pathname);
      const keyAction = /^\/admin\/api\/keys\/([^/]+)\/(revoke|rotate)$/.exec(url.pathname);

      if (applicationKeys) {
        const applicationId = decodeURIComponent(applicationKeys[1] ?? '');
        if (request.method === 'GET') {
          response = json({ keys: await service.listApiKeys(applicationId) });
        } else if (request.method === 'POST') {
          const key = await service.createApiKey(applicationId, await parseJsonBody(request));
          response = json({ key }, 201);
        } else {
          response = json({ error: 'METHOD_NOT_ALLOWED' }, 405);
        }
      } else if (request.method === 'POST' && keyAction) {
        const apiKeyId = decodeURIComponent(keyAction[1] ?? '');
        const action = keyAction[2];
        if (action === 'revoke') {
          response = json({ key: await service.revokeApiKey(apiKeyId) });
        } else {
          const body = request.headers.get('content-type')?.includes('application/json')
            ? await parseJsonBody(request)
            : {};
          response = json({ key: await service.rotateApiKey(apiKeyId, body) }, 201);
        }
      } else {
        response = json({ error: 'NOT_FOUND' }, 404);
      }
    }
    return appendSetCookies(response, authorization.setCookies);
  } catch (error) {
    return appendSetCookies(operationalError(error), authorization.setCookies);
  }
}

async function handleAdminPage(request: Request, env: Env): Promise<Response> {
  try {
    const auth = createAuth(env);
    const session = await resolveSession(request, auth);
    if (!session.user) {
      return appendSetCookies(redirect('/login'), session.setCookies);
    }

    const authorization = new AdminAuthorizationService(createDb(env));
    const membership = await authorization.isAuthorized(session.user.id);
    if (membership) return appendSetCookies(html(ADMIN_PAGE), session.setCookies);

    const ownerExists = await authorization.ownerExists();
    return appendSetCookies(html(renderAccessPendingPage(!ownerExists), 403), session.setCookies);
  } catch {
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
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
      const ready = state.database && state.auth && state.api_key_pepper;
      return json(
        {
          status: ready ? 'ready' : 'not_ready',
          dependencies: {
            database: state.database ? 'configured' : 'missing',
            auth: state.auth ? 'configured' : 'missing',
            api_key_pepper: state.api_key_pepper ? 'configured' : 'missing',
            bootstrap_token: state.bootstrap_token ? 'configured' : 'missing',
          },
        },
        ready ? 200 : 503,
      );
    }

    if (request.method === 'GET' && url.pathname === '/login') return html(renderAuthPage('login'));
    if (request.method === 'GET' && url.pathname === '/criar-conta')
      return html(renderAuthPage('signup'));
    if (request.method === 'GET' && url.pathname === '/recuperar-senha')
      return html(renderAuthPage('recover'));
    if (request.method === 'GET' && url.pathname === '/redefinir-senha')
      return html(renderAuthPage('reset'));
    if (request.method === 'GET' && url.pathname === '/auth/callback')
      return html(AUTH_CALLBACK_PAGE);
    if (request.method === 'GET' && url.pathname === '/auth/confirm')
      return handleAuthConfirm(request, env, url);
    if (request.method === 'GET' && url.pathname === '/auth/me') return handleAuthMe(request, env);
    if (url.pathname.startsWith('/auth/')) return handleAuthApi(request, env, url);

    if (request.method === 'GET' && url.pathname === '/admin') {
      return handleAdminPage(request, env);
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
