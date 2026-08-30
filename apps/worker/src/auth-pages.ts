export type AuthPageMode = 'login' | 'signup' | 'recover' | 'reset';

function titleFor(mode: AuthPageMode): string {
  if (mode === 'signup') return 'Criar conta';
  if (mode === 'recover') return 'Recuperar acesso';
  if (mode === 'reset') return 'Definir nova senha';
  return 'Entrar';
}

function formFor(mode: AuthPageMode): string {
  if (mode === 'signup') {
    return String.raw`
      <form id="authForm">
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" required placeholder="voce@empresa.com" />
        <label for="password">Senha</label>
        <input id="password" type="password" autocomplete="new-password" minlength="10" required placeholder="Mínimo de 10 caracteres" />
        <label for="passwordConfirm">Confirme a senha</label>
        <input id="passwordConfirm" type="password" autocomplete="new-password" minlength="10" required />
        <button class="primary" type="submit">Criar conta</button>
      </form>
      <p class="links">Já possui conta? <a href="/login">Entrar</a></p>`;
  }

  if (mode === 'recover') {
    return String.raw`
      <form id="authForm">
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" required placeholder="voce@empresa.com" />
        <button class="primary" type="submit">Enviar recuperação</button>
      </form>
      <p class="links"><a href="/login">Voltar para o login</a></p>`;
  }

  if (mode === 'reset') {
    return String.raw`
      <form id="authForm">
        <label for="password">Nova senha</label>
        <input id="password" type="password" autocomplete="new-password" minlength="10" required placeholder="Mínimo de 10 caracteres" />
        <label for="passwordConfirm">Confirme a nova senha</label>
        <input id="passwordConfirm" type="password" autocomplete="new-password" minlength="10" required />
        <button class="primary" type="submit">Salvar nova senha</button>
      </form>`;
  }

  return String.raw`
    <form id="authForm">
      <label for="email">E-mail</label>
      <input id="email" type="email" autocomplete="email" required placeholder="voce@empresa.com" />
      <label for="password">Senha</label>
      <input id="password" type="password" autocomplete="current-password" required />
      <button class="primary" type="submit">Entrar</button>
    </form>
    <div class="links split"><a href="/criar-conta">Criar conta</a><a href="/recuperar-senha">Esqueci minha senha</a></div>`;
}

function endpointFor(mode: AuthPageMode): string {
  if (mode === 'signup') return '/auth/signup';
  if (mode === 'recover') return '/auth/recover';
  if (mode === 'reset') return '/auth/password';
  return '/auth/login';
}

export function renderAuthPage(mode: AuthPageMode): string {
  const title = titleFor(mode);
  const endpoint = endpointFor(mode);
  const form = formFor(mode);
  return String.raw`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · CrAPi</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
    main { width: min(440px, calc(100% - 32px)); }
    .brand { margin-bottom: 28px; }
    .eyebrow { font-size: 13px; opacity: .55; margin-bottom: 6px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 6vw, 38px); letter-spacing: -.035em; }
    p { line-height: 1.5; }
    .muted { opacity: .62; }
    .card { padding: 26px; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 22px; background: color-mix(in srgb, Canvas 97%, CanvasText 3%); }
    label { display: block; margin: 15px 0 6px; font-size: 13px; opacity: .72; }
    input, button { width: 100%; font: inherit; border-radius: 11px; }
    input { border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); padding: 12px 13px; background: Canvas; color: CanvasText; }
    button { margin-top: 18px; border: 0; padding: 12px 14px; cursor: pointer; }
    button.primary { background: CanvasText; color: Canvas; }
    button:disabled { opacity: .5; cursor: default; }
    .links { font-size: 14px; margin: 18px 0 0; }
    .links.split { display: flex; justify-content: space-between; gap: 16px; }
    a { color: inherit; }
    #notice { display: none; margin: 0 0 14px; padding: 12px 13px; border-radius: 11px; background: color-mix(in srgb, #d99b00 15%, transparent); font-size: 14px; }
  </style>
</head>
<body>
<main>
  <div class="brand">
    <div class="eyebrow">Professional Registry</div>
    <h1>${title}</h1>
    <p class="muted">A conta identifica você. O acesso ao Control Plane depende de autorização administrativa separada.</p>
  </div>
  <section class="card">
    <div id="notice"></div>
    ${form}
  </section>
</main>
<script>
(() => {
  const mode = ${JSON.stringify(mode)};
  const endpoint = ${JSON.stringify(endpoint)};
  const form = document.getElementById('authForm');
  const notice = document.getElementById('notice');
  const button = form.querySelector('button[type="submit"]');

  function show(message) {
    notice.textContent = message;
    notice.style.display = 'block';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    notice.style.display = 'none';
    const payload = {};
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const passwordConfirm = document.getElementById('passwordConfirm');
    if (email) payload.email = email.value;
    if (password) payload.password = password.value;
    if (passwordConfirm && password.value !== passwordConfirm.value) {
      show('As senhas não coincidem.');
      return;
    }

    button.disabled = true;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || ('HTTP ' + response.status));

      if (mode === 'signup' && body.requires_email_confirmation) {
        show('Conta criada. Confira seu e-mail para confirmar o cadastro e depois faça login.');
        form.reset();
        return;
      }
      if (mode === 'recover') {
        show('Se existir uma conta para este e-mail, você receberá as instruções de recuperação.');
        form.reset();
        return;
      }
      if (mode === 'reset') {
        location.replace('/admin');
        return;
      }
      location.replace('/admin');
    } catch (error) {
      show(error instanceof Error ? error.message : 'Não foi possível concluir a solicitação.');
    } finally {
      button.disabled = false;
    }
  });
})();
</script>
</body>
</html>`;
}

