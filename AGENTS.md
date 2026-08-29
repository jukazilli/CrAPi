# AGENTS.md — Professional Registry

Este arquivo é obrigatório para qualquer agente de IA que altere este repositório.

## 1. Antes de escrever código

Leia nesta ordem:

1. `docs/00_Documentation_Index.md`
2. briefing;
3. visão do PO;
4. técnicas de desenvolvimento;
5. arquitetura;
6. segurança;
7. sincronização/freshness;
8. backlog.

Identifique um `backlog_id`. Se a solicitação não corresponder ao escopo aprovado, não invente comportamento: registre a lacuna e peça decisão.

## 2. Regras absolutas

- Não armazenar API Keys em claro.
- Não colocar secrets em `.env` commitado, logs, fixtures, issues ou docs.
- Não embutir key privilegiada em web/mobile.
- Não converter `NOT_FOUND` em `INACTIVE`.
- Não criar bypass de CAPTCHA, Cloudflare ou rate limit.
- Não criar endpoint administrativo sem autenticação.
- Não registrar `Authorization` ou cookies.
- Não aceitar URL arbitrária para provider.
- Não fazer enumeração cega de números de registro para simular sincronização completa.
- Não executar DELETE/inativação por ausência em um sync.
- Requests normais devem ser database-first; acesso upstream passa pela política de sync/refresh.
- Não alterar contrato V1 silenciosamente.
- Não remover teste/gate para passar CI.

## 3. Engenharia

- TypeScript strict.
- Código pequeno e modular.
- Contracts compartilhados.
- Providers isolados.
- SQL parametrizado.
- Inputs validados.
- Erros tipados.
- Request IDs.
- Logs estruturados e redigidos.

## 4. Antes de concluir

Execute os gates equivalentes a:

- format check;
- toolchain check;
- contract/data check;
- lint;
- typecheck;
- test;
- build;
- secret scan;
- dependency audit;
- security tests.

## 5. Rastreabilidade

Todo PR deve mencionar:
- backlog ID;
- requisitos afetados;
- testes;
- impacto de segurança;
- migrations;
- evidência de staging, quando aplicável.

Atualize a documentação quando a decisão mudou. Não atualize docs para justificar retrospectivamente uma implementação fora do escopo.

## 6. Providers

Cada novo conselho/fonte exige:
- declarar capacidades `FULL`, `INCREMENTAL`, `KNOWN_RECORDS` e/ou `ON_DEMAND`;
- adapter;
- parser;
- normalizer;
- fixtures;
- contract tests;
- timeout;
- health/error mapping;
- semântica documentada de status.

Se a fonte não for conclusiva, retorne `UNKNOWN`/`INCONCLUSIVE`.

## 7. Segurança da chave

A key completa pode existir apenas:
- na geração;
- na resposta one-time ao administrador;
- na memória do cliente durante configuração.

Persistir apenas digest + prefix + last4 + metadados.

## 8. Mudança arquitetural

Framework, banco, auth, criptografia, retenção e provider primário exigem ADR/revisão explícita.
