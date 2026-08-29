# Professional Registry — Operação, Observabilidade, Custos e Runbook

Status: Canônico v0.2  
Data: 2026-08-29

## Objetivo operacional

Manter uma API pequena, previsível, auditável, segura e barata.

## Sinais principais

### API
- request count;
- 2xx/4xx/5xx;
- p50/p95;
- 401/403/429;
- request size.

### Verificação
- database-only responses;
- on-demand refreshes;
- freshness distribution;
- `FOUND`;
- `NOT_FOUND`;
- `INCONCLUSIVE`;
- `SOURCE_UNAVAILABLE`.

### Registry Store / Supabase
- crescimento de registros e histórico;
- queries lentas;
- erros Data API/Postgres;
- conexões/egress quando aplicável;
- storage e consumo frente ao plano;
- registros stale por provider.

### Sync
- runs por provider;
- processed/new/changed/unchanged/errors;
- duração;
- cursor age;
- last successful FULL/INCREMENTAL/KNOWN_RECORDS;
- falhas parciais.

### Providers
- success rate;
- latency;
- parser errors;
- schema changes;
- circuit state;
- last successful query.

### Segurança
- invalid keys;
- revoked key usage;
- quota exceeded;
- repeated failures;
- security events.

## Limites internos

Definir soft/hard limits inferiores às cotas contratadas. O produto nunca deve depender do erro do provedor para descobrir que atingiu sua cota.

Números exatos ficam em configuração operacional porque planos e limites podem mudar.

## Retenção

Recomendação inicial:
- request metadata: curta/média retenção;
- security/admin audit: retenção maior conforme finalidade;
- history profissional: preservar alterações relevantes com política definida;
- HTML bruto: desabilitado por padrão;
- sync_changes: retenção suficiente para troubleshooting, sem crescimento indefinido.

## Runbook — Provider indisponível

1. confirmar métricas;
2. verificar circuit breaker;
3. não marcar profissional como irregular;
4. preservar/servir snapshot permitido pela Freshness Policy;
5. usar `SOURCE_UNAVAILABLE` quando necessário;
6. investigar upstream;
7. atualizar fixture/parser se houve mudança;
8. validar staging;
9. promover.

## Runbook — Schema changed

1. parser detecta estrutura inesperada;
2. provider fica `DEGRADED`/`UNAVAILABLE`;
3. não usar parsing best-effort silencioso;
4. capturar amostra sanitizada;
5. corrigir parser;
6. executar contract tests;
7. staging;
8. produção.

## Runbook — Key leak

1. revogar API Key comprometida;
2. identificar requests por key ID;
3. gerar/rotacionar credencial;
4. atualizar consumidor;
5. revisar logs/redaction e origem;
6. registrar security event sem copiar o segredo.

Se a credencial afetada for Supabase, rotacionar no provedor e no secret store do Worker antes de retomar operação normal.

## Runbook — Cota próxima do limite

1. identificar maior consumidor e maior query/sync cost;
2. observar respostas database-only e refreshes;
3. reduzir quotas quando apropriado;
4. revisar índices e frequência de sync;
5. aumentar freshness apenas quando semanticamente aceitável;
6. bloquear uso não essencial antes da cota externa;
7. registrar decisão.

## Backup/export/restore

O beta deve possuir rotina documentada para exportar/restaurar dados necessários do Supabase/PostgreSQL e comprovar recuperação suficiente para o nível de criticidade.

Migration não substitui backup de dados operacionais.

## SLO inicial

Definir depois de medir staging. Providers externos influenciam refresh/sync e não devem receber SLO inventado antes de evidência.

## Health endpoints

Separar:
- liveness: Worker executa;
- readiness: banco/secrets essenciais configurados e dependências críticas aptas;
- provider health: estado de cada fonte.

Health público nunca expõe secrets, URL interna de banco, queries ou detalhes sensíveis.

## Runbook — Sync parcial/falhou

1. manter último snapshot válido;
2. marcar run `PARTIAL`/`FAILED`;
3. não remover registros ausentes;
4. não mudar status apenas por ausência;
5. retomar do checkpoint quando seguro;
6. seguir runbook de schema change se necessário;
7. atualizar freshness conforme política.

## Runbook — Registro stale em request

1. consultar snapshot Supabase;
2. avaliar Freshness Policy;
3. se refresh for obrigatório, executar/coalescer `ON_DEMAND`;
4. se upstream falhar, retornar resultado conservador e freshness explícita;
5. jamais inventar status mais recente.

## Runbook — Banco indisponível

1. readiness passa a não pronta;
2. não contornar usando upstream como fonte primária improvisada;
3. confirmar status Supabase/Data API;
4. preservar integridade e evitar writes duplicados;
5. restaurar conectividade;
6. validar migrations/schema e queries essenciais;
7. reabrir tráfego.
