# Professional Registry — Sincronização, Aquisição e Freshness de Dados

Status: Canônico v0.2  
Data: 2026-08-29

## 1. Decisão arquitetural

O CrAPi usa **Database-first + Scheduled Synchronization + On-demand Refresh**.

Aplicações consumidoras consultam o Registry Store no Supabase PostgreSQL por meio da Registry API. Elas não fazem scraping nem acessam o Supabase diretamente.

## 2. Objetivos

- resposta rápida e previsível;
- menor dependência de portais externos;
- uso eficiente do free tier;
- histórico/auditoria;
- descoberta de inclusões e mudanças quando a fonte permitir;
- atualização sob demanda de registros novos/stale.

## 3. Estratégias por capacidade da fonte

### FULL
Somente quando existe listagem, paginação, dataset ou mecanismo apropriado para percorrer a base.

### INCREMENTAL
Preferido quando existe cursor, data de atualização ou endpoint de alterações.

### KNOWN_RECORDS
Para fonte que aceita apenas busca individual: revalidar periodicamente registros já presentes.

### ON_DEMAND
Quando um consumidor consulta registro ausente/stale ou uma política exige confirmação recente.

Um provider pode combinar estratégias.

## 4. Frequência

Frequência é configurável por provider. A fundação aceita sincronização semanal como baseline de baixo custo, mas não a codifica como regra universal. Intervalos menores só entram após medir criticidade, custo, capacidade e regras da fonte.

## 5. Descoberta de novos registros

Se a fonte oferece FULL/INCREMENTAL, novos registros surgem pelo sync.

Se só existe busca individual, a base cresce por **progressive registry acquisition**: um registro é adquirido sob demanda quando consultado e passa a integrar o refresh periódico de known records.

É proibido enumerar cegamente números de registro para tentar descobrir profissionais.

## 6. Modelo de dados

### professional_registry
Snapshot atual. Chave lógica:

`council + uf + normalized_registration`

Campos essenciais:
- council;
- uf;
- registration_number;
- normalized_registration;
- professional_name;
- registration_status;
- status_semantics;
- regional_council;
- category;
- provider_id;
- first_seen_at;
- last_seen_at;
- last_verified_at;
- source_hash;
- freshness_state;
- acquisition_mode.

### professional_registry_history
Alterações relevantes observadas, com before/after normalizado, provider e correlação quando aplicável.

### sync_runs
- provider;
- partition;
- mode;
- started/finished;
- status;
- processed/new/changed/unchanged/errors.

### sync_cursors
Checkpoint retomável por provider/partição.

### sync_changes
Evidência resumida por execução para troubleshooting/auditoria operacional.

## 7. Upsert e hash

Calcular `source_hash` de campos normalizados relevantes.

- novo registro -> INSERT + history `CREATED`;
- hash igual -> não regravar snapshot de negócio; atualizar apenas metadados de observação necessários;
- hash diferente -> UPDATE + history correspondente.

O objetivo é reduzir writes no PostgreSQL e preservar histórico confiável.

## 8. Ausência na fonte

Se um registro previamente conhecido não aparece em uma execução:

- não executar DELETE;
- não inferir INACTIVE/CANCELLED;
- preservar snapshot anterior;
- não atualizar `last_seen_at` como se tivesse sido observado;
- aplicar regra de status somente quando a fonte documentar significado conclusivo.

## 9. Freshness Policy

Estados:
- `FRESH`;
- `AGING`;
- `STALE`;
- `UNKNOWN`.

A política decide se a API:
- retorna imediatamente;
- retorna e agenda refresh;
- tenta refresh antes de responder;
- retorna inconclusivo quando não consegue obter dado recente o suficiente.

Thresholds são configuração por provider, não constantes globais.

## 10. Request flow

```text
request autenticado
       |
lookup professional_registry no Supabase
       |
       +-- FRESH -> responde
       |
       +-- AGING -> responde + agenda refresh se permitido
       |
       +-- STALE -> ON_DEMAND -> upsert -> responde
       |
       +-- MISS -> ON_DEMAND -> found? insere -> responde
```

Refreshes idênticos concorrentes devem usar single-flight/coalescing.

## 11. Scheduler

Jobs são distribuídos no tempo para evitar rajadas. Cada job possui:
- orçamento de trabalho;
- timeout;
- checkpoint;
- provider/partição;
- métricas de execução.

Cloudflare Cron Triggers são o mecanismo inicial planejado, podendo ser substituídos por ADR caso a operação futura justifique outro scheduler.

## 12. Interface administrativa

### Registries
- registros conhecidos;
- filtros;
- freshness;
- last_seen/last_verified;
- histórico.

### Sync
- última execução;
- próximos schedules;
- modo;
- processed/new/changed/unchanged/errors;
- duração;
- cursor;
- status.

## 13. Segurança e conformidade

- somente dados necessários;
- HTML bruto desabilitado por padrão;
- origem/provider registrados;
- sem bypass anti-bot;
- respeitar rate limits e regras aplicáveis;
- não expor detalhes internos de scraping aos consumidores;
- sync escreve no Supabase somente por runtime privilegiado controlado.

## 14. Critérios de aceite da primeira implementação

- Registry Store Supabase criado por migration;
- RLS/grants revisados;
- sync mock executável e auditável;
- scheduler de staging;
- hash/upsert/history testados;
- miss/stale acionam refresh sob demanda;
- ausência não remove/inativa;
- UI mostra sync run/freshness;
- consumo do banco é observável.
