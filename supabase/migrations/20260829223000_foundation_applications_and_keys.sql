-- CrAPi foundation: applications and API keys.
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

create table if not exists public.applications (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  name text not null check (char_length(name) between 2 and 120),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 120),
  environment text not null check (environment in ('TEST', 'LIVE')),
  key_prefix text not null unique check (key_prefix ~ '^prk_(test|live)_[A-Za-z0-9_-]{4,64}$'),
  key_digest text not null unique check (key_digest ~ '^[0-9a-f]{64}$'),
  last4 text not null check (last4 ~ '^[A-Za-z0-9_-]{4}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ROTATING', 'REVOKED', 'EXPIRED')),
  daily_limit integer not null default 1000 check (daily_limit between 1 and 1000000),
  expires_at timestamptz,
  last_used_at timestamptz,
  rotated_from_id uuid references public.api_keys(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > created_at)
);

create table if not exists public.api_key_scopes (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  scope text not null check (scope in ('registry:verify', 'registry:read', 'registry:batch')),
  created_at timestamptz not null default now(),
  primary key (api_key_id, scope)
);

create index if not exists idx_api_keys_application_status on public.api_keys (application_id, status);
create index if not exists idx_api_keys_prefix_status on public.api_keys (key_prefix, status);

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at before update on public.applications
for each row execute function private.set_updated_at();

drop trigger if exists api_keys_set_updated_at on public.api_keys;
create trigger api_keys_set_updated_at before update on public.api_keys
for each row execute function private.set_updated_at();

comment on column public.api_keys.key_digest is
  'HMAC-SHA256/hex digest using a server-side pepper. Raw API key is never stored.';
