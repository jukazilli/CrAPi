# Governança M0 — Fundação técnica

Status: In Progress  
Data: 2026-08-29

## Escopo

M0 fecha quando o repositório possui:
- toolchain pinada;
- lockfile;
- quality/security gates;
- contrato V1 tipado;
- migrations versionadas;
- staging ligado a Worker + Supabase;
- documentação canônica coerente com a infraestrutura real.

## Estado atual

- documentação canônica criada;
- arquitetura Database-first aprovada;
- banco escolhido: Supabase PostgreSQL;
- branch de fundação criada para implementação técnica;
- projeto Supabase ainda precisa ficar visível à integração para aplicação/validação automática das migrations;
- deploy Cloudflare permanece pendente.

## Regra

Criar migration no Git não equivale a banco provisionado. `PR-M1-001` só pode ser marcado Done após migration aplicada e advisors verificados no projeto correto.
