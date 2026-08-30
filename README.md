# CrAPi — Professional Registry

API privada e independente para normalizar e verificar registros de conselhos profissionais brasileiros.

## Arquitetura

- Cloudflare Workers: Data Plane, autenticação de sessão e rotas administrativas.
- Supabase Auth: cadastro, login, confirmação, recuperação e sessão humana.
- Resend via SMTP customizado: transporte padrão dos e-mails do Supabase Auth.
- Supabase PostgreSQL: Registry Store, memberships administrativas, histórico, sync e auditoria.
- Database-first + Scheduled Sync + On-demand Refresh.
- API Keys próprias por aplicação/ambiente.
- autenticação humana e autenticação de aplicações são fronteiras independentes.

## Estado

Staging publicado com autenticação de usuário e autorização administrativa separadas.

- documentação canônica: atualizada para o modelo Supabase Auth + memberships;
- contrato V1: criado;
- Supabase `cr-api`: conectado e saudável em `sa-east-1`;
- migrations fundacionais e M1: aplicadas e alinhadas ao histórico remoto;
- 15 tabelas operacionais/administrativas: criadas com RLS ativo;
- Supabase Auth: integrado ao Worker;
- login, criação de conta, recuperação e redefinição de senha: implementados;
- Resend: arquitetura, templates e automação de configuração SMTP preparados; ativação externa depende de domínio verificado + credenciais locais;
- sessão: cookies `HttpOnly`, `Secure` e `SameSite=Strict`;
- autorização humana: `admin_memberships` com papéis `OWNER`/`ADMIN`;
- primeiro OWNER: bootstrap único exigindo sessão válida + `ADMIN_TOKEN`;
- usuário autenticado sem membership: não acessa o Control Plane;
- JWT de usuário: nunca autentica a Registry API;
- Control Plane: implementado em `/admin`;
- Applications + API Keys: criar, listar, rotacionar e revogar;
- chave raw: exibida somente na criação/rotação e nunca persistida;
- endpoint protegido `POST /v1/professional-registrations/verify`: implementado;
- quota diária e auditoria de requests: implementadas;
- miss no Registry Store: retorna `INCONCLUSIVE`, nunca falso `INACTIVE`;
- deploy de staging: automatizado via GitHub Actions após quality/security gates;
- staging: `https://crapi-staging.soberania-24b.workers.dev`.

## Superfícies de autenticação

- `/login` — autenticação com e-mail e senha;
- `/criar-conta` — cadastro de conta;
- `/recuperar-senha` — solicitação de recuperação;
- `/redefinir-senha` — definição de nova senha após recuperação;
- `/admin` — exige sessão válida e membership administrativa ativa.

Login não concede acesso à API. O Data Plane continua aceitando somente API Keys próprias do CrAPi no formato `prk_test_*`/`prk_live_*`.

## Evidência hospedada

O pipeline de staging publica com Wrangler fixado e aguarda a propagação antes dos smoke tests. Evidência atual:

- `GET /health` → HTTP 200;
- `GET /ready` → HTTP 200;
- `GET /login` → HTTP 200;
- `GET /criar-conta` → HTTP 200;
- `GET /recuperar-senha` → HTTP 200;
- `GET /admin` sem sessão → HTTP 303 para `/login`;
- `GET /admin/api/applications` sem sessão → HTTP 401;
- quality/security gates → sucesso;
- testes unitários confirmam que JWT humano não é aceito como API Key da Registry API.

## Configuração externa do Supabase Auth

Para confirmação de e-mail e recuperação funcionarem no domínio de staging, o projeto Supabase deve autorizar o Worker:

- Site URL: `https://crapi-staging.soberania-24b.workers.dev`;
- Redirect URL: `https://crapi-staging.soberania-24b.workers.dev/auth/callback`.

Os templates versionados usam `/auth/confirm` com `TokenHash` para concluir a verificação server-side e criar a sessão segura.

### Resend

O transporte padrão definido para e-mails de Auth é Resend por SMTP customizado do Supabase.

- templates: `supabase/templates/`;
- configuração automatizada: `tools/supabase/configure-auth-resend.ps1`;
- documentação: `docs/ProfessionalRegistry_09_Email_Auth_Resend.md`.

A `RESEND_API_KEY` não pertence ao runtime do Worker e nunca deve ser commitada. A ativação é feita no Supabase/Resend com credenciais mantidas somente no ambiente local de configuração.

## Primeiro OWNER

O banco inicia sem OWNER. O primeiro proprietário é criado de forma controlada:

1. criar e confirmar uma conta pelo Supabase Auth;
2. fazer login;
3. abrir `/admin`;
4. enquanto não existir OWNER, a tela apresenta o bootstrap inicial;
5. informar o `ADMIN_TOKEN` de staging uma única vez;
6. o Worker exige simultaneamente sessão válida e token de bootstrap;
7. o banco serializa a operação e cria somente um OWNER ativo;
8. acessos posteriores usam apenas a sessão da conta + membership.

O `ADMIN_TOKEN` não é o login do Control Plane. Ele permanece apenas como credencial de bootstrap/break-glass e nunca autoriza a Registry API.

O aceite manual desta etapa deve confirmar somente que existe um OWNER ativo e que o painel abre após o login; nenhum token, senha ou API Key deve ser copiado para tickets, commits ou chats.

## Checkpoint navegável

Após criar o OWNER, o fluxo mínimo é:

1. entrar em `/login`;
2. abrir `/admin`;
3. criar uma Application autorizada, por exemplo DayGym ou Stude.ai;
4. gerar uma API Key `TEST`;
5. copiar a chave exibida uma única vez;
6. chamar `POST /v1/professional-registrations/verify` pelo backend consumidor com `Authorization: Bearer <api-key>`;
7. rotacionar ou revogar a chave pelo Control Plane.

Aplicações consumidoras não recebem JWT administrativo nem credenciais Supabase.

## Runtime

Configuração não sensível:

- `APP_ENV=staging`;
- `SUPABASE_URL`;
- `SUPABASE_PUBLISHABLE_KEY` — chave pública usada exclusivamente para os endpoints do Supabase Auth.

Segredos de runtime:

- `SUPABASE_SECRET_KEY` — chave server-side privilegiada do Supabase;
- `API_KEY_PEPPER` — segredo de HMAC das API Keys CrAPi;
- `ADMIN_TOKEN` — bootstrap/break-glass, separado da autenticação normal.

Segredos usados somente pelo pipeline de deploy:

- `CLOUDFLARE_API_TOKEN`;
- `CLOUDFLARE_ACCOUNT_ID`.

Nunca commitar ou enviar segredos em chat, URL, código cliente ou documentação. A publishable key do Supabase é configuração pública e não possui os privilégios da secret key.

## Banco

O banco é exclusivo do Professional Registry. Aplicações consumidoras não acessam o Supabase diretamente.

A fonte operacional é `professional_registry`; sincronizações e refreshes atualizam essa tabela e o histórico correspondente. `admin_memberships` é a fonte de autorização humana do Control Plane.

## Toolchain

- Node 22.12.0
- pnpm 9.11.0
- TypeScript 5.9.3
- ESLint
- Prettier
- Vitest

## Comandos

```bash
pnpm install
pnpm check:ci
pnpm security
```

Leia `AGENTS.md` antes de alterar código.
