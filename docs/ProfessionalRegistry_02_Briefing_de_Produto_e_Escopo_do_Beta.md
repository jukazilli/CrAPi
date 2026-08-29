# Professional Registry — Briefing de Produto e Escopo do Beta

Status: Canônico v0.2  
Data: 2026-08-29

## 1. Resumo executivo

**Professional Registry** é uma plataforma interna e independente para verificação de registros profissionais em conselhos regulamentados brasileiros.

O produto oferece duas superfícies:

- **Data Plane:** API privada consumida por aplicações autorizadas.
- **Control Plane:** console administrativo para administrar aplicações, API Keys, consumo, registros sincronizados, requisições, providers, sincronizações e eventos de segurança.

Daygym e Stude.ai serão os primeiros consumidores, mas o produto não terá dependência de código, banco, autenticação ou infraestrutura desses sistemas.

## 2. Problema a resolver

Cada conselho disponibiliza informações de maneira diferente. Fazer cada aplicação implementar seu próprio scraper produziria duplicação de código, respostas incompatíveis, maior superfície de ataque, ausência de auditoria central e manutenção multiplicada.

O Professional Registry transforma fontes heterogêneas em um contrato confiável e versionado.

## 3. Objetivo do produto

Entregar um endpoint único que responda qual conselho e registro foram consultados, se existe correspondência conhecida, qual status foi explicitamente informado quando disponível, qual a fonte, qual a idade dos dados e quão conclusiva é a verificação.

## 4. Modelo operacional de dados — Database-first

A aplicação **não dependerá de consulta ao vivo ao conselho em cada request de Daygym/Stude.ai**. O banco próprio do Professional Registry é a fonte operacional primária.

```text
CONFEF / CREF / CFM / demais fontes
              |
       Scheduled Sync Engine
              |
       fetch + parse + normalize
              |
              v
     Professional Registry DB
              |
              v
         Registry API
          /        \
      Daygym      Stude.ai
```

O sistema combina quatro estratégias por provider:

1. **FULL** — sincroniza a base quando a fonte oferece listagem, paginação, dataset ou mecanismo apropriado.
2. **INCREMENTAL** — busca somente inclusões/alterações desde um cursor/data quando a fonte oferece isso.
3. **KNOWN_RECORDS** — revalida periodicamente os registros já conhecidos quando a fonte só permite busca individual.
4. **ON_DEMAND** — consulta um registro específico quando ele não existe na base, está stale ou uma operação exige confirmação recente.

A frequência é configurável por provider. A fundação aceita **sincronização semanal como baseline de baixo custo**, mas não a torna regra universal. O dado é atualizado com maior frequência quando a criticidade, a fonte e as cotas permitirem.

### Regra fundamental

> Daygym, Stude.ai e futuros consumidores consultam a Registry API; a Registry API consulta prioritariamente seu banco próprio. Scraping e sincronização pertencem exclusivamente ao Professional Registry.

## 5. Contrato conceitual

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

## 6. Estados obrigatórios

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

Regra: ausência de resultado não prova inatividade.

## 7. Usuários

### 7.1 Operador/administrador

Administra aplicações, chaves, registries, syncs, providers, limites, segurança e investigação.

### 7.2 Desenvolvedor integrador

Recebe uma chave e integra o backend da aplicação cliente.

### 7.3 Aplicação cliente

Backend do Daygym, Stude.ai ou sistema futuro que realiza verificação.

### 7.4 Profissional verificado

É objeto da consulta, mas não utiliza diretamente o console no beta.

## 8. Escopo do beta

### API

- `POST /v1/professional-registrations/verify`;
- health/readiness sem dados sensíveis;
- autenticação por API Key;
- scopes;
- quotas por aplicação/chave;
- lookup database-first;
- Freshness Policy;
- on-demand refresh;
- single-flight/coalescing para refreshes idênticos;
- resposta normalizada;
- request IDs;
- erros versionados.

### Registry Store

- tabela canônica de registros conhecidos;
- histórico de alterações;
- `first_seen_at`, `last_seen_at`, `last_verified_at`;
- `source_hash` para evitar writes desnecessários;
- freshness explícita;
- nunca excluir/inativar por mera ausência em uma sincronização.

### CREF

