# Professional Registry — Briefing de Produto e Escopo do Beta

Status: Canônico v0.3  
Data: 2026-08-29

## 1. Resumo executivo

**Professional Registry (CrAPi)** é uma plataforma interna e independente para verificação de registros profissionais em conselhos regulamentados brasileiros.

O produto oferece duas superfícies:

- **Data Plane:** API privada consumida exclusivamente por aplicações autorizadas.
- **Control Plane:** console administrativo para Applications, API Keys, consumo, registros sincronizados, requests, providers, sincronizações e eventos de segurança.

Daygym e Stude.ai serão os primeiros consumidores, mas o CrAPi não depende de código, banco, autenticação ou infraestrutura desses sistemas.

## 2. Problema a resolver

Cada conselho disponibiliza informações de maneira diferente. Fazer cada aplicação implementar seu próprio scraper criaria duplicação, contratos incompatíveis, maior superfície de ataque, ausência de auditoria central e manutenção multiplicada.

O CrAPi transforma fontes oficiais heterogêneas em um contrato único, versionado, auditável e conservador.

## 3. Objetivo do produto

Entregar uma API capaz de responder:

- qual conselho e registro foram consultados;
- se existe correspondência conhecida;
- qual status foi explicitamente informado, quando disponível;
- qual fonte/provider originou o dado;
- quando o registro foi visto/verificado pela última vez;
- qual a freshness do snapshot;
- quão conclusiva é a verificação.

## 4. Modelo operacional — Database-first

A aplicação **não depende de consulta ao vivo ao conselho em cada request**. O banco próprio do CrAPi é a fonte operacional primária.

```text
CONFEF / CREF / CFM / demais fontes
              |
       Scheduled Sync Engine
              |
       fetch + parse + normalize
              |
              v
      Supabase PostgreSQL
       Registry Store próprio
              |
              v
         Registry API
          /        \
      Daygym      Stude.ai
```

O sistema combina quatro estratégias por provider:

1. **FULL** — quando a fonte oferece listagem, paginação, dataset ou mecanismo apropriado.
2. **INCREMENTAL** — inclusões/alterações desde cursor/data quando a fonte oferece isso.
3. **KNOWN_RECORDS** — revalida registros já conhecidos quando a fonte só permite busca individual.
4. **ON_DEMAND** — consulta registro específico quando ausente, stale ou quando a operação exige confirmação recente.

A frequência é configurável por provider. A fundação aceita **sincronização semanal como baseline de baixo custo**, mas não a transforma em regra universal.

> Daygym, Stude.ai e futuros consumidores consultam a Registry API. Scraping, sincronização, normalização e acesso ao banco pertencem exclusivamente ao CrAPi.

## 5. Infraestrutura da fundação

- **Cloudflare Workers** para Data Plane e rotas administrativas.
- **Supabase PostgreSQL** como Registry Store, histórico, sync e auditoria.
- **Supabase Data API/PostgREST sobre HTTPS** como caminho inicial Worker -> banco.
- **Static Assets/SPA** para o console.
- **Cloudflare Access** como autenticação administrativa inicial.
- **GitHub** para versionamento, PRs e CI/CD.
- secrets somente nos secret stores dos provedores.

O Supabase é infraestrutura **exclusiva do CrAPi**. Nenhum consumidor recebe acesso direto ao banco.

### 5.1 Credenciais Supabase

- `SUPABASE_URL` é configuração de ambiente.
- `SUPABASE_SECRET_KEY` é segredo exclusivo de runtime server-side.
- A credencial privilegiada do Supabase nunca é entregue a Daygym, Stude.ai, browser ou mobile.
- Consumidores recebem somente API Keys do CrAPi (`prk_test_*` / `prk_live_*`).
- Tabelas operacionais têm RLS habilitado e não possuem acesso `anon`/`authenticated` na fundação.

## 6. Contrato conceitual

### Entrada

```json
{
  "council": "CREF",
  "uf": "SP",
  "registration_number": "123456"
}
```

### Saída

```json
{
  "verification": {
    "result": "FOUND",
    "professional_name": "NOME DO PROFISSIONAL",
    "registration_number": "123456",
    "registration_status": "ACTIVE",
    "status_semantics": "EXPLICIT",
    "council": "CREF",
    "regional_council": "CREF4/SP",
    "uf": "SP"
  },
  "source": {
    "authority": "CONFEF",
    "provider": "confef-national",
    "live": false,
    "registry_store": true
  },
  "data": {
    "last_seen_at": "ISO-8601",
    "last_verified_at": "ISO-8601",
    "freshness": "FRESH",
    "acquisition_mode": "SCHEDULED"
  },
  "confidence": "HIGH",
  "queried_at": "ISO-8601"
}
```

Uma verificação sob demanda pode retornar `source.live: true` e atualizar o Registry Store antes da resposta.

## 7. Estados obrigatórios

