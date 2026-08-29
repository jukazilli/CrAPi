export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CrAPi Control Plane</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color-scheme: light dark; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { width: min(1080px, calc(100% - 32px)); margin: 40px auto; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: end; margin-bottom: 28px; }
    h1, h2, p { margin-top: 0; }
    .muted { opacity: .65; }
    .grid { display: grid; grid-template-columns: minmax(280px, .8fr) minmax(0, 1.4fr); gap: 20px; }
    .card { border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 18px; padding: 20px; background: color-mix(in srgb, Canvas 96%, CanvasText 4%); }
    label { display: block; font-size: 13px; margin: 14px 0 6px; opacity: .75; }
    input, select, button { font: inherit; }
    input, select { box-sizing: border-box; width: 100%; padding: 11px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); background: Canvas; color: CanvasText; }
    button { border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
    button.primary { background: CanvasText; color: Canvas; }
    button.ghost { background: color-mix(in srgb, CanvasText 9%, transparent); color: CanvasText; }
    button.danger { background: color-mix(in srgb, #d22 17%, transparent); color: #d33; }
    .row { display: flex; gap: 10px; align-items: center; }
    .row > * { flex: 1; }
    .stack { display: grid; gap: 10px; }
    .item { border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent); padding: 14px 0; }
    .item:first-child { border-top: 0; }
    .item-head { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    .tag { font-size: 12px; padding: 4px 7px; border-radius: 999px; background: color-mix(in srgb, CanvasText 9%, transparent); }
    .actions { display: flex; gap: 8px; margin-top: 10px; }
    .actions button { padding: 7px 10px; font-size: 13px; }
    #notice, #secret { margin: 16px 0; padding: 14px; border-radius: 12px; display: none; }
    #notice { background: color-mix(in srgb, #d99b00 15%, transparent); }
    #secret { background: color-mix(in srgb, #0a8 13%, transparent); }
    #secret pre { white-space: pre-wrap; overflow-wrap: anywhere; user-select: all; }
    .empty { opacity: .55; padding: 18px 0; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } header { display: block; } }
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <div class="muted">Professional Registry</div>
      <h1>CrAPi Control Plane</h1>
      <p class="muted">Checkpoint operacional: aplicações, API Keys, rotação e revogação.</p>
    </div>
    <div style="min-width:280px">
      <label for="token">Admin token</label>
      <div class="row">
        <input id="token" type="password" autocomplete="off" placeholder="Cole o token de staging" />
        <button id="connect" class="primary" style="flex:0 0 auto">Conectar</button>
      </div>
    </div>
  </header>

  <div id="notice"></div>
  <div id="secret">
    <strong>API Key — exibida somente agora</strong>
    <pre id="secretValue"></pre>
    <button id="copySecret" class="ghost">Copiar chave</button>
  </div>

  <div class="grid">
    <section class="card">
      <h2>Aplicações</h2>
      <form id="applicationForm">
        <label for="appName">Nome</label>
        <input id="appName" required placeholder="DayGym staging" />
        <label for="appSlug">Slug</label>
        <input id="appSlug" required pattern="[a-z0-9][a-z0-9_-]{1,62}" placeholder="daygym-staging" />
        <button class="primary" style="margin-top:14px;width:100%">Criar aplicação</button>
      </form>
      <div id="applications" style="margin-top:18px"><div class="empty">Conecte para carregar.</div></div>
    </section>

    <section class="card">
      <div class="item-head">
        <div>
          <h2 style="margin-bottom:4px">API Keys</h2>
          <div id="selectedApp" class="muted">Selecione uma aplicação.</div>
        </div>
      </div>
      <form id="keyForm" style="display:none">
        <div class="row">
          <div>
            <label for="keyName">Nome da chave</label>
            <input id="keyName" required value="Staging key" />
          </div>
          <div>
            <label for="environment">Ambiente</label>
            <select id="environment"><option>TEST</option><option>LIVE</option></select>
          </div>
        </div>
        <label for="dailyLimit">Limite diário</label>
        <input id="dailyLimit" type="number" min="1" max="1000000" value="1000" />
        <button class="primary" style="margin-top:14px">Gerar nova API Key</button>
      </form>
      <div id="keys" style="margin-top:18px"><div class="empty">Nenhuma aplicação selecionada.</div></div>
    </section>
  </div>
</main>
<script>
(() => {
  let adminToken = '';
  let selectedApplication = null;
  const $ = (id) => document.getElementById(id);

  function notice(message) {
    const box = $('notice');
    box.textContent = message;
    box.style.display = 'block';
  }

  function clearNotice() { $('notice').style.display = 'none'; }

  async function api(path, options) {
    clearNotice();
    const response = await fetch(path, {
      ...(options || {}),
      headers: {
        'content-type': 'application/json',
        'x-crapi-admin-token': adminToken,
        ...((options && options.headers) || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || ('HTTP ' + response.status));
    return body;
  }

  function showSecret(value) {
    $('secretValue').textContent = value;
    $('secret').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadApplications() {
    const data = await api('/admin/api/applications');
    const root = $('applications');
    root.replaceChildren();
    if (!data.applications.length) {
      root.innerHTML = '<div class="empty">Nenhuma aplicação criada.</div>';
      return;
    }
    data.applications.forEach((app) => {
      const item = document.createElement('div');
      item.className = 'item';
      const head = document.createElement('div');
      head.className = 'item-head';
      const text = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = app.name;
      const meta = document.createElement('div');
      meta.className = 'muted';
      meta.textContent = app.slug;
      text.append(strong, meta);
      const button = document.createElement('button');
      button.className = 'ghost';
      button.type = 'button';
      button.textContent = 'Gerenciar';
      button.onclick = () => selectApplication(app);
      head.append(text, button);
      item.append(head);
      root.append(item);
    });
  }

  async function selectApplication(app) {
    selectedApplication = app;
    $('selectedApp').textContent = app.name + ' · ' + app.slug;
    $('keyForm').style.display = 'block';
    await loadKeys();
  }

  async function loadKeys() {
    if (!selectedApplication) return;
    const data = await api('/admin/api/applications/' + encodeURIComponent(selectedApplication.id) + '/keys');
    const root = $('keys');
    root.replaceChildren();
    if (!data.keys.length) {
      root.innerHTML = '<div class="empty">Nenhuma chave criada.</div>';
      return;
    }
    data.keys.forEach((key) => {
      const item = document.createElement('div');
      item.className = 'item';
      const head = document.createElement('div');
      head.className = 'item-head';
      const text = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = key.name;
      const meta = document.createElement('div');
      meta.className = 'muted';
      meta.textContent = key.key_prefix + '…' + key.last4 + ' · ' + key.environment;
      text.append(strong, meta);
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = key.status;
      head.append(text, tag);
      item.append(head);

      if (key.status === 'ACTIVE' || key.status === 'ROTATING') {
        const actions = document.createElement('div');
        actions.className = 'actions';
        const rotate = document.createElement('button');
        rotate.className = 'ghost';
        rotate.textContent = 'Rotacionar';
        rotate.onclick = async () => {
          try {
            const result = await api('/admin/api/keys/' + encodeURIComponent(key.id) + '/rotate', { method: 'POST', body: '{}' });
            showSecret(result.key.raw_key);
            await loadKeys();
          } catch (error) { notice(error.message); }
        };
        const revoke = document.createElement('button');
        revoke.className = 'danger';
        revoke.textContent = 'Revogar';
        revoke.onclick = async () => {
          if (!confirm('Revogar esta API Key? A ação interrompe chamadas que ainda usam a chave.')) return;
          try {
            await api('/admin/api/keys/' + encodeURIComponent(key.id) + '/revoke', { method: 'POST', body: '{}' });
            await loadKeys();
          } catch (error) { notice(error.message); }
        };
        actions.append(rotate, revoke);
        item.append(actions);
      }
      root.append(item);
    });
  }

  $('connect').onclick = async () => {
    adminToken = $('token').value;
    try {
      await loadApplications();
      $('token').value = '';
    } catch (error) { notice('Não foi possível autenticar: ' + error.message); }
  };

  $('applicationForm').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api('/admin/api/applications', {
        method: 'POST',
        body: JSON.stringify({ name: $('appName').value, slug: $('appSlug').value })
      });
      event.target.reset();
      await loadApplications();
    } catch (error) { notice(error.message); }
  };

  $('keyForm').onsubmit = async (event) => {
    event.preventDefault();
    if (!selectedApplication) return;
    try {
      const result = await api('/admin/api/applications/' + encodeURIComponent(selectedApplication.id) + '/keys', {
        method: 'POST',
        body: JSON.stringify({
          name: $('keyName').value,
          environment: $('environment').value,
          daily_limit: Number($('dailyLimit').value),
          scopes: ['registry:verify']
        })
      });
      showSecret(result.key.raw_key);
      await loadKeys();
    } catch (error) { notice(error.message); }
  };

  $('copySecret').onclick = async () => {
    await navigator.clipboard.writeText($('secretValue').textContent || '');
    $('copySecret').textContent = 'Copiado';
    setTimeout(() => { $('copySecret').textContent = 'Copiar chave'; }, 1200);
  };
})();
</script>
</body>
</html>`;
