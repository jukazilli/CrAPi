import authGateway from './auth-gateway.js';
import { ADMIN_PAGE } from './admin-page.js';
import {
  appendSetCookies,
  resolveSession,
  SupabaseAuthService,
  type AuthSessionResult,
} from './auth-service.js';

interface Env {
  APP_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  API_KEY_PEPPER?: string;
  ADMIN_TOKEN?: string;
}

type JsonRecord = Record<string, unknown>;

interface AdminMembershipRow {
  user_id: string;
  email?: string | null;
  role: 'OWNER' | 'ADMIN';
  status: 'ACTIVE' | 'REVOKED';
  created_at: string;
  updated_at: string;
}

function requestIdFor(request: Request): string {
  const incoming = request.headers.get('x-crapi-request-id');
  return incoming && /^[A-Za-z0-9._:-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
}

function json(body: unknown, status: number, requestId: string): Response {
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

function html(body: string, status = 200, requestId?: string): Response {
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy':
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  if (requestId) headers.set('x-crapi-request-id', requestId);
  return new Response(body, { status, headers });
}

function redirect(location: string, requestId: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-crapi-request-id': requestId,
    },
  });
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, max = 180): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\r\n\t]/g, ' ').slice(0, max);
}

function sameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return false;
  return request.headers.get('sec-fetch-site') !== 'cross-site';
}

function configured(env: Env): env is Env & {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
} {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && env.SUPABASE_SECRET_KEY);
}

