# CrAPi — Professional Registry

API privada e independente para normalizar e verificar registros de conselhos profissionais brasileiros.

## Arquitetura

- Cloudflare Workers: Data Plane e rotas administrativas.
- Supabase PostgreSQL: Registry Store, histórico, sync e auditoria.
- Database-first + Scheduled Sync + On-demand Refresh.
- API Keys próprias por aplicação/ambiente.
- Control Plane protegido separadamente.

## Estado

Fundação M0/M1 em implementação.

- documentação canônica: pronta;
- contrato V1: criado;
- Supabase `cr-api`: conectado e saudável em `sa-east-1`;
- migrations fundacionais: aplicadas e alinhadas ao histórico remoto;
- 14 tabelas operacionais: criadas com RLS ativo;
- security/performance advisors: revisados; FKs sem índice corrigidas;
- quality/security gates: em fechamento;
- deploy staging do Worker: pendente.

## Banco

O banco é exclusivo do Professional Registry. Aplicações consumidoras não acessam o Supabase diretamente.

A fonte operacional é `professional_registry`; sincronizações e refreshes atualizam essa tabela e o histórico correspondente.

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