- provider CREF;
- adapter mock durante fundação;
- discovery da capacidade real do CONFEF/CREF;
- adapter HTTP real após discovery;
- FULL/INCREMENTAL apenas quando a fonte permitir;
- KNOWN_RECORDS/ON_DEMAND quando necessário;
- fallback regional somente quando definido;
- parser determinístico;
- fixtures;
- detector de alteração de schema.

### Sync Engine

- scheduler configurável;
- `sync_runs`;
- `sync_cursors`/checkpoints;
- modos FULL, INCREMENTAL, KNOWN_RECORDS e ON_DEMAND;
- métricas `processed/new/changed/unchanged/errors`;
- retomada segura;
- jobs distribuídos no tempo para evitar rajadas.

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
- prefixo identificável;
- hash/digest no banco;
- revogação;
- rotação;
- ambiente `test` / `live`;
- scopes;
- limites de uso;
- último uso.

### Observabilidade

- quantidade de requests;
- success/error rate;
- respostas database-only;
- on-demand refreshes;
- freshness distribution;
- sync runs e alterações;
- latência;
- provider health;
- 401/403/429;
- security events;
- consumo frente aos limites internos.

## 9. Fora do beta

- billing;
- clientes externos self-service;
- marketplace;
- cobrança por requisição;
- CRM real;
- consulta em lote em larga escala;
- API pública sem aprovação;
- keys dentro de apps mobile/browser;
- bypass de CAPTCHA/Cloudflare/rate limit;
- enumeração cega de números de registro para descobrir profissionais;
- armazenamento de HTML bruto sem política de retenção;
- análise de antecedentes não disponibilizados pelas fontes oficiais.

## 10. Requisitos de independência

O Professional Registry deve possuir repositório, ambientes, D1, domínio, secrets, CI/CD, logs, console, tabelas, backup/export e governança próprios.

Nenhum consumidor recebe acesso direto ao D1.

## 11. Infraestrutura inicial

```text
                       OFFICIAL SOURCES
                  CONFEF / CREF / CFM
                           |
                    Scheduled Sync
                           |
                           v
                    Sync Engine
                           |
                           v
                       D1 Registry
                           ^
                           |
Applications backend -> Worker API
        |                  |
        | API Key          +-- Freshness Policy
        |                  +-- On-demand Refresh
        |                  +-- Auth / scopes / quotas
        v
      JSON
```

Control Plane:

```text
Admin
  |
Cloudflare Access
  |
Console SPA
  |
Admin routes
  |
D1 / Registries / Sync / Providers / Audit
```

## 12. Segurança funcional

- TLS obrigatório.
- API Key jamais em query string.
- Chave completa exibida uma única vez.
- Banco armazena digest, prefixo e metadados.
- Chaves diferentes por app e ambiente.
- Chave de produção não é usada em Postman compartilhado.
- Chaves privilegiadas não podem estar em código cliente distribuído.
- Payloads e respostas não precisam de criptografia adicional na V1 porque TLS protege o transporte; criptografia de aplicação poderá ser adicionada após threat model específico.
- Request body sensível, `Authorization`, cookies e secrets são redigidos nos logs.
- Admin e Data Plane têm autenticação separada.

## 13. Regras de sincronização

- Ausência em sync não executa `DELETE` físico.
- Ausência em sync não converte automaticamente para `INACTIVE` ou `CANCELLED`.
- Mudanças relevantes geram histórico.
- `source_hash` é usado para detectar alteração e economizar writes.
- Sync jobs são retomáveis por cursor/checkpoint quando a fonte permitir.
- Full scan só é adotado quando a fonte expõe mecanismo apropriado; não se faz brute force de registros.
- Thresholds de freshness e frequência ficam em configuração operacional por provider.

## 14. Critério de sucesso do beta

O beta está pronto quando uma aplicação consegue:

1. ser cadastrada no console;
2. receber uma API Key;
3. chamar a API pelo backend;
4. consultar CREF pelo Registry Store;
5. receber freshness e resposta normalizada;
6. disparar refresh sob demanda quando necessário;
7. visualizar uso, registries e syncs no console;
8. rotacionar/revogar a chave;
9. sofrer rate limiting ao exceder sua política;
10. continuar recebendo resposta segura quando a fonte externa falha;
11. auditar quando e por qual fonte um registro foi atualizado.

## 15. North Star

> Uma aplicação autorizada deve conseguir verificar um profissional sem conhecer detalhes técnicos do conselho consultado e sem introduzir credenciais ou lógica de scraping no próprio produto.
