import {
  appendSetCookies,
  sessionCookies,
  validateEmail,
  validatePassword,
} from './auth-service.js';
import worker from './index.js';
import { SupabaseServerClient } from './supabase-server-client.js';

type Env = Parameters<typeof worker.fetch>[1];
type JsonRecord = Record<string, unknown>;

const authPageByPath: Record<string, string> = {
  '/auth/login': '/login',
  '/auth/signup': '/criar-conta',
  '/auth/recover': '/recuperar-senha',
  '/auth/password': '/redefinir-senha',
};

const formRouteByPage: Record<string, string> = {
  '/login': '/auth/login',
  '/criar-conta': '/auth/signup',
  '/recuperar-senha': '/auth/recover',
  '/redefinir-senha': '/auth/password',
};

function redirect(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: path,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function browserNotice(url: URL): string | null {
  if (url.searchParams.get('signup') === 'check-email') {
    return 'Conta criada. Confira seu e-mail para confirmar o cadastro e depois faça login.';
  }
  if (url.searchParams.get('recovery') === 'sent') {
    return 'Se existir uma conta para este e-mail, você receberá as instruções de recuperação.';
  }
  if (url.searchParams.has('auth_error')) {
    return 'Não foi possível concluir a autenticação. Revise os dados e tente novamente.';
  }
  return null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, maxLength = 240): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
    .slice(0, maxLength);
}

function requestIdFor(request: Request): string {
  const provided = request.headers.get('x-request-id')?.trim();
  if (provided && /^[A-Za-z0-9._:-]{8,128}$/.test(provided)) return provided;
  return crypto.randomUUID();
}

function jsonWithRequestId(body: unknown, status: number, requestId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-crapi-request-id': requestId,
    },
  });
}

async function recordAuthDiagnostic(
  env: Env,
  requestId: string,
  eventType: string,
  severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL',
  metadata: JsonRecord,
): Promise<void> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) return;
  try {
    await new SupabaseServerClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY).insert(
      'security_events',
      {
        event_type: eventType,
        severity,
        metadata: {
          request_id: requestId,
          source: 'worker_auth_observability',
          ...metadata,
        },
      },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'AUTH_DIAGNOSTIC_PERSIST_FAILED',
        request_id: requestId,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      }),
    );
  }
}

async function enhanceAuthPage(request: Request, env: Env, url: URL): Promise<Response> {
  const route = formRouteByPage[url.pathname];
  if (!route) return worker.fetch(request, env);

  const response = await worker.fetch(request, env);
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/html')) {
    return response;
  }

  let body = await response.text();
  body = body.replace(
    '<form id="authForm" onsubmit="return false">',
    `<form id="authForm" method="post" action="${route}">`,
  );
  body = body.replace(
    '<button id="authSubmit" class="primary" type="button">',
    '<button id="authSubmit" class="primary" type="submit">',
  );
  body = body.replace(
    "button.addEventListener('click', submitAuth);",
    "form.addEventListener('submit', (event) => { event.preventDefault(); void submitAuth(); });",
  );

  const notice = browserNotice(url);
  if (notice) {
    body = body.replace(
      '<div id="notice"></div>',
      `<div id="notice" style="display:block">${notice}</div>`,
    );
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function requestPayload(request: Request): Promise<JsonRecord> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    const body = await request.json();
    if (!isRecord(body)) throw new Error('INVALID_BODY');
    return body;
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    const payload: JsonRecord = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') payload[key] = value;
    }
    return payload;
  }

  throw new Error('JSON_OR_FORM_REQUIRED');
}

function readAuthTokens(body: JsonRecord) {
  if (
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string' ||
    typeof body.expires_in !== 'number'
  ) {
    return null;
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: Math.max(Math.trunc(body.expires_in), 1),
  };
}

function signupDiagnosticBody(
  requestId: string,
  status: number,
  code: string,
  message: string | null,
) {
  return {
    error: status >= 500 ? 'SERVICE_UNAVAILABLE' : 'SIGNUP_FAILED',
    message:
      status >= 500 ? 'Falha no serviço de autenticação.' : 'Não foi possível criar a conta.',
    request_id: requestId,
    ...(status >= 500
      ? {
          diagnostics: {
            upstream_status: status,
            upstream_code: code,
            upstream_message: message,
          },
        }
      : {}),
  };
}

