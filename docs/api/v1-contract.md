# API V1 — Contrato inicial

## Endpoint planejado

`POST /v1/professional-registrations/verify`

Autenticação:

`Authorization: Bearer <prk_test_... | prk_live_...>`

A API Key é própria do Professional Registry e não é uma credencial Supabase.

## Request

```json
{
  "council": "CREF",
  "uf": "SP",
  "registration_number": "123456"
}
```

## Regras

- `registration_number` é string e preserva zeros/prefixos/sufixos relevantes.
- `NOT_FOUND` não equivale a `INACTIVE`.
- Status profissional só é conclusivo quando a fonte/semântica permite.
- O lookup normal é database-first.
- Freshness pode disparar refresh controlado.

O contrato TypeScript está em `packages/contracts`.
