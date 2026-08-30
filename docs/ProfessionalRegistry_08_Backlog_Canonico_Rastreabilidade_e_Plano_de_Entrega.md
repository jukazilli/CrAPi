# Professional Registry — Backlog Canônico, Rastreabilidade e Plano de Entrega

Status: Fundação v0.1

A matriz detalhada está em `ProfessionalRegistry_08_Matriz_de_Rastreabilidade_e_Backlog.xlsx`.

## Marcos

### M0 — Fundação e governança
Objetivo: repositório reproduzível, contratos, CI, ambientes e documentação canônica.

### M1 — Segurança e identidade de aplicações
Objetivo: Applications, API Keys, scopes, quotas, redaction e Control Plane protegido.

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

## Estado de execução — 29/08/2026

| Backlog ID | Status | Evidência |
| --- | --- | --- |
| PR-M0-001 | Done | Documentação canônica e `AGENTS.md` versionados. |
| PR-M0-002 | Done | Node/pnpm fixos, workspaces, lockfile congelado e toolchain reproduzível. |
| PR-M0-003 | Done | GitHub Actions executa format, toolchain, lint, typecheck, test, build, secret scan e dependency audit com sucesso. |
| PR-M0-004 | Done | `crapi-staging` publicado em Cloudflare Workers via GitHub Actions; `/health`, `/ready` e `/admin` respondem 200 e a API administrativa sem token responde 401 no smoke test hospedado. |
| PR-M0-005 | Done | Registry Contract V1 tipado, normalização e testes presentes. |
| PR-M1-001 | Done | Schema Supabase aplicado, 14 tabelas com RLS, grants restritos e advisors revisados. |
| PR-M1-002 | In Progress | Lifecycle create/list/rotate/revoke implementado com RPCs server-only e raw key one-time; ciclo manual hospedado ainda precisa ser provado. |
| PR-M1-003 | In Progress | Middleware + lookup Supabase + endpoint protegido real implementados e passando CI; ciclo create-key -> verify hospedado ainda precisa ser provado. |
| PR-M1-004 | In Progress | Scope `registry:verify` aplicado na rota real; prova com API Key emitida no staging ainda pendente. |
| PR-M1-005 | In Progress | Quota diária implementada para o checkpoint; reserva atômica sob concorrência será endurecida antes do beta. |
| PR-M1-006 | In Progress | Control Plane mínimo publicado e navegável em `/admin`; login e lifecycle manual são o próximo checkpoint de aceite. |
| PR-M2-001 | In Progress | Slice database-first implementado: Registry Store hit retorna snapshot; miss retorna `INCONCLUSIVE` até on-demand refresh/provider. |

### Checkpoint mínimo publicado

Staging: `https://crapi-staging.soberania-24b.workers.dev`

O código e a infraestrutura já permitem o seguinte fluxo:

1. autenticar no Control Plane de staging;
2. criar Application;
3. gerar API Key `TEST` e visualizar o segredo somente uma vez;
4. autenticar `POST /v1/professional-registrations/verify` com scope `registry:verify`;
5. aplicar quota diária;
6. consultar `professional_registry` como fonte operacional;
7. registrar `api_requests` e `professional_verifications`;
8. rotacionar ou revogar a chave;
9. registrar ações administrativas em `admin_audit_log`.

O miss no Registry Store é conservador: retorna `INCONCLUSIVE`/`UNKNOWN`, nunca `INACTIVE` por inferência.

### Evidência dos gates e staging

A execução hospedada da branch `foundation/m0-supabase` passa por:

- `pnpm install --frozen-lockfile`;
- Prettier;
- check de toolchain;
- ESLint;
- TypeScript strict;
- Vitest;
- build;
- secret scan;
- dependency audit;
- deploy com Wrangler fixado;
- espera de propagação do Worker;
- `GET /health` → 200;
- `GET /ready` → 200;
- `GET /admin` → 200;
- `GET /admin/api/applications` sem token → 401.

O workflow permanece com `contents: read`. Secrets existem somente no GitHub Actions/Cloudflare runtime e não são persistidos no repositório.

### Banco e segurança do checkpoint

- migration `m1_control_plane_and_registry_rpcs` aplicada no projeto `cr-api`;
- funções administrativas e de lookup usam `security invoker`;
- execução revogada de `public`, `anon` e `authenticated`;
- execução concedida somente ao runtime privilegiado;
- RPCs `admin_create_application` e `lookup_registry_snapshot` confirmadas no banco;
- advisors de segurança permanecem apenas com INFO `RLS Enabled No Policy`, intencional no modelo deny-by-default;
- advisors de performance permanecem apenas com INFO de índices ainda não usados na base nova.

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
