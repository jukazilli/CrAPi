import entry from './entry.js';
import { appendSetCookies, sessionCookies, type AuthTokens } from './auth-service.js';

interface Env {
  APP_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  API_KEY_PEPPER?: string;
  ADMIN_TOKEN?: string;
}

type JsonRecord = Record<string, unknown>;

const SIGNUP_RESEND_PATH = '/auth/resend-confirmation';
const RESEND_PAGE_PATH = '/reenviar-confirmacao';

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, max = 160): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]/g, ' ').slice(0, max);
}

function requestIdFor(request: Request): string {
  const incoming = request.headers.get('x-crapi-request-id');
  return incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
}

function redirect(location: string, status = 303, requestId?: string): Response {
  const headers = new Headers({
    location,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (requestId) headers.set('x-crapi-request-id', requestId);
  return new Response(null, { status, headers });
}

function json(
  body: unknown,
  status: number,
  requestId: string,
  retryAfter?: string | null,
): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-crapi-request-id': requestId,
  });
  if (retryAfter) headers.set('retry-after', retryAfter);
  return new Response(JSON.stringify(body), { status, headers });
}

function safeInternalPath(value: string | null, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

function normalizeSupabaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function authErrorCode(body: JsonRecord, status: number): string {
  if (typeof body.error_code === 'string') return safeString(body.error_code) || `HTTP_${status}`;
  if (typeof body.code === 'string') return safeString(body.code) || `HTTP_${status}`;
  return `HTTP_${status}`;
}

function readTokens(body: JsonRecord): AuthTokens | null {
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
    expiresIn: Math.max(1, Math.trunc(body.expires_in)),
  };
}

function authReady(
  env: Env,
): env is Env & { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string } {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY);
}

function sameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return false;
  return request.headers.get('sec-fetch-site') !== 'cross-site';
}

async function parseEmail(request: Request): Promise<string> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  let value: unknown;

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as unknown;
    value = isRecord(body) ? body.email : undefined;
  } else if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData();
    value = form.get('email');
  }

  if (typeof value !== 'string') throw new Error('INVALID_EMAIL');
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('INVALID_EMAIL');
  }
  return email;
}