export const AUTH_CALLBACK_PAGE = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Confirmando acesso · CrAPi</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
    main { width: min(460px, calc(100% - 32px)); text-align: center; }
    p { opacity: .65; line-height: 1.5; }
  </style>
</head>
<body><main><h1>Confirmando acesso</h1><p id="status">Validando sua sessão...</p></main>
<script>
(async () => {
  const status = document.getElementById('status');
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  const requestedNext = new URL(location.href).searchParams.get('next') || '/admin';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/admin';
  history.replaceState(null, '', location.pathname + location.search);
  if (!accessToken || !refreshToken) {
    status.textContent = 'Link inválido ou expirado. Solicite um novo acesso.';
    return;
  }
  try {
    const response = await fetch('/auth/session/adopt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken })
    });
    if (!response.ok) throw new Error('Falha ao validar a sessão.');
    location.replace(next);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Não foi possível confirmar o acesso.';
  }
})();
</script></body></html>`;

export function renderAccessPendingPage(ownerBootstrapAvailable: boolean): string {
  const bootstrap = ownerBootstrapAvailable
    ? String.raw`
      <section class="card bootstrap">
        <h2>Ativar primeiro proprietário</h2>
        <p>Esta instalação ainda não possui OWNER. Use o token administrativo de bootstrap uma única vez para vincular esta conta como proprietária.</p>
        <label for="bootstrapToken">Token de bootstrap</label>
        <input id="bootstrapToken" type="password" autocomplete="off" />
        <button id="bootstrap" class="primary">Ativar minha conta como OWNER</button>
      </section>`
    : String.raw`
      <section class="card">
        <h2>Conta sem autorização</h2>
        <p>Sua identidade foi autenticada, mas esta conta não possui uma membership administrativa ativa. Somente um OWNER pode liberar o Control Plane.</p>
      </section>`;

  return String.raw`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Acesso restrito · CrAPi</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { width: min(660px, calc(100% - 32px)); margin: 64px auto; }
    .eyebrow { opacity: .55; font-size: 13px; }
    h1 { margin: 6px 0 12px; }
    p { line-height: 1.55; opacity: .72; }
    .card { margin-top: 24px; padding: 24px; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); border-radius: 20px; }
    label { display: block; font-size: 13px; opacity: .72; margin: 16px 0 6px; }
    input, button { font: inherit; border-radius: 11px; }
    input { width: 100%; padding: 12px 13px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); background: Canvas; color: CanvasText; }
    button { border: 0; padding: 11px 14px; cursor: pointer; }
    button.primary { width: 100%; margin-top: 14px; background: CanvasText; color: Canvas; }
    button.ghost { margin-top: 18px; background: color-mix(in srgb, CanvasText 9%, transparent); color: CanvasText; }
    #notice { margin-top: 12px; display: none; }
  </style>
</head>
<body><main>
  <div class="eyebrow">Professional Registry</div>
  <h1>Acesso administrativo restrito</h1>
  <p>Login e autorização são etapas diferentes. Estar autenticado não concede acesso à API nem ao Control Plane.</p>
  ${bootstrap}
  <div id="notice"></div>
  <button id="logout" class="ghost">Sair desta conta</button>
</main>
<script>
(() => {
  const notice = document.getElementById('notice');
  const bootstrap = document.getElementById('bootstrap');
  if (bootstrap) bootstrap.onclick = async () => {
    notice.style.display = 'none';
    const token = document.getElementById('bootstrapToken').value;
    bootstrap.disabled = true;
    try {
      const response = await fetch('/auth/bootstrap-owner', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-crapi-admin-token': token },
        body: '{}'
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || body.error || ('HTTP ' + response.status));
      document.getElementById('bootstrapToken').value = '';
      location.replace('/admin');
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : 'Não foi possível ativar a conta.';
      notice.style.display = 'block';
    } finally { bootstrap.disabled = false; }
  };

  document.getElementById('logout').onclick = async () => {
    await fetch('/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    location.replace('/login');
  };
})();
</script></body></html>`;
}
