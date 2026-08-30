import worker from './index.js';

type Env = Parameters<typeof worker.fetch>[1];

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

async function formToJsonRequest(request: Request): Promise<Request> {
  const form = await request.formData();
  const payload: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') payload[key] = value;
  }

  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');

  return new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
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
  const transformed = await formToJsonRequest(request);
  const response = await worker.fetch(transformed, env);
  const body = await response
    .clone()
    .json()
    .catch(() => null);

  if (response.ok) {
    const redirected = redirect(nativeSuccessDestination(url.pathname, body));
    const headers = new Headers(redirected.headers);
    for (const cookie of response.headers.getSetCookie?.() ?? []) {
      headers.append('set-cookie', cookie);
    }
    return new Response(null, { status: 303, headers });
  }

  const page = authPageByPath[url.pathname] ?? '/login';
  return redirect(`${page}?auth_error=${response.status}`);
}

const entry = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && authPageByPath[url.pathname]) {
      return redirect(authPageByPath[url.pathname]);
    }

    if (request.method === 'GET' && formRouteByPage[url.pathname]) {
      return enhanceAuthPage(request, env, url);
    }

    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (
      request.method === 'POST' &&
      authPageByPath[url.pathname] &&
      contentType.includes('application/x-www-form-urlencoded')
    ) {
      return handleNativeAuthPost(request, env, url);
    }

    return worker.fetch(request, env);
  },
};

export default entry;
