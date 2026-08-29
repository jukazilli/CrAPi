# Professional Registry — Técnicas de Desenvolvimento e Engenharia com IA

Status: Obrigatório para qualquer alteração de código.

## 1. Princípio

IA é agente de implementação, não fonte de requisito.

O agente deve converter itens do backlog e documentos canônicos em mudanças pequenas, testadas e rastreáveis.

## 2. Toolchain base

Alinhar inicialmente com o padrão já utilizado no DayGym:

- Node.js 22.12.x
- pnpm 9.11.x
- TypeScript strict
- ESLint
- Prettier
- Vitest
- lockfile obrigatório
- CI reproduzível

A stack pode evoluir por ADR, nunca por decisão silenciosa do agente.

## 3. Gates mínimos

O equivalente a `check:ci` deve executar:

1. format check;
2. toolchain check;
3. contract/data schema check;
4. lint;
5. typecheck;
6. unit tests;
7. integration/contract tests aplicáveis;
8. build.

O gate `security` deve incluir:

- secret scan;
- dependency audit;
- environment/public-variable check;
- testes de autenticação/autorização;
- verificação de log redaction.

## 4. Fluxo de trabalho

- `main` protegida;
- branch por item;
- PR obrigatório;
- staging antes de produção;
- mudanças pequenas;
- merge somente após gates;
- sem force push em branches protegidas;
- sem segredo em commit, issue, fixture ou log.

## 5. Regra para Codex/IA

Antes de editar:

1. ler `AGENTS.md`;
2. identificar backlog ID;
3. ler documentos citados no item;
4. inspecionar implementação atual;
5. declarar plano curto;
6. alterar somente o escopo;
7. executar gates;
8. atualizar documentação/rastreabilidade quando necessário.

## 6. Proibições

Agente não pode:

- inventar regra de status de conselho;
- converter `NOT_FOUND` em `INACTIVE`;
- adicionar bypass de CAPTCHA/Cloudflare/rate limit;
- colocar API Key no frontend público;
- persistir segredo em claro;
- registrar `Authorization`;
- alterar contrato externo sem versão/migração;
- instalar dependência sem justificar;
- desabilitar teste para “fazer passar”;
- usar `any` para contornar contrato sem justificativa;
- adicionar endpoint administrativo público.

## 7. Segurança por construção

Entradas externas são não confiáveis:
- payload de cliente;
- HTML/JSON de conselho;
- headers;
- query params;
- conteúdo de cache.

Validar tamanho, tipo, enum e formato antes de processar.

## 8. Código de providers

Cada provider possui:
- adapter;
- parser;
- normalizer;
- fixtures;
- contract tests;
- health state.

Parser não executa scripts externos.

## 9. Dependências

Preferir plataforma nativa quando adequada.

Toda dependência deve responder:
- por que existe?;
- quem mantém?;
- qual superfície de ataque?;
- existe alternativa nativa?;
- entra no runtime ou apenas dev?

## 10. Definition of Done técnica

Um item só fecha se:
- requisito atendido;
- testes relevantes;
- CI verde;
- security gate verde;
- logs sanitizados;
- documentação atualizada;
- sem segredo;
- evidência de staging quando aplicável.

## 11. ADR

Decisões irreversíveis ou de alto impacto exigem ADR:
- banco;
- auth;
- criptografia;
- framework;
- mudança de provider principal;
- retenção;
- domínio;
- nova classe de dado pessoal.

## 12. Política de refatoração por IA

Não realizar refatoração ampla junto com feature funcional sem backlog específico. Evitar “limpeza oportunista” que aumente diff e risco de regressão.