async function handleConfirmation(request: Request, env: Env, url: URL): Promise<Response> {
  const requestId = requestIdFor(request);
  if (!authReady(env)) return json({ error: 'SERVICE_NOT_READY' }, 503, requestId);

  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const type = url.searchParams.get('type') ?? '';
  const next = safeInternalPath(url.searchParams.get('next'), '/admin');
  const allowedTypes = new Set([
    'email',
    'signup',
    'recovery',
    'magiclink',
    'invite',
    'email_change',
  ]);

  if (!tokenHash || !allowedTypes.has(type)) {
    return redirect(
      `/login?auth_error=invalid_link&request_id=${encodeURIComponent(requestId)}`,
      303,
      requestId,
    );
  }

  try {
    const upstream = await fetch(`${normalizeSupabaseUrl(env.SUPABASE_URL)}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token_hash: tokenHash, type }),
    });
    const body = (await upstream.json().catch(() => ({}))) as JsonRecord;

    if (!upstream.ok) {
      const code = authErrorCode(body, upstream.status);
      console.error(
        JSON.stringify({
          event: 'AUTH_CONFIRM_UPSTREAM_FAILURE',
          request_id: requestId,
          upstream_status: upstream.status,
          upstream_code: code,
        }),
      );
      return redirect(
        `/login?auth_error=${encodeURIComponent(code)}&request_id=${encodeURIComponent(requestId)}`,
        303,
        requestId,
      );
    }

    const tokens = readTokens(body);
    if (!tokens) {
      console.error(
        JSON.stringify({
          event: 'AUTH_CONFIRM_SESSION_MISSING',
          request_id: requestId,
          upstream_status: upstream.status,
        }),
      );
      return redirect(
        `/login?auth_error=session_missing&request_id=${encodeURIComponent(requestId)}`,
        303,
        requestId,
      );
    }

    console.log(
      JSON.stringify({
        event: 'AUTH_CONFIRM_SUCCESS',
        request_id: requestId,
        verification_type: type,
      }),
    );

    const destination = type === 'recovery' ? '/redefinir-senha' : next;
    return appendSetCookies(redirect(destination, 303, requestId), sessionCookies(tokens));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'AUTH_CONFIRM_RUNTIME_FAILURE',
        request_id: requestId,
        runtime_error: safeString(error instanceof Error ? error.message : 'UNKNOWN_ERROR'),
      }),
    );
    return redirect(
      `/login?auth_error=service_unavailable&request_id=${encodeURIComponent(requestId)}`,
      303,
      requestId,
    );
  }
}

async function handleResend(request: Request, env: Env, url: URL): Promise<Response> {
  const requestId = requestIdFor(request);
  if (!sameOrigin(request)) return json({ error: 'FORBIDDEN' }, 403, requestId);
  if (!authReady(env)) return json({ error: 'SERVICE_NOT_READY' }, 503, requestId);

  let email: string;
  try {
    email = await parseEmail(request);
  } catch {
    return json({ error: 'INVALID_EMAIL', message: 'Informe um e-mail válido.' }, 400, requestId);
  }

  const redirectTo = `${url.origin}/auth/callback?next=${encodeURIComponent('/admin')}`;
  const query = new URLSearchParams({ redirect_to: redirectTo });

  try {
    const upstream = await fetch(
      `${normalizeSupabaseUrl(env.SUPABASE_URL)}/auth/v1/resend?${query.toString()}`,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          apikey: env.SUPABASE_PUBLISHABLE_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'signup', email }),
      },
    );
    const body = (await upstream.json().catch(() => ({}))) as JsonRecord;

    if (upstream.status === 429) {
      console.warn(
        JSON.stringify({
          event: 'AUTH_RESEND_RATE_LIMITED',
          request_id: requestId,
          upstream_code: authErrorCode(body, upstream.status),
        }),
      );
      return json(
        {
          error: 'TOO_MANY_REQUESTS',
          message: 'Aguarde um pouco antes de solicitar outro e-mail.',
        },
        429,
        requestId,
        upstream.headers.get('retry-after'),
      );
    }

    if (upstream.status >= 500) {
      console.error(
        JSON.stringify({
          event: 'AUTH_RESEND_UPSTREAM_FAILURE',
          request_id: requestId,
          upstream_status: upstream.status,
          upstream_code: authErrorCode(body, upstream.status),
        }),
      );
      return json({ error: 'SERVICE_UNAVAILABLE' }, 503, requestId);
    }

    // Deliberately return the same response for existing, already-confirmed or unknown addresses.
    console.log(JSON.stringify({ event: 'AUTH_RESEND_ACCEPTED', request_id: requestId }));
    return json(
      {
        ok: true,
        message:
          'Se houver um cadastro pendente para este e-mail, uma nova confirmação será enviada.',
      },
      200,
      requestId,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'AUTH_RESEND_RUNTIME_FAILURE',
        request_id: requestId,
        runtime_error: safeString(error instanceof Error ? error.message : 'UNKNOWN_ERROR'),
      }),
    );
    return json({ error: 'SERVICE_UNAVAILABLE' }, 503, requestId);
  }
}

const RESEND_PAGE = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reenviar confirmação · CrAPi</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
    main { width: min(440px, calc(100% - 32px)); }
    .eyebrow { font-size: 13px; opacity: .55; margin-bottom: 6px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 6vw, 38px); letter-spacing: -.035em; }
    p { line-height: 1.5; }
    .muted { opacity: .62; }
    .card { margin-top: 24px; padding: 26px; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 22px; background: color-mix(in srgb, Canvas 97%, CanvasText 3%); }
    label { display: block; margin: 0 0 6px; font-size: 13px; opacity: .72; }
    input, button { width: 100%; font: inherit; border-radius: 11px; }
    input { border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); padding: 12px 13px; background: Canvas; color: CanvasText; }
    button { margin-top: 18px; border: 0; padding: 12px 14px; cursor: pointer; background: CanvasText; color: Canvas; }
    button:disabled { opacity: .5; cursor: default; }
    a { color: inherit; }
    .links { margin-top: 18px; font-size: 14px; }
    #notice { display: none; margin: 0 0 14px; padding: 12px 13px; border-radius: 11px; background: color-mix(in srgb, #d99b00 15%, transparent); font-size: 14px; }
  </style>
</head>
<body>
<main>
  <div class="eyebrow">Professional Registry</div>
  <h1>Reenviar confirmação</h1>
  <p class="muted">Informe o mesmo e-mail usado no cadastro. Enviaremos um novo link se a conta ainda estiver aguardando confirmação.</p>
  <section class="card">
    <div id="notice"></div>
    <form id="resendForm">
      <label for="email">E-mail</label>
      <input id="email" name="email" type="email" autocomplete="email" required />
      <button id="submit" type="submit">Enviar novo link</button>
    </form>
    <p class="links"><a href="/login">Voltar para entrar</a></p>
  </section>
</main>
<script>
(() => {
  const form = document.getElementById('resendForm');
  const notice = document.getElementById('notice');
  const button = document.getElementById('submit');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    button.disabled = true;
    notice.style.display = 'none';
    try {
      const response = await fetch('${SIGNUP_RESEND_PATH}', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'accept': 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('email').value })
      });
      const body = await response.json().catch(() => ({}));
      notice.textContent = body.message || (response.ok ? 'Solicitação enviada.' : 'Não foi possível enviar agora.');
      notice.style.display = 'block';
      if (response.ok) form.reset();
    } catch {
      notice.textContent = 'Não foi possível enviar agora.';
      notice.style.display = 'block';
    } finally {
      button.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;

async function addResendLinkToLogin(response: Response): Promise<Response> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('text/html')) return response;
  const source = await response.text();
  if (source.includes(RESEND_PAGE_PATH)) {
    return new Response(source, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  const enhanced = source.replace(
    '</section>',
    `<p class="links"><a href="${RESEND_PAGE_PATH}">Reenviar e-mail de confirmação</a></p></section>`,
  );
  return new Response(enhanced, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const gateway = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/auth/confirm') {
      return handleConfirmation(request, env, url);
    }

    if (request.method === 'GET' && url.pathname === RESEND_PAGE_PATH) {
      return new Response(RESEND_PAGE, {
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

    if (request.method === 'POST' && url.pathname === SIGNUP_RESEND_PATH) {
      return handleResend(request, env, url);
    }

    const response = await entry.fetch(request, env);
    if (request.method === 'GET' && url.pathname === '/login') {
      return addResendLinkToLogin(response);
    }
    return response;
  },
};

export default gateway;
