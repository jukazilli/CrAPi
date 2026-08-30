# Professional Registry — Backlog Canônico, Rastreabilidade e Plano de Entrega

Status: Fundação v0.2

A matriz detalhada está em `ProfessionalRegistry_08_Matriz_de_Rastreabilidade_e_Backlog.xlsx`.

## Marcos

### M0 — Fundação e governança
Objetivo: repositório reproduzível, contratos, CI, ambientes e documentação canônica.

### M1 — Segurança, identidade e autorização
Objetivo: contas humanas, memberships administrativas, Applications, API Keys, scopes, quotas, redaction e Control Plane protegido.

### M2 — Registry Store, Sync Engine e CREF
Objetivo: endpoint unificado, banco local canônico, sync periódico, provider mock -> provider HTTP, parser, freshness e resiliência.

### M3 — Console operacional
Objetivo: Overview, Applications, Keys, Requests, Registries, Providers, Sync e Security.

### M4 — Beta fechado
Objetivo: integração real com primeiro consumidor, staging/production, observabilidade, restore e runbooks.

## Requisitos canônicos

- PR-REQ-001: produto independente.
- PR-REQ-002: API privada.
- PR-REQ-003: chaves individuais por aplicação.
- PR-REQ-004: segredo não armazenado em claro.
- PR-REQ-005: server-to-server.
- PR-REQ-006: contrato de status conservador.
- PR-REQ-007: providers substituíveis.
- PR-REQ-008: cache + quotas para free-first.
- PR-REQ-009: console administrativo.
- PR-REQ-010: request/audit observability.
- PR-REQ-011: sem bypass anti-bot.
- PR-REQ-012: CI/security gates.
- PR-REQ-013: banco e infra próprios.
- PR-REQ-014: revogação/rotação de chaves.
- PR-REQ-015: falha upstream não gera falso status.
- PR-REQ-016: database-first como fonte operacional.
- PR-REQ-017: sincronização programada configurável por provider.
- PR-REQ-018: histórico e freshness dos registros.
- PR-REQ-019: on-demand refresh para miss/stale.
- PR-REQ-020: full sync somente quando a fonte expõe enumeração/listagem apropriada.
- PR-REQ-021: Control Plane exige conta humana com cadastro, login, recuperação e sessão segura.
- PR-REQ-022: autenticação humana não implica autorização; somente membership administrativa ativa libera o Control Plane.
- PR-REQ-023: JWT humano nunca autentica o Data Plane; Registry API aceita apenas credencial de Application autorizada.

## Estado de execução — 30/08/2026

| Backlog ID | Status | Evidência |
| --- | --- | --- |
| PR-M0-001 | Done | Documentação canônica e `AGENTS.md` versionados. |
| PR-M0-002 | Done | Node/pnpm fixos, workspaces, lockfile congelado e toolchain reproduzível. |
| PR-M0-003 | Done | GitHub Actions executa format, toolchain, lint, typecheck, test, build, secret scan e dependency audit com sucesso. |
| PR-M0-004 | Done | `crapi-staging` publicado em Cloudflare Workers via GitHub Actions; `/health` e `/ready` respondem 200, telas de Auth respondem 200, `/admin` sem sessão redireciona para `/login` e a API administrativa sem sessão responde 401. |
| PR-M0-005 | Done | Registry Contract V1 tipado, normalização e testes presentes. |
| PR-M1-001 | Done | Schema Supabase aplicado, 15 tabelas com RLS, grants restritos e advisors revisados. |
| PR-M1-002 | In Progress | Lifecycle create/list/rotate/revoke implementado com RPCs server-only e raw key one-time; ciclo manual hospedado ainda precisa ser provado. |
| PR-M1-003 | In Progress | Middleware + lookup Supabase + endpoint protegido real implementados e passando CI; ciclo create-key -> verify hospedado ainda precisa ser provado. |
| PR-M1-004 | In Progress | Scope `registry:verify` aplicado na rota real; prova com API Key emitida no staging ainda pendente. |
| PR-M1-005 | In Progress | Quota diária implementada para o checkpoint; reserva atômica sob concorrência será endurecida antes do beta. |
| PR-M1-006 | In Progress | Control Plane publicado com sessão Supabase Auth + `admin_memberships`; bootstrap manual do primeiro OWNER e ciclo administrativo autenticado ainda precisam de aceite. |
| PR-M1-007 | In Progress | Cadastro, login, confirmação/callback, recuperação, redefinição e refresh de sessão implementados; falta configurar a Site URL/Redirect URL do Auth no Dashboard e executar o E2E real de e-mail + primeiro OWNER. |
| PR-M2-001 | In Progress | Slice database-first implementado: Registry Store hit retorna snapshot; miss retorna `INCONCLUSIVE` até on-demand refresh/provider. |

