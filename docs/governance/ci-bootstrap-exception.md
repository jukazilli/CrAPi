# Exceção de bootstrap do primeiro CI

Status: temporária  
Data: 2026-08-29

## Contexto

O repositório CrAPi nasceu com documentação, sem workflow na branch padrão. O primeiro PR técnico introduz o próprio CI; para que os próximos eventos de `pull_request` possam executar um gate definido na `main`, foi necessário instalar exclusivamente o workflow inicial diretamente na branch padrão.

## Escopo autorizado

A exceção cobre somente:

1. `.github/workflows/bootstrap-foundation.yml`;
2. este registro de governança.

Nenhum código de produto, migration, segredo, credencial ou implementação funcional é autorizado por esta exceção.

## Controles compensatórios

- workflow com permissão apenas `contents: read`;
- PR M0 continua draft;
- mudanças funcionais permanecem em `foundation/m0-supabase`;
- nenhuma credencial foi adicionada;
- o workflow deve evoluir para instalação por lockfile congelado antes de encerrar M0.

## Encerramento

A exceção termina quando o PR M0 tiver lockfile versionado e quality/security gates comprovados. Ela não se aplica a mudanças futuras.