### Query result
- `FOUND`
- `NOT_FOUND`
- `INCONCLUSIVE`
- `SOURCE_UNAVAILABLE`

### Registration status
- `ACTIVE`
- `INACTIVE`
- `SUSPENDED`
- `CANCELLED`
- `UNKNOWN`

### Status semantics
- `EXPLICIT`
- `INFERRED`
- `UNKNOWN`

### Freshness
- `FRESH`
- `AGING`
- `STALE`
- `UNKNOWN`

Ausência de resultado ou ausência em uma sincronização **não prova inatividade**.

## 8. Usuários e atores

### Operador/administrador
Administra aplicações, chaves, registries, syncs, providers, limites, segurança e investigação.

### Desenvolvedor integrador
Recebe uma chave do CrAPi e integra o backend da aplicação cliente.

### Aplicação cliente
Backend do Daygym, Stude.ai ou sistema futuro autorizado.

### Profissional verificado
É objeto da consulta, mas não utiliza diretamente o console no beta.

## 9. Escopo do beta

### API
- `POST /v1/professional-registrations/verify`;
- health/readiness sem dados sensíveis;
- autenticação por API Key própria;
- scopes e quotas;
- lookup database-first;
- Freshness Policy e on-demand refresh;
- single-flight/coalescing;
- request IDs e erros versionados.

### Registry Store
- snapshot canônico;
- histórico de alterações;
- `first_seen_at`, `last_seen_at`, `last_verified_at`;
- `source_hash` para detectar mudanças;
- freshness explícita;
- nunca excluir/inativar por mera ausência em sync.

### CREF
- provider CREF;
- adapter mock durante fundação;
- discovery do CONFEF/CREF;
- adapter HTTP após discovery;
- FULL/INCREMENTAL apenas quando a fonte permitir;
- KNOWN_RECORDS/ON_DEMAND quando necessário;
- parser determinístico, fixtures e schema-change detector.

### Sync Engine
- scheduler configurável;
- `sync_runs` e `sync_cursors`;
- FULL, INCREMENTAL, KNOWN_RECORDS e ON_DEMAND;
- métricas `processed/new/changed/unchanged/errors`;
- retomada segura e jobs distribuídos no tempo.

### Console administrativo
- Overview;
- Applications;
- API Keys;
- Requests;
- Registries;
- Providers;
- Sync;
- Security;
- Settings operacional mínima.

### API Keys
- geração criptograficamente segura;
- exibição somente uma vez;
- digest no banco, nunca segredo em claro;
- revogação, rotação, TEST/LIVE, scopes, limites e último uso.

### Observabilidade
- request count e success/error rate;
- respostas database-only;
- on-demand refreshes;
- freshness distribution;
- sync runs;
- provider health;
- 401/403/429 e security events;
- consumo frente aos limites internos e ao plano do provedor.

## 10. Fora do beta

- billing e clientes externos self-service;
- CRM real;
- consulta em lote em larga escala;
- API pública sem aprovação;
- keys do CrAPi em browser/mobile;
- acesso direto de consumidor ao Supabase;
- bypass de CAPTCHA/Cloudflare/rate limit;
- enumeração cega de registros;
- HTML bruto sem política de retenção.

## 11. Segurança funcional

- TLS obrigatório.
- API Key do CrAPi jamais em query string.
- Chave completa exibida uma única vez.
- Banco armazena digest, prefixo, last4 e metadados.
- Chaves diferentes por aplicação e ambiente.
- `Authorization`, cookies e secrets são redigidos nos logs.
- Admin e Data Plane têm autenticação separada.
- Payloads não recebem criptografia adicional na V1 sem threat model específico; HTTPS/TLS é obrigatório.
- Segredo Supabase é separado da API Key do consumidor.

## 12. Regras de sincronização

- Ausência em sync não executa `DELETE` físico.
- Ausência em sync não vira automaticamente `INACTIVE`/`CANCELLED`.
- Mudanças relevantes geram histórico.
- `source_hash` identifica alteração.
- Jobs são retomáveis por checkpoint quando a fonte permitir.
- Full scan somente quando a fonte expõe mecanismo apropriado.
- Freshness e frequência são configuração por provider.

## 13. Critério de sucesso do beta

O beta está pronto quando uma aplicação consegue:

1. ser cadastrada no console;
2. receber uma API Key;
3. chamar a API pelo backend;
4. consultar CREF pelo Registry Store;
5. receber freshness e resposta normalizada;
6. disparar refresh sob demanda;
7. visualizar uso, registries e syncs;
8. rotacionar/revogar a chave;
9. sofrer rate limiting quando aplicável;
10. receber resposta segura quando upstream falha;
11. auditar origem e atualização do registro;
12. operar sem expor credenciais Supabase aos consumidores.

## 14. North Star

> Uma aplicação autorizada deve conseguir verificar um profissional sem conhecer detalhes técnicos do conselho e sem introduzir credenciais ou lógica de scraping no próprio produto.
