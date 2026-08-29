# CrAPi — Professional Registry

API privada e independente para normalizar e verificar registros de conselhos profissionais brasileiros.

## Arquitetura

- Cloudflare Workers: Data Plane e rotas administrativas.
- Supabase PostgreSQL: Registry Store, histórico, sync e auditoria.
- Database-first + Scheduled Sync + On-demand Refresh.
- API Keys próprias por aplicação/ambiente.
- Control Plane protegido separadamente.

## Estado

Primeiro checkpoint operacional implementado; publicação de staging pendente.

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
- `apps/worker/wrangler.jsonc`: pronto para staging Cloudflare;
- deploy staging do Worker: pendente de credenciais/configuração do provedor.

## Checkpoint navegável

Quando o Worker estiver hospedado, o fluxo mínimo será:

1. abrir `/admin`;
2. informar o `ADMIN_TOKEN` de staging;
3. criar uma Application;
4. gerar uma API Key `TEST`;
5. copiar a chave exibida uma única vez;
6. chamar `POST /v1/professional-registrations/verify` com `Authorization: Bearer <api-key>`;
7. rotacionar ou revogar a chave pelo Control Plane.

O Control Plane não recebe nem expõe a chave privilegiada do Supabase. Todo acesso ao banco ocorre no runtime server-side.

## Runtime

Variáveis não sensíveis podem ficar no config do Worker. Segredos devem existir somente no secret store do runtime:

- `SUPABASE_URL` — URL do projeto;
- `SUPABASE_SECRET_KEY` — chave server-side do Supabase;
- `API_KEY_PEPPER` — segredo aleatório com pelo menos 32 bytes;
- `ADMIN_TOKEN` — token separado do Control Plane com pelo menos 32 bytes.

Nunca commitar esses segredos no repositório.

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
