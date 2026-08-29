# ADR-0001 — Cloudflare Workers + D1 como fundação free-first

Status: Superseded parcialmente por ADR-0003  
Data: 2026-08-29

## Contexto

Na primeira proposta de fundação, a aplicação deveria iniciar sem custo recorrente, ser independente e possuir API, console, banco e segurança próprios.

## Decisão original

A decisão original adotava:
- Cloudflare Workers;
- Cloudflare D1;
- Static Assets para o console;
- Cloudflare Access para o Control Plane;
- GitHub para CI/CD.

## Consequências observadas

O desenho de Worker/Access/CI continua válido, mas o banco foi posteriormente definido como Supabase PostgreSQL, já configurado para o projeto e mais alinhado ao modelo relacional, histórico e migrations do Registry Store.

## Supersessão

**ADR-0003 substitui exclusivamente a decisão de banco desta ADR.**

A arquitetura vigente é:
- Cloudflare Workers como compute/edge;
- Supabase PostgreSQL como Registry Store;
- Cloudflare Access para o Control Plane;
- GitHub para CI/CD.

## Regra permanente

Números de quota do provedor não são hardcoded como requisito de produto. Devem ser validados na implantação e protegidos por limites internos menores.