async function resolveHumanSession(
  request: Request,
  env: Env & { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string },
): Promise<AuthSessionResult> {
  const auth = new SupabaseAuthService(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  return resolveSession(request, auth);
}

async function rpc<T>(
  env: Env & { SUPABASE_URL: string; SUPABASE_SECRET_KEY: string },
  functionName: string,
  args: JsonRecord,
): Promise<{ ok: true; rows: T[] } | { ok: false; status: number; code: string }> {
  const upstream = await fetch(
    `${normalizeBaseUrl(env.SUPABASE_URL)}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        apikey: env.SUPABASE_SECRET_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args),
    },
  );
  const body = (await upstream.json().catch(() => ({}))) as unknown;
  if (upstream.ok) {
    return { ok: true, rows: Array.isArray(body) ? (body as T[]) : [] };
  }

  const record = isRecord(body) ? body : {};
  const message = safeString(record.message);
  const details = safeString(record.details);
  const code =
    [
      'OWNER_REQUIRED',
      'INVALID_EMAIL',
      'ADMIN_USER_NOT_FOUND',
      'ADMIN_EMAIL_NOT_CONFIRMED',
      'TARGET_IS_OWNER',
      'ADMIN_MEMBERSHIP_NOT_FOUND',
      'OWNER_SELF_REVOKE_FORBIDDEN',
      'OWNER_REVOKE_FORBIDDEN',
      'INVALID_USER_ID',
    ].find((candidate) => message.includes(candidate) || details.includes(candidate)) ??
    `UPSTREAM_${upstream.status}`;
  return { ok: false, status: upstream.status, code };
}

function statusForAdminError(code: string): number {
  if (code === 'OWNER_REQUIRED') return 403;
  if (code === 'ADMIN_USER_NOT_FOUND' || code === 'ADMIN_MEMBERSHIP_NOT_FOUND') return 404;
  if (code === 'INVALID_EMAIL' || code === 'INVALID_USER_ID') return 400;
  if (
    code === 'ADMIN_EMAIL_NOT_CONFIRMED' ||
    code === 'TARGET_IS_OWNER' ||
    code === 'OWNER_SELF_REVOKE_FORBIDDEN' ||
    code === 'OWNER_REVOKE_FORBIDDEN'
  ) {
    return 409;
  }
  return 503;
}

async function authorizeHuman(request: Request, env: Env, requestId: string) {
  if (!configured(env)) {
    return { ok: false as const, response: json({ error: 'SERVICE_NOT_READY' }, 503, requestId) };
  }

  try {
    const session = await resolveHumanSession(request, env);
    if (!session.user) {
      return {
        ok: false as const,
        response: appendSetCookies(
          json({ error: 'UNAUTHORIZED' }, 401, requestId),
          session.setCookies,
        ),
      };
    }
    return { ok: true as const, env, session };
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'ADMIN_SESSION_FAILURE',
        request_id: requestId,
        runtime_error: safeString(error instanceof Error ? error.message : 'UNKNOWN_ERROR'),
      }),
    );
    return { ok: false as const, response: json({ error: 'SERVICE_UNAVAILABLE' }, 503, requestId) };
  }
}

async function handleMembersApi(request: Request, env: Env, url: URL): Promise<Response> {
  const requestId = requestIdFor(request);
  if (request.method !== 'GET' && !sameOrigin(request)) {
    return json({ error: 'FORBIDDEN' }, 403, requestId);
  }

  const authorized = await authorizeHuman(request, env, requestId);
  if (!authorized.ok) return authorized.response;
  const actorId = authorized.session.user!.id;

  try {
    if (request.method === 'GET' && url.pathname === '/admin/api/members') {
      const result = await rpc<AdminMembershipRow>(authorized.env, 'list_admin_memberships', {
        p_actor_user_id: actorId,
      });
      if (!result.ok) {
        return appendSetCookies(
          json({ error: result.code }, statusForAdminError(result.code), requestId),
          authorized.session.setCookies,
        );
      }
      return appendSetCookies(
        json({ members: result.rows }, 200, requestId),
        authorized.session.setCookies,
      );
    }

    if (request.method === 'POST' && url.pathname === '/admin/api/members') {
      const body = (await request.json().catch(() => null)) as unknown;
      const email = isRecord(body) && typeof body.email === 'string' ? body.email.trim() : '';
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return appendSetCookies(
          json({ error: 'INVALID_EMAIL', message: 'Informe um e-mail válido.' }, 400, requestId),
          authorized.session.setCookies,
        );
      }
      const result = await rpc<AdminMembershipRow>(
        authorized.env,
        'grant_admin_membership_by_email',
        {
          p_actor_user_id: actorId,
          p_email: email,
        },
      );
      if (!result.ok) {
        return appendSetCookies(
          json({ error: result.code }, statusForAdminError(result.code), requestId),
          authorized.session.setCookies,
        );
      }
      return appendSetCookies(
        json({ member: result.rows[0] ?? null }, 201, requestId),
        authorized.session.setCookies,
      );
    }

    const revokeMatch = /^\/admin\/api\/members\/([^/]+)\/revoke$/.exec(url.pathname);
    if (request.method === 'POST' && revokeMatch) {
      const targetUserId = decodeURIComponent(revokeMatch[1] ?? '');
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          targetUserId,
        )
      ) {
        return appendSetCookies(
          json({ error: 'INVALID_USER_ID' }, 400, requestId),
          authorized.session.setCookies,
        );
      }
      const result = await rpc<AdminMembershipRow>(authorized.env, 'revoke_admin_membership', {
        p_actor_user_id: actorId,
        p_target_user_id: targetUserId,
      });
      if (!result.ok) {
        return appendSetCookies(
          json({ error: result.code }, statusForAdminError(result.code), requestId),
          authorized.session.setCookies,
        );
      }
      return appendSetCookies(
        json({ member: result.rows[0] ?? null }, 200, requestId),
        authorized.session.setCookies,
      );
    }

    return appendSetCookies(
      json({ error: 'METHOD_NOT_ALLOWED' }, 405, requestId),
      authorized.session.setCookies,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'ADMIN_MEMBERSHIP_RUNTIME_FAILURE',
        request_id: requestId,
        runtime_error: safeString(error instanceof Error ? error.message : 'UNKNOWN_ERROR'),
      }),
    );
    return appendSetCookies(
      json({ error: 'SERVICE_UNAVAILABLE' }, 503, requestId),
      authorized.session.setCookies,
    );
  }
}

const ADMIN_MEMBERS_SECTION = `
<section id="adminMembershipSection" class="card" style="margin-top:20px">
  <div class="item-head">
    <div>
      <h2 style="margin-bottom:4px">Administradores</h2>
      <div class="muted">O OWNER pode conceder e revogar acesso administrativo.</div>
    </div>
    <span id="adminMembershipRole" class="tag">Carregando</span>
  </div>
  <form id="adminMembershipForm" style="margin-top:16px;display:none">
    <label for="adminEmail">E-mail da conta cadastrada</label>
    <div class="row">
      <input id="adminEmail" name="email" type="email" autocomplete="off" required placeholder="admin@empresa.com" />
      <button class="primary" type="submit">Adicionar ADMIN</button>
    </div>
    <div class="muted" style="font-size:13px;margin-top:8px">A conta precisa existir e ter o e-mail confirmado.</div>
  </form>
  <div id="adminMembershipNotice" style="display:none;margin-top:14px;padding:12px;border-radius:10px;background:color-mix(in srgb,#d99b00 15%,transparent)"></div>
  <div id="adminMemberships" style="margin-top:18px"><div class="empty">Carregando administradores...</div></div>
</section>`;

const ADMIN_MEMBERS_SCRIPT = `<script>
(() => {
  const section = document.getElementById('adminMembershipSection');
  const form = document.getElementById('adminMembershipForm');
  const root = document.getElementById('adminMemberships');
  const role = document.getElementById('adminMembershipRole');
  const notice = document.getElementById('adminMembershipNotice');
  if (!section || !form || !root || !role || !notice) return;

  function showNotice(message) {
    notice.textContent = message;
    notice.style.display = 'block';
  }
  function clearNotice() { notice.style.display = 'none'; }

  async function call(path, options) {
    clearNotice();
    const response = await fetch(path, {
      ...(options || {}),
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...((options && options.headers) || {}) }
    });
    if (response.status === 401) {
      location.replace('/login');
      throw new Error('Sessão expirada.');
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = {
        OWNER_REQUIRED: 'Somente o OWNER pode gerenciar administradores.',
        ADMIN_USER_NOT_FOUND: 'Nenhuma conta cadastrada foi encontrada com esse e-mail.',
        ADMIN_EMAIL_NOT_CONFIRMED: 'A conta existe, mas ainda não confirmou o e-mail.',
        TARGET_IS_OWNER: 'A conta informada já é OWNER.',
        ADMIN_MEMBERSHIP_NOT_FOUND: 'Esse administrador não foi encontrado.',
        OWNER_REVOKE_FORBIDDEN: 'O OWNER não pode ser revogado por esta tela.'
      };
      throw new Error(messages[body.error] || body.message || body.error || ('HTTP ' + response.status));
    }
    return body;
  }

  function renderMember(member) {
    const item = document.createElement('div');
    item.className = 'item';
    const head = document.createElement('div');
    head.className = 'item-head';
    const text = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = member.email || 'Conta administrativa';
    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = member.role + ' · ' + member.status;
    text.append(strong, meta);
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = member.role;
    head.append(text, tag);
    item.append(head);

    if (member.role === 'ADMIN' && member.status === 'ACTIVE') {
      const actions = document.createElement('div');
      actions.className = 'actions';
      const revoke = document.createElement('button');
      revoke.className = 'danger';
      revoke.type = 'button';
      revoke.textContent = 'Revogar acesso';
      revoke.onclick = async () => {
        if (!confirm('Revogar o acesso administrativo desta conta?')) return;
        try {
          await call('/admin/api/members/' + encodeURIComponent(member.user_id) + '/revoke', { method: 'POST', body: '{}' });
          await loadMembers();
        } catch (error) { showNotice(error.message); }
      };
      actions.append(revoke);
      item.append(actions);
    }
    return item;
  }

  async function loadMembers() {
    try {
      const data = await call('/admin/api/members');
      role.textContent = 'OWNER';
      form.style.display = 'block';
      root.replaceChildren();
      if (!data.members || !data.members.length) {
        root.innerHTML = '<div class="empty">Nenhum administrador encontrado.</div>';
        return;
      }
      data.members.forEach((member) => root.append(renderMember(member)));
    } catch (error) {
      if (String(error.message).includes('Somente o OWNER')) {
        section.style.display = 'none';
        return;
      }
      role.textContent = 'Indisponível';
      root.innerHTML = '<div class="empty">Não foi possível carregar os administradores.</div>';
      showNotice(error.message);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const email = document.getElementById('adminEmail').value;
    try {
      await call('/admin/api/members', { method: 'POST', body: JSON.stringify({ email }) });
      form.reset();
      await loadMembers();
    } catch (error) { showNotice(error.message); }
  });

  loadMembers();
})();
</script>`;

function enhancedAdminPage(): string {
  let source = ADMIN_PAGE;
  if (!source.includes('adminMembershipSection')) {
    source = source.replace('</main>', `${ADMIN_MEMBERS_SECTION}\n</main>`);
    source = source.replace('</body>', `${ADMIN_MEMBERS_SCRIPT}\n</body>`);
  }
  return source;
}

async function handleAdminPage(request: Request, env: Env): Promise<Response> {
  const requestId = requestIdFor(request);
  const authorized = await authorizeHuman(request, env, requestId);
  if (!authorized.ok) {
    if (authorized.response.status === 401) return redirect('/login', requestId);
    return authorized.response;
  }

  const actorId = authorized.session.user!.id;
  try {
    const result = await rpc<AdminMembershipRow>(authorized.env, 'lookup_admin_membership', {
      p_user_id: actorId,
    });
    if (!result.ok) {
      console.error(
        JSON.stringify({
          event: 'ADMIN_AUTHORIZATION_UPSTREAM_FAILURE',
          request_id: requestId,
          upstream_status: result.status,
          upstream_code: result.code,
        }),
      );
      return appendSetCookies(
        html(
          `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CrAPi</title><body><main style="font-family:system-ui;max-width:720px;margin:64px auto;padding:0 20px"><h1>Painel temporariamente indisponível</h1><p>Não foi possível validar o acesso administrativo no banco.</p><p><small>Referência: ${requestId}</small></p><p><a href="/admin">Tentar novamente</a></p></main></body></html>`,
          503,
          requestId,
        ),
        authorized.session.setCookies,
      );
    }

    const membership = result.rows[0];
    if (!membership || membership.status !== 'ACTIVE') {
      return appendSetCookies(
        html(
          '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso pendente</title><body><main style="font-family:system-ui;max-width:720px;margin:64px auto;padding:0 20px"><h1>Acesso administrativo pendente</h1><p>Sua conta está autenticada, mas ainda não possui autorização administrativa ativa.</p></main></body></html>',
          403,
          requestId,
        ),
        authorized.session.setCookies,
      );
    }

    return appendSetCookies(
      html(enhancedAdminPage(), 200, requestId),
      authorized.session.setCookies,
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'ADMIN_PAGE_RUNTIME_FAILURE',
        request_id: requestId,
        runtime_error: safeString(error instanceof Error ? error.message : 'UNKNOWN_ERROR'),
      }),
    );
    return appendSetCookies(
      html(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CrAPi</title><body><main style="font-family:system-ui;max-width:720px;margin:64px auto;padding:0 20px"><h1>Painel temporariamente indisponível</h1><p>Ocorreu uma falha ao carregar o painel.</p><p><small>Referência: ${requestId}</small></p><p><a href="/admin">Tentar novamente</a></p></main></body></html>`,
        503,
        requestId,
      ),
      authorized.session.setCookies,
    );
  }
}