### Modelo de autenticação e autorização

O CrAPi possui duas fronteiras independentes:

1. **Humano / Control Plane:** Supabase Auth identifica a pessoa; `admin_memberships` decide se a conta possui papel `OWNER` ou `ADMIN` ativo.
2. **Aplicação / Data Plane:** `prk_test_*` e `prk_live_*` identificam Applications autorizadas e aplicam scopes/quotas.

Consequências obrigatórias:

- criar conta ou fazer login não libera `/admin` automaticamente;
- conta autenticada sem membership recebe acesso negado;
- JWT de usuário não pode chamar `POST /v1/professional-registrations/verify`;
- `ADMIN_TOKEN` não é login e fica restrito ao bootstrap único/break-glass;
- primeiro OWNER exige simultaneamente sessão válida + `ADMIN_TOKEN`;
- o banco serializa o bootstrap e impede dois OWNERs iniciais concorrentes.

### Checkpoint mínimo publicado

Staging: `https://crapi-staging.soberania-24b.workers.dev`

Antes do E2E de e-mail, configurar no Supabase Auth:

- Site URL: `https://crapi-staging.soberania-24b.workers.dev`;
- Redirect URL: `https://crapi-staging.soberania-24b.workers.dev/auth/callback`.

Fluxo humano planejado para o aceite:

1. criar conta em `/criar-conta`;
2. confirmar o e-mail quando exigido pelo Supabase Auth;
3. entrar em `/login`;
4. abrir `/admin`;
5. se ainda não existir OWNER, informar o `ADMIN_TOKEN` somente na tela de bootstrap;
6. receber membership `OWNER` ativa;
7. criar Application;
8. gerar API Key `TEST` e visualizar o segredo somente uma vez;
9. autenticar `POST /v1/professional-registrations/verify` com scope `registry:verify`;
10. rotacionar/revogar a chave e confirmar auditoria.

O miss no Registry Store é conservador: retorna `INCONCLUSIVE`/`UNKNOWN`, nunca `INACTIVE` por inferência.

### Evidência dos gates e staging

A execução hospedada da branch `foundation/m0-supabase` passa por:

- `pnpm install --frozen-lockfile`;
- Prettier;
- check de toolchain;
- ESLint;
- TypeScript strict;
- Vitest, incluindo testes de sessão Supabase Auth e rejeição de JWT humano no Data Plane;
- build;
- secret scan;
- dependency audit;
- deploy com Wrangler fixado;
- espera de propagação do Worker;
- `GET /health` → 200;
- `GET /ready` → 200;
- `GET /login` → 200;
- `GET /criar-conta` → 200;
- `GET /recuperar-senha` → 200;
- `GET /admin` sem sessão → 303;
- `GET /admin/api/applications` sem sessão → 401.

O workflow permanece com `contents: read`. Secrets existem somente no GitHub Actions/Cloudflare runtime e não são persistidos no repositório.

### Banco e segurança do checkpoint

- migration `m1_control_plane_and_registry_rpcs` aplicada no projeto `cr-api`;
- migration `20260830011309_admin_memberships_and_owner_bootstrap` aplicada e alinhada ao histórico remoto;
- `admin_memberships` possui RLS e nenhum grant para `anon`/`authenticated`;
- funções administrativas e de lookup usam `security invoker`;
- execução revogada de `public`, `anon` e `authenticated` e concedida somente ao runtime privilegiado;
- bootstrap do OWNER usa advisory transaction lock e audit event;
- advisors de segurança permanecem apenas com INFO `RLS Enabled No Policy`, intencional no modelo deny-by-default;
- publishable key é configuração pública para Supabase Auth; secret key continua exclusivamente server-side.

## Regras de backlog

Todo item deve possuir:
- ID;
- requisito;
- marco;
- descrição;
- critério de aceite;
- dependências;
- prioridade;
- status;
- evidência.

Nenhum item é `Done` apenas porque o código foi escrito.
