# Professional Registry — Briefing de Produto e Escopo do Beta

Status: Canônico v0.4  
Data: 2026-08-30

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

- **Cloudflare Workers** para Data Plane, sessão server-side e rotas administrativas.
- **Supabase Auth** para cadastro, login, confirmação, recuperação e identidade humana.
- **Supabase PostgreSQL** como Registry Store, memberships administrativas, histórico, sync e auditoria.
- **Supabase Data API/PostgREST sobre HTTPS** como caminho inicial Worker -> banco.
- **Static Assets/SPA** para o console.
- **GitHub** para versionamento, PRs e CI/CD.
- secrets somente nos secret stores dos provedores.
- Cloudflare Access permanece opção de perímetro adicional para produção, não o login primário do produto.

O Supabase é infraestrutura **exclusiva do CrAPi**. Nenhum consumidor recebe acesso direto ao banco.

### 5.1 Credenciais Supabase

- `SUPABASE_URL` é configuração de ambiente.
- `SUPABASE_PUBLISHABLE_KEY` é configuração pública usada apenas para Supabase Auth.
- `SUPABASE_SECRET_KEY` é segredo exclusivo de runtime server-side.
- A credencial privilegiada do Supabase nunca é entregue a Daygym, Stude.ai, browser ou mobile.
- Consumidores recebem somente API Keys do CrAPi (`prk_test_*` / `prk_live_*`).
- Tabelas operacionais e `admin_memberships` têm RLS habilitado e não possuem acesso `anon`/`authenticated`.

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

### Owner/administrador
Possui conta humana autenticada pelo Supabase Auth e membership ativa no CrAPi. Administra aplicações, chaves, registries, syncs, providers, limites, segurança e investigação.

### Conta autenticada sem autorização
Pode ter identidade válida no Supabase Auth, mas não acessa o Control Plane até receber membership administrativa. Login nunca concede Registry API.

### Desenvolvedor integrador
Recebe uma chave do CrAPi e integra o backend da aplicação cliente.

### Aplicação cliente
Backend do Daygym, Stude.ai ou sistema futuro explicitamente autorizado.

### Profissional verificado
É objeto da consulta, mas não utiliza diretamente o console no beta.

## 9. Autenticação e autorização humana

A autenticação e a autorização são independentes:

```text
conta -> Supabase Auth -> sessão válida -> admin_memberships -> OWNER/ADMIN ACTIVE -> Control Plane
```

Regras:
- cadastro, login, confirmação e recuperação pertencem ao Supabase Auth;
- sessão é mantida pelo Worker em cookies `HttpOnly`, `Secure`, `SameSite=Strict`;
- tokens são revalidados server-side;
- usuário sem membership recebe acesso negado;
- o primeiro OWNER é ativado uma única vez com sessão válida + credencial de bootstrap/break-glass;
- JWT humano não substitui API Key de aplicação;
- `ADMIN_TOKEN` não é login normal do produto.

## 10. Escopo do beta

### API
- `POST /v1/professional-registrations/verify`;
- health/readiness sem dados sensíveis;
- autenticação por API Key própria;
- scopes e quotas;
- lookup database-first;
- Freshness Policy e on-demand refresh;
- single-flight/coalescing;
- request IDs e erros versionados.

### Auth / Control Plane
- criar conta;
- login;
- confirmação de e-mail;
- recuperação e redefinição de senha;
- refresh/logout de sessão;
- authorization por `admin_memberships`;
- primeiro OWNER com bootstrap controlado;
- Overview;
- Applications;
- API Keys;
- Requests;
- Registries;
- Providers;
- Sync;
- Security;
- Settings operacional mínima.

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

## 11. Fora do beta

- billing e clientes externos self-service;
- CRM real;
- consulta em lote em larga escala;
- API pública sem aprovação;
- keys do CrAPi em browser/mobile;
- acesso direto de consumidor ao Supabase;
- bypass de CAPTCHA/Cloudflare/rate limit;
- enumeração cega de registros;
- HTML bruto sem política de retenção.

## 12. Segurança funcional

- TLS obrigatório.
- API Key do CrAPi jamais em query string.
- Chave completa exibida uma única vez.
- Banco armazena digest, prefixo, last4 e metadados.
- Chaves diferentes por aplicação e ambiente.
- `Authorization`, cookies e secrets são redigidos nos logs.
- Admin e Data Plane têm autenticação separada.
- JWT humano não autentica a Registry API.
- Conta autenticada não é automaticamente autorizada.
- sessão de browser em cookies `HttpOnly`, `Secure`, `SameSite=Strict`.
- mutações administrativas são same-origin e auditadas.
- segredo Supabase é separado da publishable key, sessão humana e API Key do consumidor.

## 13. Regras de sincronização

- Ausência em sync não executa `DELETE` físico.
- Ausência em sync não vira automaticamente `INACTIVE`/`CANCELLED`.
- Mudanças relevantes geram histórico.
- `source_hash` identifica alteração.
- Jobs são retomáveis por checkpoint quando a fonte permitir.
- Full scan somente quando a fonte expõe mecanismo apropriado.
- Freshness e frequência são configuração por provider.

## 14. Critério de sucesso do beta

O beta está pronto quando:

1. um operador autorizado consegue criar/confirmar conta e entrar no Control Plane;
2. conta não autorizada permanece bloqueada;
3. o OWNER consegue cadastrar uma aplicação;
4. a aplicação recebe uma API Key;
5. o backend consumidor chama a Registry API;
6. a API consulta CREF pelo Registry Store;
7. freshness e resposta normalizada são retornadas;
8. refresh sob demanda funciona;
9. uso, registries e syncs são observáveis;
10. chave pode ser rotacionada/revogada;
11. rate limiting é aplicado quando necessário;
12. upstream indisponível gera resposta conservadora;
13. origem e atualização do registro são auditáveis;
14. nenhuma credencial privilegiada do Supabase chega ao consumidor;
15. JWT humano não serve como chave da Registry API.

## 15. North Star

> Uma aplicação autorizada deve conseguir verificar um profissional sem conhecer detalhes técnicos do conselho e sem introduzir credenciais ou lógica de scraping no próprio produto.