async function handleDatabaseProbe(request: Request, env: Env): Promise<Response> {
  const requestId = requestIdFor(request);
  if (env.APP_ENV !== 'staging') return json({ error: 'NOT_FOUND' }, 404, requestId);
  if (!configured(env)) return json({ error: 'SERVICE_NOT_READY' }, 503, requestId);
  try {
    const upstream = await fetch(
      `${normalizeBaseUrl(env.SUPABASE_URL)}/rest/v1/admin_memberships?select=user_id&limit=1`,
      { headers: { accept: 'application/json', apikey: env.SUPABASE_SECRET_KEY } },
    );
    const body = (await upstream.json().catch(() => ({}))) as unknown;
    const record = isRecord(body) ? body : {};
    return json(
      {
        ok: upstream.ok,
        upstream_status: upstream.status,
        upstream_code: safeString(record.code) || null,
      },
      upstream.ok ? 200 : 503,
      requestId,
    );
  } catch (error) {
    return json(
      {
        error: 'SERVICE_UNAVAILABLE',
        diagnostics: {
          runtime_error: safeString(error instanceof Error ? error.message : 'UNKNOWN_ERROR'),
        },
      },
      503,
      requestId,
    );
  }
}

const gateway = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/debug/db/authorization') {
      return handleDatabaseProbe(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/admin') {
      return handleAdminPage(request, env);
    }

    if (url.pathname === '/admin/api/members' || url.pathname.startsWith('/admin/api/members/')) {
      return handleMembersApi(request, env, url);
    }

    return authGateway.fetch(request, env);
  },
};

export default gateway;
