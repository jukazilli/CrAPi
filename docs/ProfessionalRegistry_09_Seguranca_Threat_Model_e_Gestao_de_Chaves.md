# Professional Registry — Segurança, Threat Model e Gestão de Chaves

Status: Obrigatório antes de beta real.  
Data: 2026-08-29

## 1. Ativos

- API Keys do CrAPi;
- pepper/digests;
- `SUPABASE_SECRET_KEY`/credenciais privilegiadas;
- Registry Store e histórico;
- logs/auditoria;
- configuração de providers;
- sessão administrativa;
- secrets de deploy.

## 2. Fronteiras de confiança

1. Internet -> Cloudflare Worker/Data Plane.
2. Backend consumidor -> Registry API.
3. Admin -> Cloudflare Access -> Control Plane.
4. Worker -> Supabase Data API/PostgreSQL.
5. Worker/Sync Engine -> conselho externo.

## 3. Ameaças principais

### API Key do CrAPi roubada
Mitigação:
- keys por aplicação/ambiente;
- scopes;
- quota;
- revoke/rotate;
- last-used;
- security event.

### Key exposta em web/mobile
Mitigação:
- integração server-to-server;
- scanner de segredos;
- proibição arquitetural de key privilegiada em bundle distribuído.

### Credencial Supabase comprometida
Impacto elevado porque credencial server-side pode acessar dados privilegiados.

Mitigação:
- somente secret store do Worker;
- nunca em documentação, CI output ou cliente;
- key separada por serviço/ambiente quando disponível;
- rotação;
- RLS como defesa adicional;
- `anon`/`authenticated` sem grants no Registry Store.

### Vazamento do banco
Mitigação:
- API key raw não armazenada;
- digest com pepper separado;
- minimização de dados;
- RLS;
- trilha de auditoria;
- retenção controlada.

### Brute force de API Keys
Mitigação:
- alta entropia;
- comparação segura;
- rate limit;
- eventos de falha.

### Replay
Bearer key via TLS não impede replay se um endpoint consumidor for comprometido. Caso o threat model exija proteção adicional, HMAC por request com timestamp/nonce poderá ser adotado por versão de segurança sem alterar a semântica de negócio.

### Abuse / quota exhaustion
- rate limit por key/app;
- global safety limits;
- database-first;
- circuit breaker;
- bloqueio administrativo.

### Injection
- schemas estritos;
- queries parametrizadas/SDK estruturado;
- nunca interpolar input em SQL.

### SSRF
Providers não aceitam URL arbitrária do cliente. Upstreams são cadastrados em código/configuração aprovada.

### Malicious upstream HTML/JSON
- limite de tamanho;
- timeout;
- parser sem execução de script;
- fixtures;
- schema detector.

### Sensitive logs
Nunca registrar:
- `Authorization`;
- API Key completa;
- Supabase secret/service-role;
- cookie;
- senha PostgreSQL;
- body completo por padrão.

## 4. API Key lifecycle

Estados:
- `ACTIVE`;
- `ROTATING`;
- `REVOKED`;
- `EXPIRED`.

Criação:
1. gerar secret via CSPRNG;
2. montar prefixo + secret;
3. calcular digest HMAC-SHA256 com `API_KEY_PEPPER`;
4. persistir digest/prefix/last4/metadados;
5. retornar secret uma única vez.

Rotação:
- gerar nova key;
- grace period opcional;
- migrar consumidor;
- revogar antiga;
- auditar sem persistir segredo.

## 5. Scopes iniciais

- `registry:verify`;
- `registry:read`;
- `registry:batch` futuro.

Admin scopes não são expostos a API Keys de aplicação.

## 6. Supabase

- `SUPABASE_URL` é configuração; não concede acesso por si só.
- `SUPABASE_SECRET_KEY` é segredo de backend e nunca pertence ao browser/mobile.
- O Worker usa conexão server-side ao Supabase.
- Aplicações consumidoras não recebem publishable/secret key do projeto CrAPi.
- RLS é habilitado em todas as tabelas da fundação.
- A fundação não cria policies permissivas para `anon`/`authenticated`.
- Migrations só são consideradas concluídas depois de aplicadas e revisadas por advisors de segurança/performance.

## 7. HTTP

- HTTPS obrigatório;
- API Key do CrAPi em `Authorization`;
- `Cache-Control: no-store` para respostas administrativas com segredos;
- security headers no console;
- CORS fechado/restrito; integração de negócio é server-to-server.

## 8. Console

- protegido por Cloudflare Access;
- ações destrutivas auditadas;
- segredo somente one-time reveal;
- sessão administrativa não é compartilhada com Data Plane;
- console não acessa Supabase privilegiado diretamente.

## 9. Incidente de key

1. revogar;
2. identificar requests por key ID;
3. gerar nova;
4. atualizar backend consumidor;
5. revisar origem;
6. registrar evento sem copiar segredo.

## 10. Critérios de segurança para release

- secret scan;
- dependency audit;
- auth/scope/rate-limit tests;
- redaction tests;
- SQL injection tests;
- broken-auth tests;
- rotation/revocation tests;
- RLS/advisors revisados;
- Cloudflare Access comprovado;
- backup/export/restore comprovado.