async function handleDiagnosticSignup(request: Request, env: Env, url: URL): Promise<Response> {
  const requestId = requestIdFor(request);
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    await recordAuthDiagnostic(env, requestId, 'AUTH_SIGNUP_RUNTIME_FAILURE', 'HIGH', {
      route: url.pathname,
      failure: 'AUTH_NOT_CONFIGURED',
    });
    return jsonWithRequestId(
      { error: 'SERVICE_NOT_READY', request_id: requestId },
      503,
      requestId,
    );
  }

  try {
    const body = await requestPayload(request);
    const email = validateEmail(body.email);
    const password = validatePassword(body.password);
    const callback = `${url.origin}/auth/callback?next=${encodeURIComponent('/admin')}`;
    const query = new URLSearchParams({ redirect_to: callback });
    const upstreamUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/signup?${query.toString()}`;

    const upstream = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const rawBody = await upstream.text();
    let upstreamBody: JsonRecord = {};
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody) as unknown;
        if (isRecord(parsed)) upstreamBody = parsed;
      } catch {
        upstreamBody = {};
      }
    }

    if (!upstream.ok) {
      const code =
        safeString(upstreamBody.code) ??
        safeString(upstreamBody.error_code) ??
        `HTTP_${upstream.status}`;
      const message =
        safeString(upstreamBody.msg) ??
        safeString(upstreamBody.message) ??
        safeString(upstreamBody.error_description) ??
        safeString(rawBody);
      const upstreamRequestId =
        upstream.headers.get('x-request-id') ?? upstream.headers.get('sb-request-id');
      const cfRay = upstream.headers.get('cf-ray');

      await recordAuthDiagnostic(
        env,
        requestId,
        'AUTH_SIGNUP_UPSTREAM_FAILURE',
        upstream.status >= 500 ? 'HIGH' : 'WARNING',
        {
          route: url.pathname,
          upstream_status: upstream.status,
          upstream_code: code,
          upstream_message: message,
          upstream_request_id: safeString(upstreamRequestId),
          upstream_cf_ray: safeString(cfRay),
          redirect_origin: url.origin,
        },
      );

      console.error(
        JSON.stringify({
          event: 'AUTH_SIGNUP_UPSTREAM_FAILURE',
          request_id: requestId,
          upstream_status: upstream.status,
          upstream_code: code,
          upstream_message: message,
          upstream_request_id: safeString(upstreamRequestId),
          upstream_cf_ray: safeString(cfRay),
        }),
      );

      return jsonWithRequestId(
        signupDiagnosticBody(requestId, upstream.status, code, message),
        upstream.status >= 500 ? 503 : 400,
        requestId,
      );
    }

    const tokens = readAuthTokens(upstreamBody);
    const response = jsonWithRequestId(
      {
        authenticated: Boolean(tokens),
        requires_email_confirmation: !tokens,
        request_id: requestId,
      },
      201,
      requestId,
    );

    await recordAuthDiagnostic(env, requestId, 'AUTH_SIGNUP_UPSTREAM_SUCCESS', 'INFO', {
      route: url.pathname,
      authenticated: Boolean(tokens),
      requires_email_confirmation: !tokens,
    });

    return tokens ? appendSetCookies(response, sessionCookies(tokens)) : response;
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    if (
      ['INVALID_EMAIL', 'INVALID_PASSWORD', 'INVALID_BODY', 'JSON_OR_FORM_REQUIRED'].includes(code)
    ) {
      return jsonWithRequestId({ error: code, request_id: requestId }, 400, requestId);
    }

    const message = safeString(error instanceof Error ? error.message : 'UNKNOWN_ERROR');
    await recordAuthDiagnostic(env, requestId, 'AUTH_SIGNUP_RUNTIME_FAILURE', 'HIGH', {
      route: url.pathname,
      runtime_error: message,
    });
    console.error(
      JSON.stringify({
        event: 'AUTH_SIGNUP_RUNTIME_FAILURE',
        request_id: requestId,
        runtime_error: message,
      }),
    );
    return jsonWithRequestId(
      {
        error: 'SERVICE_UNAVAILABLE',
        request_id: requestId,
        diagnostics: { runtime_error: message },
      },
      503,
      requestId,
    );
  }
}

async function handleAuthSettingsDiagnostic(env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (env.APP_ENV !== 'staging') {
    return jsonWithRequestId({ error: 'NOT_FOUND' }, 404, requestId);
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return jsonWithRequestId({ error: 'SERVICE_NOT_READY' }, 503, requestId);
  }

  try {
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: {
        accept: 'application/json',
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
      },
    });
    const body = (await response.json().catch(() => ({}))) as JsonRecord;
    const external = isRecord(body.external) ? body.external : {};
    return jsonWithRequestId(
      {
        ok: response.ok,
        upstream_status: response.status,
        auth: {
          email_provider_enabled: external.email === true,
          signup_disabled: body.disable_signup === true,
          email_autoconfirm: body.mailer_autoconfirm === true,
        },
        request_id: requestId,
      },
      response.ok ? 200 : 503,
      requestId,
    );
  } catch (error) {
    return jsonWithRequestId(
      {
        error: 'SERVICE_UNAVAILABLE',
        request_id: requestId,
        diagnostics: {
          runtime_error: safeString(error instanceof Error ? error.message : 'UNKNOWN_ERROR'),
        },
      },
      503,
      requestId,
    );
  }
}

function nativeSuccessDestination(pathname: string, responseBody: unknown): string {
  if (pathname === '/auth/signup') {
    if (
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'requires_email_confirmation' in responseBody &&
      responseBody.requires_email_confirmation === true
    ) {
      return '/login?signup=check-email';
    }
    return '/admin';
  }
  if (pathname === '/auth/login' || pathname === '/auth/password') {
    return '/admin';
  }
  if (pathname === '/auth/recover') return '/login?recovery=sent';
  return '/login';
}

async function handleNativeAuthPost(request: Request, env: Env, url: URL): Promise<Response> {
  if (url.pathname === '/auth/signup') {
    const response = await handleDiagnosticSignup(request, env, url);
    const body = await response
      .clone()
      .json()
      .catch(() => null);
    if (response.ok) {
      const redirected = redirect(nativeSuccessDestination(url.pathname, body));
      const headers = new Headers(redirected.headers);
      headers.set(
        'x-crapi-request-id',
        response.headers.get('x-crapi-request-id') ?? 'unknown',
      );
      for (const cookie of response.headers.getSetCookie?.() ?? []) {
        headers.append('set-cookie', cookie);
      }
      return new Response(null, { status: 303, headers });
    }

    const page = authPageByPath[url.pathname] ?? '/login';
    const requestId = response.headers.get('x-crapi-request-id') ?? 'unknown';
    return redirect(
      `${page}?auth_error=${response.status}&request_id=${encodeURIComponent(requestId)}`,
    );
  }

  const form = await request.formData();
  const payload: JsonRecord = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') payload[key] = value;
  }
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');
  const transformed = new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const response = await worker.fetch(transformed, env);
  const body = await response
    .clone()
    .json()
    .catch(() => null);

  if (response.ok) {
    const redirected = redirect(nativeSuccessDestination(url.pathname, body));
    const redirectHeaders = new Headers(redirected.headers);
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      redirectHeaders.append('set-cookie', cookie);
    }
    return new Response(null, { status: 303, headers: redirectHeaders });
  }

  const page = authPageByPath[url.pathname] ?? '/login';
  return redirect(`${page}?auth_error=${response.status}`);
}

const entry = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const authPage = authPageByPath[url.pathname];
    const formRoute = formRouteByPage[url.pathname];

    if (request.method === 'GET' && url.pathname === '/debug/auth/settings') {
      return handleAuthSettingsDiagnostic(env);
    }

    if (request.method === 'GET' && authPage) {
      return redirect(authPage);
    }

    if (request.method === 'GET' && formRoute) {
      return enhanceAuthPage(request, env, url);
    }

    if (request.method === 'POST' && url.pathname === '/auth/signup') {
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) {
        return jsonWithRequestId({ error: 'FORBIDDEN' }, 403, requestIdFor(request));
      }
      if (request.headers.get('sec-fetch-site') === 'cross-site') {
        return jsonWithRequestId({ error: 'FORBIDDEN' }, 403, requestIdFor(request));
      }

      const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
      if (contentType.includes('application/x-www-form-urlencoded')) {
        return handleNativeAuthPost(request, env, url);
      }
      return handleDiagnosticSignup(request, env, url);
    }

    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (
      request.method === 'POST' &&
      authPage &&
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      return handleNativeAuthPost(request, env, url);
    }

    return worker.fetch(request, env);
  },
};

export default entry;
