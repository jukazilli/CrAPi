# Professional Registry 10 — Controle de acesso administrativo

## Papéis

A CrAPi separa autenticação humana de autorização administrativa.

- `OWNER`: proprietário administrativo do ambiente. Pode gerenciar aplicações, chaves e administradores.
- `ADMIN`: operador administrativo. Pode usar o Control Plane, mas não pode conceder ou revogar acesso de outros administradores.

A identidade humana continua sendo fornecida pelo Supabase Auth. A autorização é armazenada em `public.admin_memberships`.

## Primeiro OWNER

O primeiro OWNER é estabelecido uma única vez. Depois que existe um OWNER ativo, o fluxo de bootstrap deixa de ser a forma normal de administração.

## Gestão de administradores

O Control Plane expõe uma seção **Administradores** somente para o OWNER.

O OWNER pode:

1. informar o e-mail de uma conta já cadastrada e confirmada;
2. conceder o papel `ADMIN`;
3. visualizar memberships administrativas;
4. revogar um `ADMIN` ativo.

O fluxo não permite revogar o OWNER pela interface de administradores.

## Segurança

As operações de gestão são executadas no backend. O navegador nunca recebe `SUPABASE_SECRET_KEY`.

As funções de banco `list_admin_memberships`, `grant_admin_membership_by_email` e `revoke_admin_membership`:

- exigem que o ator informado seja um `OWNER` ativo;
- são executáveis pelo `service_role` usado pelo backend;
- não são executáveis diretamente por `anon` ou `authenticated`;
- registram concessões e revogações em `public.admin_audit_log`.

As rotas mutáveis do Worker também aplicam proteção de mesma origem.

## Rotas

- `GET /admin/api/members`: lista memberships para o OWNER.
- `POST /admin/api/members`: concede `ADMIN` para uma conta existente e confirmada.
- `POST /admin/api/members/:user_id/revoke`: revoga um `ADMIN`.

A rota `/admin` continua exigindo sessão Supabase Auth válida e membership administrativa ativa.
