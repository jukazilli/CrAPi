# ADR-0001 — Cloudflare Workers + D1 como fundação free-first

Status: Proposto  
Data: 2026-08-29

## Contexto

A aplicação deve iniciar sem custo recorrente, ser independente e possuir API, console, banco e segurança próprios.

## Decisão

Adotar inicialmente:
- Cloudflare Workers;
- D1;
- Static Assets para o console;
- Cloudflare Access para o Control Plane;
- GitHub para CI/CD.

## Consequências

Positivas:
- baixa operação;
- edge;
- infraestrutura consolidada;
- ausência de servidor ocioso 24/7;
- boa adequação ao beta fechado.

Limitações:
- browser automation pesado não pertence ao Worker principal;
- limites do free tier exigem quotas e cache;
- mudanças de provider podem exigir serviço auxiliar futuro.

## Regra

Números de quota do provedor não são hardcoded como requisito de produto. Devem ser validados na implantação e protegidos por limites internos menores.
