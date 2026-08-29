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
