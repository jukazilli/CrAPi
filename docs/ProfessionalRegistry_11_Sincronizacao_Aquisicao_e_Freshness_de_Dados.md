# Professional Registry — Sincronização, Aquisição e Freshness de Dados

Status: Canônico v0.1  
Data: 2026-08-29

## 1. Decisão arquitetural

O Professional Registry usa **Database-first + Scheduled Synchronization + On-demand Refresh**.

As aplicações consumidoras consultam o banco próprio do Professional Registry. Elas não fazem scraping e, em condições normais, uma chamada de verificação não depende da disponibilidade instantânea do conselho.

## 2. Objetivos

- resposta rápida e previsível;
- menor dependência de portais externos;
- uso eficiente de cotas gratuitas;
- histórico/auditoria;
- descoberta de inclusões e mudanças quando a fonte permitir;
- atualização sob demanda de registros novos ou stale.

## 3. Estratégias por capacidade da fonte

### FULL
Usar somente quando existe listagem, paginação, dataset ou mecanismo adequado para percorrer a base.

### INCREMENTAL
Preferido quando existe cursor, data de atualização ou endpoint de alterações.

### KNOWN_RECORDS
Para fonte que só aceita busca individual, revalidar periodicamente registros já presentes.

### ON_DEMAND
Quando um consumidor consulta registro ausente/stale ou uma política exige confirmação recente.

Um provider pode combinar estratégias.

## 4. Frequência

Frequência é configurável por provider. A fundação aceita sincronização semanal como baseline de baixo custo, mas não a codifica como regra universal. Providers críticos ou fontes com alteração frequente podem usar intervalo menor após medição e revisão de cotas/termos.

## 5. Descoberta de novos registros

Se a fonte oferece FULL/INCREMENTAL, novos registros surgem no sync.

Se só existe busca individual, a base cresce por **progressive registry acquisition**: novos registros entram quando são consultados por um consumidor e passam a participar do refresh periódico de known records.

É proibido enumerar cegamente números de registro para tentar descobrir profissionais.

## 6. Modelo de dados

### professional_registry
Snapshot atual. Chave lógica: conselho + UF + número normalizado.

Campos essenciais:
- council;
- uf;
- registration_number;
- professional_name;
- registration_status;
- status_semantics;
- regional_council;
- category;
- source_provider;
- first_seen_at;
- last_seen_at;
- last_verified_at;
- source_hash;
- freshness_state.

### professional_registry_history
Mudanças relevantes observadas, com `changed_at`, before/after normalizado e sync/request correlation ID.

### sync_runs
- provider;
- mode;
- started_at/finished_at;
- status;
- processed/new/changed/unchanged/errors;
- cursor_before/cursor_after.

### sync_cursors
Checkpoint retomável por provider/partição.

## 7. Upsert e hash

Calcular hash de campos normalizados relevantes.

- novo registro -> INSERT + history NEW;
- hash igual -> atualizar apenas metadados necessários como `last_seen_at`, evitando writes supérfluos quando possível;
- hash diferente -> UPDATE + history CHANGE.

O objetivo é economizar writes no D1 e manter trilha de auditoria.

## 8. Ausência na fonte

Se um registro previamente conhecido não aparece em uma execução:

- não executar DELETE;
- não inferir INACTIVE/CANCELLED;
- preservar snapshot anterior;
- registrar observação/last_seen;
- aplicar regras específicas somente se a fonte documentar significado conclusivo.

## 9. Freshness Policy

Estados: `FRESH`, `AGING`, `STALE`, `UNKNOWN`.

A política decide se a API:
- retorna imediatamente;
- retorna e agenda refresh;
- tenta refresh antes de responder;
- retorna inconclusivo se não puder obter dado suficientemente recente.

Os thresholds são configuração operacional por provider, não constantes globais.

## 10. Request flow

```text
request autenticado
       |
lookup professional_registry
       |
       +-- FRESH -> responde
       |
       +-- AGING -> responde + agenda refresh (se política permitir)
       |
       +-- STALE -> on-demand refresh -> upsert -> responde
       |
       +-- MISS -> on-demand lookup -> se found, insere -> responde
```

Refreshes idênticos concorrentes devem usar single-flight/coalescing.

## 11. Scheduler

Jobs são distribuídos no tempo para não gerar rajadas contra fontes externas. Cada job deve possuir timeout, checkpoint e orçamento de trabalho.

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
- origem registrada;
- sem bypass de controles anti-bot;
- respeitar rate limits e termos aplicáveis;
- não expor detalhes internos de scraping aos consumidores.

## 14. Critérios de aceite da primeira implementação

- Registry Store criado;
- sync mock executável e auditável;
- cron de staging;
- hash/upsert/history testados;
- miss e stale acionam on-demand refresh;
- ausência não remove/inativa;
- UI mostra sync run e freshness;
- métricas de writes/reads disponíveis.
