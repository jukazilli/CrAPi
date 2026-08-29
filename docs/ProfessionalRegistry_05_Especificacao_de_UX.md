# Professional Registry — Especificação de UX

Status: Draft v0.1

## Jornada 1 — Primeira integração

1. Admin entra pelo Cloudflare Access.
2. Overview mostra empty state.
3. Admin cria `Application`.
4. Abre a aplicação.
5. Cria API Key `test`.
6. Sistema mostra segredo uma vez.
7. Admin copia a chave.
8. Console oferece snippet de exemplo.
9. Backend cliente realiza a primeira chamada.
10. Overview e Requests refletem a requisição.

Critério: fluxo deve ser concluível sem abrir banco, Worker dashboard ou código da API.

## Jornada 2 — Criar API Key

Campos:
- Name;
- Environment;
- Scopes;
- Daily limit;
- Expiration.

Após gerar:
- secret em destaque;
- aviso “shown once”;
- copy button;
- confirmação de que foi salvo antes de sair.

## Jornada 3 — Rotacionar chave

1. Usuário escolhe `Rotate`.
2. UI explica período de sobreposição.
3. Nova chave é gerada.
4. Antiga recebe `rotating`.
5. Usuário migra consumidor.
6. Antiga expira/revoga.
7. Audit log registra operação.

## Jornada 4 — Revogar chave

Confirmação deve informar:
- aplicação afetada;
- último uso;
- que requests futuros falharão imediatamente.

Após revogar:
- status persistente;
- não existe reativação; nova chave deve ser criada.

## Jornada 5 — Investigar erro

Requests -> filtro por HTTP/result/provider -> abrir request.

A tela deve responder:
- quem chamou;
- qual provider;
- foi cache hit?;
- quanto demorou?;
- qual erro sanitizado?;
- o problema é autenticação, quota, contrato ou upstream?

## Jornada 6 — Provider degradado

Overview e Providers mostram aviso.

O usuário pode:
- abrir detalhes;
- ver taxa de erro;
- ver circuit breaker;
- visualizar último erro;
- desativar provider se tiver permissão.

## Estados de erro

### 401
“API Key ausente ou inválida.”

### 403
“Esta chave não possui o escopo necessário.”

### 409
Conflito de operação administrativa.

### 422
Entrada semanticamente inválida ou conselho não suportado.

### 429
“Limite da chave/aplicação atingido.”

### 502/503
Fonte externa indisponível, sem inferir status profissional.

## Mobile

Prioridade:
- Overview;
- Security events;
- Requests;
- revogação emergencial.

Edição avançada pode ser desktop-first.

## Acessibilidade

Todos os diálogos devem:
- capturar foco;
- permitir Escape quando seguro;
- devolver foco ao originador;
- possuir descrição da consequência.

## Jornada 7 — Inspecionar sincronização

1. Admin abre `Sync`.
2. Visualiza última execução por provider.
3. Confere `processed/new/changed/unchanged/errors`.
4. Abre execução para ver checkpoint e falhas.
5. Em falha parcial, a UI deixa claro que a base anterior permanece válida conforme freshness; não infere cancelamentos.

## Jornada 8 — Inspecionar Registry

`Registries` permite filtrar conselho/UF/status/freshness e visualizar `last_seen_at` e `last_verified_at`. Histórico mostra mudanças conhecidas sem expor dados além do necessário.
