# ADR-0003 — Supabase PostgreSQL como Registry Store

Status: Aceito  
Data: 2026-08-29  
Supersede: ADR-0001 apenas na decisão de banco

## Contexto

O Professional Registry precisa de banco independente, histórico de mudanças, queries indexadas, migrations, trilha de auditoria e crescimento para múltiplos conselhos. O projeto Supabase foi escolhido/configurado como a infraestrutura de banco.

## Decisão

Adotar:

- Cloudflare Workers como Data Plane e rotas administrativas;
- Supabase PostgreSQL como banco próprio do Professional Registry;
- Data API/PostgREST sobre HTTPS como caminho inicial Worker -> banco;
- credencial privilegiada do Supabase somente no secret store do Worker;
- RLS habilitado em todas as tabelas operacionais;
- `anon` e `authenticated` sem grants nas tabelas do Registry;
- migrations versionadas em `supabase/migrations`;
- Supabase Auth não é requisito do beta; o Control Plane continua protegido por Cloudflare Access.

## Consequências positivas

- PostgreSQL completo para histórico e auditoria;
- migrations e tooling consolidados;
- índices/constraints ricos;
- possibilidade futura de jobs/cron/funções quando apropriado;
- separação total dos bancos de Daygym e Stude.ai.

## Riscos e controles

### Credencial privilegiada

Uma `sb_secret_*`/service-role comprometida possui alto impacto.

Controles:
- nunca expor no navegador/mobile;
- secret store por ambiente;
- rotação;
- logs redigidos;
- scanner de segredos.

### Data API exposta

O endpoint HTTP do Supabase é alcançável publicamente.

Controles:
- RLS em todas as tabelas;
- nenhum grant/policy permissivo para `anon`/`authenticated`;
- acesso normal somente pelo Worker autenticado.

### Free tier

A política continua free-first:
- Database-first reduz chamadas externas;
- índices evitam scans;
- history é escrita somente quando `source_hash` muda;
- sync é particionado;
- retenção de logs é limitada;
- alertas internos devem ocorrer antes dos limites do provedor.

## Não decisão

Esta ADR não aprova acesso direto ao PostgreSQL por aplicações consumidoras nem substitui as API Keys próprias do Professional Registry.
