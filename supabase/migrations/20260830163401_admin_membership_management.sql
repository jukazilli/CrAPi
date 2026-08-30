create or replace function public.list_admin_memberships(p_actor_user_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.admin_memberships m
    where m.user_id = p_actor_user_id
      and m.role = 'OWNER'
      and m.status = 'ACTIVE'
  ) then
    raise exception 'OWNER_REQUIRED';
  end if;

  return query
  select
    m.user_id,
    u.email::text,
    m.role,
    m.status,
    m.created_at,
    m.updated_at
  from public.admin_memberships m
  join auth.users u on u.id = m.user_id
  order by
    case when m.role = 'OWNER' then 0 else 1 end,
    lower(u.email);
end;
$$;

create or replace function public.grant_admin_membership_by_email(
  p_actor_user_id uuid,
  p_email text
)
returns table (
  user_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target auth.users%rowtype;
  v_membership public.admin_memberships%rowtype;
begin
  if not exists (
    select 1
    from public.admin_memberships m
    where m.user_id = p_actor_user_id
      and m.role = 'OWNER'
      and m.status = 'ACTIVE'
  ) then
    raise exception 'OWNER_REQUIRED';
  end if;

  if p_email is null or btrim(p_email) = '' then
    raise exception 'INVALID_EMAIL';
  end if;

  select * into v_target
  from auth.users
  where lower(email) = lower(btrim(p_email))
  limit 1;

  if v_target.id is null then
    raise exception 'ADMIN_USER_NOT_FOUND';
  end if;

  if v_target.email_confirmed_at is null then
    raise exception 'ADMIN_EMAIL_NOT_CONFIRMED';
  end if;

  if exists (
    select 1
    from public.admin_memberships m
    where m.user_id = v_target.id
      and m.role = 'OWNER'
  ) then
    raise exception 'TARGET_IS_OWNER';
  end if;

  insert into public.admin_memberships (user_id, role, status, created_by)
  values (v_target.id, 'ADMIN', 'ACTIVE', p_actor_user_id)
  on conflict (user_id) do update
  set role = 'ADMIN',
      status = 'ACTIVE',
      updated_at = now()
  returning * into v_membership;

  insert into public.admin_audit_log (
    actor_subject,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    'auth-user:' || p_actor_user_id::text,
    'ADMIN_MEMBERSHIP_GRANTED',
    'admin_membership',
    v_target.id::text,
    jsonb_build_object('role', 'ADMIN')
  );

  return query
  select
    v_membership.user_id,
    v_target.email::text,
    v_membership.role,
    v_membership.status,
    v_membership.created_at,
    v_membership.updated_at;
end;
$$;

create or replace function public.revoke_admin_membership(
  p_actor_user_id uuid,
  p_target_user_id uuid
)
returns table (
  user_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target auth.users%rowtype;
  v_membership public.admin_memberships%rowtype;
begin
  if not exists (
    select 1
    from public.admin_memberships m
    where m.user_id = p_actor_user_id
      and m.role = 'OWNER'
      and m.status = 'ACTIVE'
  ) then
    raise exception 'OWNER_REQUIRED';
  end if;

  if p_target_user_id is null then
    raise exception 'INVALID_USER_ID';
  end if;

  if p_target_user_id = p_actor_user_id then
    raise exception 'OWNER_SELF_REVOKE_FORBIDDEN';
  end if;

  select * into v_target
  from auth.users
  where id = p_target_user_id
  limit 1;

  if v_target.id is null then
    raise exception 'ADMIN_USER_NOT_FOUND';
  end if;

  select * into v_membership
  from public.admin_memberships
  where user_id = p_target_user_id
  limit 1;

  if v_membership.user_id is null then
    raise exception 'ADMIN_MEMBERSHIP_NOT_FOUND';
  end if;

  if v_membership.role = 'OWNER' then
    raise exception 'OWNER_REVOKE_FORBIDDEN';
  end if;

  update public.admin_memberships
  set status = 'REVOKED',
      updated_at = now()
  where user_id = p_target_user_id
  returning * into v_membership;

  insert into public.admin_audit_log (
    actor_subject,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    'auth-user:' || p_actor_user_id::text,
    'ADMIN_MEMBERSHIP_REVOKED',
    'admin_membership',
    p_target_user_id::text,
    jsonb_build_object('role', v_membership.role)
  );

  return query
  select
    v_membership.user_id,
    v_target.email::text,
    v_membership.role,
    v_membership.status,
    v_membership.created_at,
    v_membership.updated_at;
end;
$$;

revoke all on function public.list_admin_memberships(uuid) from public, anon, authenticated;
revoke all on function public.grant_admin_membership_by_email(uuid, text) from public, anon, authenticated;
revoke all on function public.revoke_admin_membership(uuid, uuid) from public, anon, authenticated;

grant execute on function public.list_admin_memberships(uuid) to service_role;
grant execute on function public.grant_admin_membership_by_email(uuid, text) to service_role;
grant execute on function public.revoke_admin_membership(uuid, uuid) to service_role;
