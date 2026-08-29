# Professional Registry — Arquitetura e Engenharia

Status: Canônico v0.2  
Data: 2026-08-29

## 1. Arquitetura lógica

A arquitetura oficial é **Database-first + Scheduled Synchronization + On-demand Refresh**.

```text
                    OFFICIAL SOURCES
             CONFEF / CREF / CFM / ...
                        |
                  Sync Scheduler
                        |
                        v
                   Sync Engine
              fetch/parse/normalize
                 compare source_hash
                        |
                        v
             Supabase PostgreSQL
          current + history + sync/audit
                        ^
                        |
        on-demand refresh when required
                        |
                 Cloudflare Worker API
                      /       \
                 Daygym     Stude.ai

                       CONTROL PLANE
Admin -> Cloudflare Access -> Console SPA -> Admin Routes
                                      |
                                      v
                              Registry / Sync / Keys
```

A chamada normal do cliente **não chama o conselho externo**. Ela consulta `professional_registry` no Supabase e aplica a Freshness Policy. Apenas miss/stale/critical verification podem provocar refresh externo controlado.

## 2. Fronteiras

Aplicações clientes conhecem apenas o contrato HTTP do CrAPi.

Elas não conhecem:
- Supabase/PostgreSQL;
- credenciais do banco;
- provider concreto;
- scraper/parser;
- credenciais upstream;
- circuit breaker.

Nenhum consumidor acessa o Supabase diretamente.

## 3. Organização proposta

```text
/
  AGENTS.md
  README.md
  apps/
    worker/
    console/
  packages/
    contracts/
    domain/
    application/
    providers/
    security/
    ui/
  supabase/
    migrations/
  tooling/
  tests/
    fixtures/
  docs/
```

## 4. Padrões

- Strategy: providers.
- Factory/Registry: seleção por council/UF.
- Chain of Responsibility: fonte nacional -> regional fallback quando aprovado.
- Circuit Breaker: upstream.
- Database-first/Freshness Policy: consulta operacional.
- Single Flight: refreshes idênticos concorrentes.
- Repository: persistência Supabase/PostgreSQL.
- Ports and Adapters: transporte e fonte não invadem o domínio.

## 5. Autenticação de aplicações

V1:

`Authorization: Bearer <api-key>`

API Keys próprias do CrAPi:
- alta entropia;
- prefixo `prk_test_` / `prk_live_`;
- secret mostrado uma vez;
- digest HMAC-SHA256 com pepper server-side;
- `last4`;
- scopes;
- status e expiração;
- aplicação e limite.

A API Key do CrAPi nunca é uma credencial Supabase. Não usar key privilegiada em browser/mobile distribuído; o backend consumidor chama a Registry API.

## 6. Autenticação administrativa

Cloudflare Access é a barreira inicial do Control Plane.

O Control Plane nunca aceita API Key de aplicação como sessão administrativa. A UI não recebe `SUPABASE_SECRET_KEY` nem conecta diretamente ao banco.

## 7. Banco — Supabase PostgreSQL

Supabase é o banco exclusivo do CrAPi. A fundação usa Data API/PostgREST sobre HTTPS entre Worker e Supabase.

Regras:
- migrations em `supabase/migrations`;
- RLS habilitado em todas as tabelas operacionais;
- sem grants/policies para `anon` e `authenticated` na fundação;
- credencial privilegiada somente no secret store do Worker;
- índices em chaves de lookup e filtros operacionais;
- consultas parametrizadas/estruturadas;
- aplicações consumidoras não conhecem URL/chave do banco.

Entidades centrais:

### applications
Identidade de consumidor.

### api_keys / api_key_scopes
Metadados, digest e permissões; nunca segredo em claro.

### api_requests
Metadados sanitizados de consumo.

### professional_registry
Snapshot operacional atual por conselho/UF/registro.

Campos centrais: `first_seen_at`, `last_seen_at`, `last_verified_at`, `source_hash`, `freshness_state`.

### professional_registry_history
Histórico append-only de alterações relevantes observadas.

### sync_runs / sync_cursors / sync_changes
Execuções, checkpoints e alterações de sincronização.

### professional_verifications
Evidência das verificações solicitadas pelas aplicações.

### providers / provider_health
Configuração e estado das fontes.

### security_events / admin_audit_log
Eventos de segurança e mudanças administrativas.

## 8. Freshness e fonte operacional

A fonte operacional é `professional_registry`.

Estados:
- `FRESH`;
- `AGING`;
- `STALE`;
- `UNKNOWN`.

Chave lógica de lookup:

`council + uf + normalized_registration`

A política é configurável por provider. Registro fresh retorna do banco; aging pode retornar e agendar refresh; stale pode exigir refresh antes da conclusão. Freshness nunca transforma `UNKNOWN` em estado profissional mais conclusivo.

## 9. Sync Engine

Modos por provider:
- `FULL`;
- `INCREMENTAL`;
- `KNOWN_RECORDS`;
- `ON_DEMAND`.

Nunca enumerar números de registro por força bruta para simular full sync.

Fluxo:
1. abrir `sync_run`;
2. carregar cursor/checkpoint;
3. coletar lote;
4. validar e normalizar;
5. calcular `source_hash`;
6. inserir novo ou atualizar alterado;
7. atualizar metadados de observação;
8. registrar history quando necessário;
9. avançar cursor;
10. finalizar métricas/status.

Ausência em uma execução não executa DELETE nem muda automaticamente status profissional.

## 10. Provider interface

```ts
interface CouncilProvider {
  supports(query: RegistryQuery): boolean;
  lookup(query: RegistryQuery): Promise<RegistryResult>;
}
```

A evolução do contrato deverá também declarar capacidades de sync, sem acoplar domínio ao transporte HTTP/browser.

## 11. Result contract

Query result:
- `FOUND`;
- `NOT_FOUND`;
- `INCONCLUSIVE`;
- `SOURCE_UNAVAILABLE`.

Status profissional é eixo separado e pode ser `UNKNOWN`.

## 12. Resiliência

- timeout upstream;
- retry limitado para falhas seguras;
- exponential backoff;
- circuit breaker;
- single-flight;
- response size limit;
- parser failure isolada;
- último snapshot válido preservado;
- banco indisponível => fail closed/readiness degradada, sem fallback inseguro.

## 13. Ambientes

- local;
- staging;
- production.

Cada ambiente possui:
- Worker próprio;
- configuração/credencial Supabase próprias ou isolamento aprovado;
- API Keys próprias;
- secrets;
- domínio;
- quotas.

Nunca reutilizar chave `live` em staging.

## 14. Deploy

Fluxo alvo:

`branch -> PR -> CI -> staging -> evidência -> main -> production`

Produção deve promover commit/artefato comprovado. Migration criada no Git não é considerada aplicada até validação no projeto correspondente.

## 15. Scheduler

Cloudflare Cron Triggers (ou mecanismo equivalente aprovado por ADR) acionam partições de sync em horários distribuídos. Jobs não iniciam todos os UFs/providers simultaneamente. Frequência é configuração operacional, não constante de código.

## 16. Browser automation

Não faz parte do runtime principal do beta. Se um provider exigir browser legítimo, ele será isolado como adapter/serviço específico e não poderá implementar evasão de controles anti-bot.
