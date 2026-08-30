# CrAPi — Professional Registry

API privada e independente para normalizar e verificar registros de conselhos profissionais brasileiros.

## Arquitetura

- Cloudflare Workers: Data Plane e rotas administrativas.
- Supabase PostgreSQL: Registry Store, histórico, sync e auditoria.
- Database-first + Scheduled Sync + On-demand Refresh.
- API Keys próprias por aplicação/ambiente.
- Control Plane protegido separadamente.

## Estado

Primeiro checkpoint operacional publicado e navegável em staging.

- documentação canônica: pronta;
- contrato V1: criado;
- Supabase `cr-api`: conectado e saudável em `sa-east-1`;
- migrations fundacionais e M1: aplicadas e alinhadas ao histórico remoto;
- 14 tabelas operacionais: criadas com RLS ativo;
- security/performance advisors: revisados;
- quality/security gates: verdes;
- Control Plane mínimo: implementado em `/admin`;
- Applications + API Keys: criar, listar, rotacionar e revogar;
- chave raw: exibida somente na criação/rotação e nunca persistida;
- endpoint protegido `POST /v1/professional-registrations/verify`: implementado;
- quota diária e auditoria de requests: implementadas;
- miss no Registry Store: retorna `INCONCLUSIVE`, nunca falso `INACTIVE`;
- deploy de staging: automatizado via GitHub Actions após quality/security gates;
- credenciais de deploy e runtime: gerenciadas exclusivamente por GitHub Actions Secrets e Cloudflare;
- staging: `https://crapi-staging.soberania-24b.workers.dev`.

## Evidência hospedada

O pipeline de staging publica com Wrangler fixado e aguarda a propagação antes dos smoke tests. Evidência do checkpoint:

- `GET /health` → HTTP 200;
- `GET /ready` → HTTP 200;
- `GET /admin` → HTTP 200;
- `GET /admin/api/applications` sem token → HTTP 401;
- quality/security gates → sucesso;
- Supabase operacional com RPCs administrativas e Registry Store disponíveis.

## Checkpoint navegável

Fluxo mínimo de validação manual:

1. abrir `https://crapi-staging.soberania-24b.workers.dev/admin`;
2. informar o `ADMIN_TOKEN` de staging;
3. criar uma Application;
4. gerar uma API Key `TEST`;
5. copiar a chave exibida uma única vez;
6. chamar `POST /v1/professional-registrations/verify` com `Authorization: Bearer <api-key>`;
7. rotacionar ou revogar a chave pelo Control Plane.

O Control Plane não recebe nem expõe a chave privilegiada do Supabase. Todo acesso ao banco ocorre no runtime server-side.

## Runtime

Configuração não sensível:

- `APP_ENV=staging` — versionado no `wrangler.jsonc`;
- `SUPABASE_URL` — URL pública do projeto Supabase.

Segredos que devem existir somente no secret store do runtime:

- `SUPABASE_SECRET_KEY` — chave `sb_secret_*` server-side do Supabase;
- `API_KEY_PEPPER` — segredo aleatório com pelo menos 32 bytes;
- `ADMIN_TOKEN` — token separado do Control Plane com pelo menos 32 bytes.

Segredos usados somente pelo pipeline de deploy:

- `CLOUDFLARE_API_TOKEN`;
- `CLOUDFLARE_ACCOUNT_ID`.

Nunca commitar ou enviar esses segredos em chat, URL, código cliente ou documentação.

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
