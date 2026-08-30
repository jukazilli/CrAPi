create table if not exists public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER', 'ADMIN')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_memberships enable row level security;
revoke all on table public.admin_memberships from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_memberships to service_role;

create index if not exists idx_admin_memberships_role_status
  on public.admin_memberships (role, status);

drop trigger if exists admin_memberships_set_updated_at on public.admin_memberships;
create trigger admin_memberships_set_updated_at
before update on public.admin_memberships
for each row execute function private.set_updated_at();

create or replace function public.lookup_admin_membership(p_user_id uuid)
returns table (
  user_id uuid,
  role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select m.user_id, m.role, m.status, m.created_at, m.updated_at
  from public.admin_memberships m
  where m.user_id = p_user_id
  limit 1;
$$;

create or replace function public.admin_owner_exists()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.admin_memberships
    where role = 'OWNER' and status = 'ACTIVE'
  );
$$;

create or replace function public.bootstrap_admin_owner(
  p_user_id uuid,
  p_actor_subject text
)
returns table (
  user_id uuid,
  role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_membership public.admin_memberships%rowtype;
begin
  if p_user_id is null then
    raise exception 'INVALID_USER_ID';
  end if;
  if p_actor_subject is null or btrim(p_actor_subject) = '' then
    raise exception 'INVALID_ACTOR_SUBJECT';
  end if;

  perform pg_advisory_xact_lock(hashtext('crapi:bootstrap-admin-owner'));

  if exists (
    select 1 from public.admin_memberships
    where role = 'OWNER' and status = 'ACTIVE'
  ) then
    raise exception 'OWNER_ALREADY_BOOTSTRAPPED';
  end if;

  insert into public.admin_memberships (user_id, role, status, created_by)
  values (p_user_id, 'OWNER', 'ACTIVE', p_user_id)
  on conflict (user_id) do update
  set role = 'OWNER', status = 'ACTIVE', updated_at = now()
  returning * into v_membership;

  insert into public.admin_audit_log (
    actor_subject,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_actor_subject,
    'ADMIN_OWNER_BOOTSTRAPPED',
    'admin_membership',
    p_user_id::text,
    jsonb_build_object('role', 'OWNER')
  );

  return query
  select v_membership.user_id, v_membership.role, v_membership.status,
         v_membership.created_at, v_membership.updated_at;
end;
$$;

revoke all on function public.lookup_admin_membership(uuid) from public, anon, authenticated;
revoke all on function public.admin_owner_exists() from public, anon, authenticated;
revoke all on function public.bootstrap_admin_owner(uuid, text) from public, anon, authenticated;

grant execute on function public.lookup_admin_membership(uuid) to service_role;
grant execute on function public.admin_owner_exists() to service_role;
grant execute on function public.bootstrap_admin_owner(uuid, text) to service_role;
