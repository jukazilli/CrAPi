# Professional Registry — Pesquisa e Viabilidade

Status: Draft de fundação v0.1  
Data: 2026-08-29

## 1. Problema

Daygym e Stude.ai precisam confirmar se um profissional declara um registro compatível com um conselho profissional regulamentado. Hoje essa validação depende de portais públicos heterogêneos, sem um contrato técnico uniforme.

A oportunidade é criar uma camada interna única:

`aplicação cliente -> Professional Registry -> fonte oficial -> resposta normalizada`

## 2. Premissas confirmadas

- O Professional Registry será uma aplicação **independente**.
- Terá repositório, banco e infraestrutura próprios.
- A API será privada no beta.
- Cada aplicação terá API Keys próprias; não haverá chave global compartilhada.
- Chaves privilegiadas não poderão existir em bundles públicos web/mobile.
- O painel administrativo será separado da autenticação de aplicações.
- A infraestrutura inicial deve priorizar **custo zero e proteção contra estouro de free tier**.
- A primeira integração funcional será CREF.
- CRM e outros conselhos entram por providers independentes no futuro.
- A solução deve aceitar que uma fonte possa responder de forma inconclusiva.
- O padrão operacional será **Database-first**: apps consultam o banco próprio, enquanto o Professional Registry sincroniza fontes oficiais em segundo plano.
- A sincronização poderá ser full, incremental, de registros conhecidos ou sob demanda conforme o que cada fonte expõe.
- `NOT_FOUND` nunca deve ser automaticamente convertido em `INACTIVE`.
- Não serão implementadas técnicas de evasão de CAPTCHA, Cloudflare, bloqueio por IP ou rate limit.

## 3. Viabilidade de aquisição e sincronização

A estratégia de aquisição seguirá uma escada:

1. API/webservice oficial;
2. endpoint HTTP/JSON consumido pelo próprio portal;
3. HTML server-side;
4. browser automation somente quando estritamente necessário e permitido;
5. revisão/manual fallback.

O objetivo do discovery do CREF é identificar o **Minimum Viable Request** necessário à consulta, sem renderização gráfica quando possível, e também determinar se a fonte oferece listagem/paginação/filtros que permitam sincronização completa ou incremental. Quando não oferecer, a estratégia será refresh de registros conhecidos + aquisição sob demanda.

## 4. Viabilidade de infraestrutura

### Fundação proposta

- Cloudflare Workers para API e Control Plane.
- Supabase PostgreSQL como banco próprio.
- Static Assets/SPA para o console administrativo.
- Cloudflare Access como barreira inicial do console administrativo.
- GitHub para versionamento, PRs e CI.
- Secrets no provedor; nunca no repositório.

### Estratégia free-first

A aplicação deverá operar com limites internos inferiores aos limites do provedor.

Princípio:

> Limite contratado não é orçamento operacional.

Devem existir soft limits, hard limits, cache e circuit breakers antes de a aplicação consumir a cota máxima disponível.

## 5. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Portal muda HTML | Parsing incorreto | Contract tests, schema-change detector |
| Fonte fora do ar | Indisponibilidade | Cache, circuit breaker, `SOURCE_UNAVAILABLE` |
| Resultado negativo ambíguo | Falso negativo profissional | `INCONCLUSIVE` / `UNKNOWN` |
| Vazamento de API Key | Uso indevido | Chaves individuais, hash, revogação, scopes, rate limit |
| Chave embutida no app web/mobile | Comprometimento inevitável | Comunicação server-to-server |
| Cota gratuita excedida | Queda temporária | Quotas internas, cache, alertas |
| DDoS/abuso | Consumo e indisponibilidade | Edge rate limiting, client quotas, Access no admin |
| Mudança jurídica/termos | Bloqueio da integração | Provider substituível e revisão de fonte |
| Dados sensíveis em logs | Risco LGPD | Redaction e minimização |

## 6. Critério de viabilidade da PoC

A PoC é considerada tecnicamente viável quando:

- um request autenticado chega ao endpoint unificado;
- uma API Key válida é identificada sem armazenar o segredo em claro;
- uma consulta CREF retorna contrato normalizado;
- banco local responde consultas de aplicações sem depender do upstream;
- sync periódico atualiza os registros;
- cache/freshness reduzem refreshes externos;
- logs não expõem credenciais;
- o provider pode ser trocado sem alterar o contrato externo;
- falha da fonte não derruba a API;
- a UI permite gerar/revogar chave e inspecionar requisições;
- todos os gates de engenharia e segurança passam em CI.

## 7. Pendências de discovery

- Mapear request real do CONFEF/CREF.
- Descobrir se há paginação/listagem/dataset para full sync.
- Definir cursor/checkpoint e estratégia incremental quando possível.
- Validar semântica de status por fonte.
- Definir política de retenção dos registros de auditoria.
- Confirmar domínio final.
- Validar termos de uso e tratamento de dados antes de produção.
