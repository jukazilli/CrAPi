# Professional Registry — Arquitetura e Engenharia

Status: Canônico v0.3  
Data: 2026-08-30

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
User -> Supabase Auth -> HttpOnly session -> Worker
                                      |
                              admin_memberships
                                      |
                                  OWNER/ADMIN
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
- circuit breaker;
- sessão ou JWT administrativo.

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
- Authentication != Authorization: Supabase Auth identifica; `admin_memberships` autoriza.

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

Um JWT emitido pelo Supabase Auth para uma pessoa **não é** aceito como API Key do Data Plane.

## 6. Autenticação e autorização administrativa

Supabase Auth é a identidade humana primária do Control Plane.

Fluxo:

```text
criar conta/login
      |
      v
Supabase Auth
      |
      v
Worker valida sessão server-side
      |
      v
admin_memberships
      |
      +-- OWNER/ADMIN ACTIVE -> Control Plane
      +-- ausente/revogada -> 403
```

Regras:
- sessões usam cookies `__Host-*`, `HttpOnly`, `Secure` e `SameSite=Strict`;
- access token é validado contra Supabase Auth antes de confiar na identidade;
- refresh token é utilizado server-side para renovar sessão expirada;
- mutações auth/admin são same-origin;
- o browser não recebe `SUPABASE_SECRET_KEY`;
- `admin_memberships` é a fonte de autorização, não o fato de possuir conta;
- o primeiro OWNER é reivindicado uma única vez com sessão válida + `ADMIN_TOKEN` de bootstrap/break-glass;
- banco serializa o bootstrap por advisory transaction lock;
- após o bootstrap, o `ADMIN_TOKEN` não participa do login normal;
- API Key de aplicação nunca é aceita como sessão administrativa.

Cloudflare Access pode ser adicionado como perímetro/segunda barreira em produção, mas não é o mecanismo primário de login do produto.

## 7. Banco — Supabase PostgreSQL

Supabase é o banco exclusivo do CrAPi. A fundação usa Data API/PostgREST sobre HTTPS entre Worker e Supabase.

Regras:
- migrations em `supabase/migrations`;
- RLS habilitado em todas as tabelas operacionais/administrativas;
- sem grants/policies para `anon` e `authenticated` nas tabelas do CrAPi;
- credencial privilegiada somente no secret store do Worker;
- `SUPABASE_PUBLISHABLE_KEY` pode ser pública e é usada somente para Auth;
- índices em chaves de lookup e filtros operacionais;
- consultas parametrizadas/estruturadas;
- aplicações consumidoras não conhecem URL/chave privilegiada do banco.

Entidades centrais:

### admin_memberships
Liga `auth.users.id` aos papéis administrativos `OWNER`/`ADMIN` e ao status de autorização. Login sem membership não concede acesso.

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
- banco indisponível => fail closed/readiness degradada, sem fallback inseguro;
- Auth indisponível => novas autenticações/admin fail closed, sem bypass por token estático na UI.

## 13. Ambientes

- local;
- staging;
- production.

Cada ambiente possui:
- Worker próprio;
- configuração/credencial Supabase próprias ou isolamento aprovado;
- configuração de Auth Redirect URL própria;
- API Keys próprias;
- secrets;
- domínio;
- quotas.

Nunca reutilizar chave `live` em staging.

## 14. Deploy

Fluxo alvo:

`branch -> PR -> CI -> staging -> evidência -> main -> production`

Produção deve promover commit/artefato comprovado. Migration criada no Git não é considerada aplicada até validação no projeto correspondente.

Smoke de staging valida atualmente health/readiness, superfícies de login/cadastro/recuperação, redirect do `/admin` sem sessão e 401 da API administrativa sem sessão.

## 15. Scheduler

Cloudflare Cron Triggers (ou mecanismo equivalente aprovado por ADR) acionam partições de sync em horários distribuídos. Jobs não iniciam todos os UFs/providers simultaneamente. Frequência é configuração operacional, não constante de código.

## 16. Browser automation

Não faz parte do runtime principal do beta. Se um provider exigir browser legítimo, ele será isolado como adapter/serviço específico e não poderá implementar evasão de controles anti-bot.
