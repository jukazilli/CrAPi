# Professional Registry — Arquitetura e Engenharia

Status: Draft v0.1

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
                  Registry Store (D1)
              current + history + sync
                        ^
                        |
        on-demand refresh when required
                        |
                       API
                      /   \
                 Daygym   Stude.ai

                       CONTROL PLANE
Admin -> Cloudflare Access -> Console SPA -> Admin Routes
                                      |
                                      v
                              Registry / Sync / Keys
```

A chamada normal do cliente **não chama o conselho externo**. Ela consulta o `professional_registry` e aplica a Freshness Policy. Apenas miss/stale/critical verification podem provocar refresh externo controlado.

## 2. Regra de fronteira

Aplicações clientes conhecem apenas o contrato HTTP.

Elas não conhecem:
- D1;
- provider concreto;
- scraper;
- parser;
- credenciais upstream;
- circuit breaker.

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
  infra/
    d1/
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
- Cache Aside: verificações.
- Single Flight: consultas idênticas concorrentes.
- Repository: persistência D1.
- Ports and Adapters: transporte/fonte não invade domínio.

## 5. Autenticação de aplicações

V1:

`Authorization: Bearer <api-key>`

API Keys:
- alta entropia;
- prefixo `prk_test_` / `prk_live_`;
- secret mostrado uma vez;
- digest com pepper server-side;
- `last4`;
- scopes;
- status;
- expiração;
- aplicação;
- limite.

Não usar API Key no browser/mobile distribuído. O backend do produto consumidor chama a Registry API.

## 6. Autenticação administrativa

Cloudflare Access na fundação.

O Control Plane nunca aceita API Key de aplicação como sessão administrativa.

## 7. Banco

Entidades:

### applications
Identidade de consumidor.

### api_keys
Metadados + digest; nunca segredo em claro.

### api_key_scopes
Permissões.

### api_requests
Metadados sanitizados.

### professional_registry
Snapshot operacional atual por conselho/UF/registro.

Campos centrais: `first_seen_at`, `last_seen_at`, `last_verified_at`, `source_hash`, `freshness_state`.

### professional_registry_history
Histórico imutável de alterações relevantes observadas.

### sync_runs
Execuções de sincronização, modo, métricas e estado.

### sync_cursors
Checkpoint por provider/partição para retomada.

### sync_changes
Resumo/auditoria de novos e alterados por execução.

### professional_verifications
Evidência das verificações solicitadas pelas aplicações.

### verification_cache
Opcional para resultados derivados/refresh locks; não substitui a tabela canônica de registry.

### providers
Configuração lógica.

### provider_health
Estado operacional.

### security_events
Eventos relevantes.

### admin_audit_log
Mudanças administrativas.

## 8. Freshness, cache e fonte operacional

A fonte operacional é `professional_registry`.

Estados de freshness sugeridos:
- `FRESH`;
- `AGING`;
- `STALE`;
- `UNKNOWN`.

A política é configurável por provider e tipo de status. Exemplo conceitual: registro recente retorna imediatamente; registro envelhecendo pode retornar e agendar refresh; registro stale tenta refresh antes de concluir quando a operação exigir.

Chave de lookup conceitual:

`council:uf:normalized_registration`

TTL depende do resultado e da semântica.

Cache jamais transforma `UNKNOWN` em resultado mais conclusivo.

## 9. Sync Engine

Modos suportados por provider:
- `FULL`: fonte permite enumerar/listar toda a base de forma apropriada;
- `INCREMENTAL`: fonte permite obter alterações desde cursor/data;
- `KNOWN_RECORDS`: atualiza somente registros já conhecidos;
- `ON_DEMAND`: consulta um registro específico solicitado.

Nunca enumerar números de registro por força bruta para simular full sync.

O Sync Engine:
1. abre `sync_run`;
2. carrega cursor/checkpoint;
3. coleta lotes;
4. normaliza;
5. calcula `source_hash`;
6. grava apenas novos/alterados;
7. atualiza `last_seen_at`;
8. registra history para mudança relevante;
9. avança cursor;
10. finaliza métricas/status.

Ausência em uma execução não executa DELETE nem muda automaticamente status profissional.

## 10. Provider interface

```ts
interface CouncilProvider {
  supports(query: RegistryQuery): boolean;
  lookup(query: RegistryQuery): Promise<RegistryResult>;
}
```

Provider é responsável apenas por integração e normalização da fonte.

## 11. Result contract

`FOUND`, `NOT_FOUND`, `INCONCLUSIVE`, `SOURCE_UNAVAILABLE`.

Status é um eixo separado.

## 12. Resiliência

- timeout upstream;
- retry limitado apenas para falhas seguras;
- exponential backoff;
- circuit breaker;
- single flight;
- cache;
- response size limit;
- parser failure isolada.

## 13. Ambientes

- local;
- staging;
- production.

Cada ambiente possui:
- Worker/D1;
- secrets;
- chaves;
- domínio;
- quotas.

Nunca reutilizar chave `live` em staging.

## 14. Deploy

Fluxo alvo:

`branch -> PR -> CI -> staging -> evidência -> main -> production`

Produção deve usar artefato/commit comprovado.

## 15. Scheduler

Cloudflare Cron Triggers (ou mecanismo equivalente aprovado por ADR) acionam partições de sync em horários distribuídos. Jobs não devem iniciar todos os UFs/providers simultaneamente. Frequência é configuração operacional, não constante de código.

## 16. Browser automation

Não faz parte do runtime principal do beta.

Caso um provider futuramente exija browser legítimo, ele será isolado como adapter/serviço específico para não impor Chromium a todas as verificações.
