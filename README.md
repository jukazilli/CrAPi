# CrAPi — Professional Registry

API privada e independente para normalizar e verificar registros de conselhos profissionais brasileiros.

## Arquitetura

- Cloudflare Workers: Data Plane e rotas administrativas.
- Supabase PostgreSQL: Registry Store, histórico, sync e auditoria.
- Database-first + Scheduled Sync + On-demand Refresh.
- API Keys próprias por aplicação/ambiente.
- Control Plane protegido separadamente.

## Estado

Fundação M0 em implementação.

- documentação canônica: pronta;
- contrato V1: criado;
- migration inicial Supabase: criada, ainda precisa ser aplicada ao projeto conectado;
- quality/security gates: em bootstrap;
- deploy staging: pendente.

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
