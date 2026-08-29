# Contrato de ambientes e credenciais

Status: Fundação M0

## Ambientes

- local
- staging
- production

Cada ambiente deve possuir Worker, configuração Supabase, API Keys e quotas isolados.

## Variáveis do Worker

### Públicas/configuração

- `APP_ENV`
- `SUPABASE_URL`

### Secretas

- `SUPABASE_SECRET_KEY`
- `API_KEY_PEPPER`
- futuras credenciais upstream aprovadas

Nenhum valor secreto é documentado ou commitado.

## Aplicações consumidoras

Daygym/Stude.ai recebem apenas a API Key emitida pelo Professional Registry para seu backend.

A aplicação cliente **não recebe**:
- `SUPABASE_SECRET_KEY`;
- senha PostgreSQL;
- credenciais do conselho;
- credencial administrativa do console.

## Rotação

1. criar nova credencial;
2. configurar no secret store;
3. validar staging;
4. promover;
5. revogar anterior;
6. registrar evento sem copiar segredo.

## Regra de fail-closed

Ausência de secret obrigatório impede readiness/deploy funcional. O código não deve usar fallback hardcoded.
