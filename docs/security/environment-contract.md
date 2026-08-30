# Contrato de ambientes e credenciais

Status: Fundação M1

## Ambientes

- local
- staging
- production

Cada ambiente deve possuir Worker, configuração Supabase/Auth, API Keys e quotas isolados.

## Variáveis do Worker

### Públicas/configuração

- `APP_ENV`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` — chave pública usada somente para Supabase Auth.

### Secretas

- `SUPABASE_SECRET_KEY`
- `API_KEY_PEPPER`
- `ADMIN_TOKEN` — bootstrap inicial/break-glass; não é login normal do Control Plane
- futuras credenciais upstream aprovadas

Nenhum valor secreto é documentado ou commitado.

## Identidade humana

O Control Plane usa Supabase Auth para cadastro, login, confirmação e recuperação.

A autorização não é derivada do login. O Worker valida a sessão e consulta `admin_memberships`:

- `OWNER` / `ACTIVE` → autorizado;
- `ADMIN` / `ACTIVE` → autorizado;
- membership ausente ou `REVOKED` → acesso negado.

Sessões de browser usam cookies `HttpOnly`, `Secure`, `SameSite=Strict` e não concedem acesso ao Data Plane.

O primeiro OWNER exige sessão válida e `ADMIN_TOKEN` apenas no bootstrap inicial. O banco impede múltiplos bootstraps concorrentes.

## Aplicações consumidoras

Daygym/Stude.ai recebem apenas a API Key emitida pelo Professional Registry para seu backend.

A aplicação cliente **não recebe**:
- `SUPABASE_SECRET_KEY`;
- senha PostgreSQL;
- credenciais do conselho;
- sessão/JWT administrativo;
- credencial de bootstrap do console.

JWT humano não é aceito em `POST /v1/professional-registrations/verify`.

## Rotação

1. criar nova credencial;
2. configurar no secret store;
3. validar staging;
4. promover;
5. revogar anterior;
6. registrar evento sem copiar segredo.

## Regra de fail-closed

Ausência de secret obrigatório impede readiness/deploy funcional. O código não deve usar fallback hardcoded.

Falha do Auth não permite bypass administrativo. Falha do banco não permite fallback inseguro para o Control Plane ou Data Plane.
