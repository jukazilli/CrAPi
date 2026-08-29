# Professional Registry — Operação, Observabilidade, Custos e Runbook

Status: Draft v0.1

## Objetivo operacional

Manter uma API pequena, previsível, auditável e barata.

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
- FOUND;
- NOT_FOUND;
- INCONCLUSIVE;
- SOURCE_UNAVAILABLE;
- cache hit ratio.

### Sync
- sync runs por provider;
- processed/new/changed/unchanged/errors;
- duração;
- cursor age;
- registros stale;
- last successful full/incremental/known-record sync.

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
- suspicious repeated failures.

## Limites internos

Definir soft/hard limits inferiores às cotas contratadas.

Exemplo conceitual:
- soft limit: alertar;
- hard limit: degradar/bloquear uso não essencial;
- nunca depender do erro do provedor para descobrir que a cota acabou.

Os números exatos devem ficar em configuração operacional porque limites de planos podem mudar.

## Retenção

Recomendação inicial:
- request metadata: curta/média retenção;
- security audit: maior retenção;
- cache: apenas TTL;
- HTML bruto: desabilitado por padrão.

## Runbook — Provider indisponível

1. confirmar métricas;
2. verificar se circuit abriu;
3. não marcar profissionais como irregulares;
4. servir cache válido se política permitir;
5. retornar `SOURCE_UNAVAILABLE`;
6. investigar mudança upstream;
7. atualizar fixture/parser;
8. validar staging;
9. promover.

## Runbook — Schema changed

1. parser detecta cabeçalho/estrutura inesperada;
2. provider é marcado `DEGRADED` ou `UNAVAILABLE`;
3. nenhum parsing “best effort” silencioso;
4. capturar amostra sanitizada;
5. corrigir parser;
6. contract tests;
7. staging;
8. produção.

## Runbook — Key leak

Consultar documento de segurança e executar revogação imediata.

## Runbook — Cota próxima do limite

1. identificar maior consumidor;
2. observar cache hit;
3. reduzir quota quando apropriado;
4. aumentar TTL somente se semântica permitir;
5. bloquear uso não essencial antes da cota externa;
6. registrar decisão.

## Backup/export

O beta deve possuir rotina documentada para exportar dados necessários do D1 e comprovar restauração/recuperação suficiente para o nível de criticidade.

## SLO inicial

Definir após dados de staging. Não inventar SLO antes de medir providers externos.

## Health endpoints

Separar:
- liveness: processo está executando;
- readiness: dependências essenciais estão aptas;
- provider health: estado de cada fonte.

Health público nunca expõe secrets, banco ou detalhes internos sensíveis.

## Runbook — Sync parcial/falhou

1. manter último snapshot válido;
2. marcar execução `PARTIAL`/`FAILED`;
3. não remover registros ausentes;
4. não alterar status apenas por ausência;
5. retomar do último checkpoint quando seguro;
6. se schema mudou, seguir runbook de schema change;
7. atualizar freshness conforme política.

## Runbook — Registro stale em request

1. consultar snapshot;
2. avaliar Freshness Policy;
3. se refresh obrigatório, executar/coalescer `ON_DEMAND`;
4. se upstream falhar, retornar resultado conservador com `SOURCE_UNAVAILABLE`/freshness explícita conforme contrato;
5. jamais inventar status mais recente.
