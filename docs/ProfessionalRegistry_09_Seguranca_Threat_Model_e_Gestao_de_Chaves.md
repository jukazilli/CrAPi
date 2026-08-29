# Professional Registry — Segurança, Threat Model e Gestão de Chaves

Status: Obrigatório antes de beta real.

## 1. Ativos

- API Keys;
- pepper/digests;
- dados de verificação;
- logs;
- banco D1;
- configuração de providers;
- sessão administrativa;
- secrets de deploy.

## 2. Fronteiras de confiança

1. Internet -> Data Plane.
2. Aplicação cliente -> Registry API.
3. Admin -> Cloudflare Access.
4. Worker -> D1.
5. Worker -> conselho externo.

## 3. Ameaças principais

### Chave roubada
Mitigação:
- keys por aplicação;
- scopes;
- quota;
- revoke;
- rotate;
- last-used;
- security event.

### Chave exposta em web/mobile
Mitigação:
- proibição arquitetural;
- scanner de variáveis/segredos;
- integração server-to-server.

### DB leak
Mitigação:
- segredo não armazenado;
- digest com pepper separado;
- mínimo dado operacional.

### Brute force de keys
Mitigação:
- alta entropia;
- comparação segura;
- rate limit;
- eventos de falha.

### Replay
Bearer key por TLS não torna replay impossível se o request for capturado em um endpoint comprometido. Caso threat model futuro exija resistência adicional, ativar assinatura HMAC por request com timestamp/nonce sem alterar o contrato de negócio.

### Abuse / quota exhaustion
- rate limit por key/app;
- global safety limits;
- cache;
- circuit breaker;
- bloqueio administrativo.

### Injection
- schemas estritos;
- queries parametrizadas;
- nunca interpolar input em SQL.

### SSRF
Providers não aceitam URL arbitrária do cliente. URLs upstream são registradas em código/configuração aprovada.

### Malicious upstream HTML
- tamanho máximo;
- timeout;
- parser sem execução de script;
- fixtures;
- schema detector.

### Sensitive logs
Nunca registrar:
- Authorization;
- API Key completa;
- cookie;
- secret;
- body completo por padrão.

## 4. API Key lifecycle

Estados:
- `ACTIVE`
- `ROTATING`
- `REVOKED`
- `EXPIRED`

Criação:
1. CSPRNG;
2. prefixo + secret;
3. digest server-side;
4. persistir digest/prefix/last4;
5. retornar secret uma única vez.

Rotação:
- nova key;
- grace period opcional;
- antiga revogada automaticamente.

## 5. Scopes iniciais

- `registry:verify`
- `registry:read` (se histórico for permitido)
- `registry:batch` (futuro)

Admin scopes não são expostos a API Keys de aplicação.

## 6. HTTP

- HTTPS obrigatório;
- API Key em `Authorization`;
- `Cache-Control: no-store` para respostas administrativas com segredos;
- security headers no console;
- CORS fechado; integração principal é server-to-server.

## 7. Console

- protegido por Access;
- ação destrutiva auditada;
- segredo somente one-time reveal;
- sessão administrativa não é compartilhada com Data Plane.

## 8. Incidente

Quando uma chave vaza:
1. revogar;
2. identificar requests pelo key ID;
3. gerar nova;
4. atualizar consumidor;
5. revisar origem;
6. registrar security event sem copiar segredo.

## 9. Critérios de segurança para release

- secrets scan;
- dependency audit;
- auth tests;
- scope tests;
- rate limit tests;
- redaction tests;
- SQL injection tests;
- broken auth tests;
- key rotation/revocation tests;
- Access comprovado;
- backup/export testado.
