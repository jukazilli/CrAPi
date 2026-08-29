-- CrAPi M1: server-only control-plane and registry RPCs.

create or replace function public.admin_create_application(
  p_slug text,
  p_name text,
  p_actor_subject text
)
returns table (
  id uuid,
  slug text,
  name text,
  status text,
  created_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_application public.applications%rowtype;
begin
  insert into public.applications (slug, name)
  values (lower(trim(p_slug)), trim(p_name))
  returning * into v_application;

  insert into public.admin_audit_log (actor_subject, action, entity_type, entity_id, metadata)
  values (
    p_actor_subject,
    'APPLICATION_CREATED',
    'application',
    v_application.id::text,
    jsonb_build_object('slug', v_application.slug, 'name', v_application.name)
  );

  return query
  select v_application.id, v_application.slug, v_application.name,
         v_application.status, v_application.created_at;
end;
$$;

create or replace function public.admin_create_api_key(
  p_application_id uuid,
  p_name text,
  p_environment text,
  p_key_prefix text,
  p_key_digest text,
  p_last4 text,
  p_daily_limit integer,
  p_expires_at timestamptz,
  p_scopes text[],
  p_actor_subject text
)
returns table (
  id uuid,
  application_id uuid,
  name text,
  environment text,
  key_prefix text,
  last4 text,
  status text,
  daily_limit integer,
  expires_at timestamptz,
  scopes text[],
  created_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_key public.api_keys%rowtype;
  v_scopes text[];
begin
  if p_scopes is null or cardinality(p_scopes) = 0 then
    raise exception 'At least one scope is required.' using errcode = '22023';
  end if;

  select array_agg(distinct scope order by scope)
  into v_scopes
  from unnest(p_scopes) as scope;

  insert into public.api_keys (
    application_id, name, environment, key_prefix, key_digest, last4,
    daily_limit, expires_at
  )
  values (
    p_application_id, trim(p_name), upper(trim(p_environment)), p_key_prefix,
    p_key_digest, p_last4, p_daily_limit, p_expires_at
  )
  returning * into v_key;

  insert into public.api_key_scopes (api_key_id, scope)
  select v_key.id, scope
  from unnest(v_scopes) as scope;

  insert into public.admin_audit_log (actor_subject, action, entity_type, entity_id, metadata)
  values (
    p_actor_subject,
    'API_KEY_CREATED',
    'api_key',
    v_key.id::text,
    jsonb_build_object(
      'application_id', v_key.application_id,
      'environment', v_key.environment,
      'key_prefix', v_key.key_prefix,
      'last4', v_key.last4,
      'scopes', to_jsonb(v_scopes)
    )
  );

  return query
  select v_key.id, v_key.application_id, v_key.name, v_key.environment,
         v_key.key_prefix, v_key.last4, v_key.status, v_key.daily_limit,
         v_key.expires_at, v_scopes, v_key.created_at;
end;
$$;

create or replace function public.admin_revoke_api_key(
  p_api_key_id uuid,
  p_actor_subject text
)
returns table (
  id uuid,
  application_id uuid,
  key_prefix text,
  status text,
  revoked_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_key public.api_keys%rowtype;
begin
  update public.api_keys
  set status = 'REVOKED', revoked_at = now(), updated_at = now()
  where api_keys.id = p_api_key_id
    and api_keys.status in ('ACTIVE', 'ROTATING')
  returning * into v_key;

  if v_key.id is null then
    raise exception 'API key not found or already inactive.' using errcode = 'P0002';
  end if;

  insert into public.admin_audit_log (actor_subject, action, entity_type, entity_id, metadata)
  values (
    p_actor_subject,
    'API_KEY_REVOKED',
    'api_key',
    v_key.id::text,
    jsonb_build_object('application_id', v_key.application_id, 'key_prefix', v_key.key_prefix)
  );

  return query
  select v_key.id, v_key.application_id, v_key.key_prefix, v_key.status, v_key.revoked_at;
end;
$$;

create or replace function public.admin_rotate_api_key(
  p_api_key_id uuid,
  p_name text,
  p_key_prefix text,
  p_key_digest text,
  p_last4 text,
  p_expires_at timestamptz,
  p_actor_subject text
)
returns table (
  old_key_id uuid,
  old_key_status text,
  new_key_id uuid,
  application_id uuid,
  environment text,
  key_prefix text,
  last4 text,
  daily_limit integer,
  expires_at timestamptz,
  scopes text[],
  created_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_old public.api_keys%rowtype;
  v_new public.api_keys%rowtype;
  v_scopes text[];
begin
  select * into v_old
  from public.api_keys
  where id = p_api_key_id
  for update;

  if v_old.id is null or v_old.status not in ('ACTIVE', 'ROTATING') then
    raise exception 'API key cannot be rotated.' using errcode = 'P0002';
  end if;

  if v_old.expires_at is not null and v_old.expires_at <= now() then
    raise exception 'Expired API key cannot be rotated.' using errcode = '22023';
  end if;

  select coalesce(array_agg(scope order by scope), array[]::text[])
  into v_scopes
  from public.api_key_scopes
  where api_key_id = v_old.id;

  update public.api_keys
  set status = 'ROTATING', updated_at = now()
  where id = v_old.id;

  insert into public.api_keys (
    application_id, name, environment, key_prefix, key_digest, last4,
    daily_limit, expires_at, rotated_from_id
  )
  values (
    v_old.application_id, trim(p_name), v_old.environment, p_key_prefix,
    p_key_digest, p_last4, v_old.daily_limit, p_expires_at, v_old.id
  )
  returning * into v_new;

  insert into public.api_key_scopes (api_key_id, scope)
  select v_new.id, scope from unnest(v_scopes) as scope;

  insert into public.admin_audit_log (actor_subject, action, entity_type, entity_id, metadata)
  values (
    p_actor_subject,
    'API_KEY_ROTATED',
    'api_key',
    v_new.id::text,
    jsonb_build_object(
      'application_id', v_new.application_id,
      'rotated_from_id', v_old.id,
      'new_key_prefix', v_new.key_prefix,
      'new_last4', v_new.last4
    )
  );

  return query
  select v_old.id, 'ROTATING'::text, v_new.id, v_new.application_id,
         v_new.environment, v_new.key_prefix, v_new.last4, v_new.daily_limit,
         v_new.expires_at, v_scopes, v_new.created_at;
end;
$$;

create or replace function public.check_api_key_daily_quota(p_api_key_id uuid)
returns table (
  daily_limit integer,
  used integer,
  remaining integer,
  allowed boolean
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with key_data as (
    select k.daily_limit
    from public.api_keys k
    where k.id = p_api_key_id
  ), usage_data as (
    select count(*)::integer as used
    from public.api_requests r
    where r.api_key_id = p_api_key_id
      and r.created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
  )
  select
    k.daily_limit,
    u.used,
    greatest(k.daily_limit - u.used, 0) as remaining,
    u.used < k.daily_limit as allowed
  from key_data k cross join usage_data u;
$$;

create or replace function public.lookup_registry_snapshot(
  p_council text,
  p_uf text,
  p_normalized_registration text
)
returns table (
  id uuid,
  council text,
  uf text,
  registration_number text,
  professional_name text,
  registration_status text,
  status_semantics text,
  regional_council text,
  category text,
  provider_id uuid,
  freshness_state text,
  acquisition_mode text,
  last_seen_at timestamptz,
  last_verified_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    r.id, r.council, r.uf, r.registration_number, r.professional_name,
    r.registration_status, r.status_semantics, r.regional_council,
    r.category, r.provider_id, r.freshness_state, r.acquisition_mode,
    r.last_seen_at, r.last_verified_at
  from public.professional_registry r
  where r.council = upper(trim(p_council))
    and r.uf = upper(trim(p_uf))
    and r.normalized_registration = p_normalized_registration
  limit 1;
$$;

revoke all on function public.admin_create_application(text, text, text) from public, anon, authenticated;
revoke all on function public.admin_create_api_key(uuid, text, text, text, text, text, integer, timestamptz, text[], text) from public, anon, authenticated;
revoke all on function public.admin_revoke_api_key(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_rotate_api_key(uuid, text, text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.check_api_key_daily_quota(uuid) from public, anon, authenticated;
revoke all on function public.lookup_registry_snapshot(text, text, text) from public, anon, authenticated;

grant execute on function public.admin_create_application(text, text, text) to service_role;
grant execute on function public.admin_create_api_key(uuid, text, text, text, text, text, integer, timestamptz, text[], text) to service_role;
grant execute on function public.admin_revoke_api_key(uuid, text) to service_role;
grant execute on function public.admin_rotate_api_key(uuid, text, text, text, text, timestamptz, text) to service_role;
grant execute on function public.check_api_key_daily_quota(uuid) to service_role;
grant execute on function public.lookup_registry_snapshot(text, text, text) to service_role;

comment on function public.admin_create_application(text, text, text) is 'Server-only CrAPi control-plane operation.';
comment on function public.admin_create_api_key(uuid, text, text, text, text, text, integer, timestamptz, text[], text) is 'Stores API key digest and metadata only. Raw key must never be passed to the database.';
comment on function public.admin_rotate_api_key(uuid, text, text, text, text, timestamptz, text) is 'Starts API key rotation while keeping the prior key in ROTATING state for explicit later revocation.';
