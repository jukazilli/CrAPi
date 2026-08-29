-- CrAPi M1: efficient server-only API key authentication lookup.
create or replace function public.lookup_api_key_auth(p_key_prefix text)
returns table (
  id uuid,
  application_id uuid,
  application_status text,
  key_prefix text,
  key_digest text,
  key_status text,
  expires_at timestamptz,
  scopes text[]
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    k.id,
    k.application_id,
    a.status as application_status,
    k.key_prefix,
    k.key_digest,
    k.status as key_status,
    k.expires_at,
    coalesce(
      array_agg(s.scope order by s.scope) filter (where s.scope is not null),
      array[]::text[]
    ) as scopes
  from public.api_keys as k
  join public.applications as a on a.id = k.application_id
  left join public.api_key_scopes as s on s.api_key_id = k.id
  where k.key_prefix = p_key_prefix
  group by k.id, k.application_id, a.status, k.key_prefix, k.key_digest, k.status, k.expires_at
  limit 1;
$$;

revoke all on function public.lookup_api_key_auth(text) from public, anon, authenticated;
grant execute on function public.lookup_api_key_auth(text) to service_role;

comment on function public.lookup_api_key_auth(text) is
  'Server-only lookup used by CrAPi Worker authentication. Never returns the raw API key.';
