-- CrAPi foundation: providers and canonical registry store.
create table if not exists public.providers (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  council text not null check (council ~ '^[A-Z]{2,12}$'),
  name text not null check (char_length(name) between 2 and 160),
  authority text not null check (char_length(authority) between 2 and 160),
  base_url text,
  sync_mode text not null default 'ON_DEMAND'
    check (sync_mode in ('FULL', 'INCREMENTAL', 'KNOWN_RECORDS', 'ON_DEMAND')),
  status text not null default 'DISABLED'
    check (status in ('OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'DISABLED')),
  fresh_for_minutes integer not null default 1440 check (fresh_for_minutes between 1 and 10080),
  stale_after_minutes integer not null default 10080 check (stale_after_minutes between 1 and 43200),
  scheduled_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stale_after_minutes >= fresh_for_minutes)
);

create table if not exists public.provider_health (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  status text not null default 'DISABLED'
    check (status in ('OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'DISABLED')),
  circuit_state text not null default 'CLOSED'
    check (circuit_state in ('CLOSED', 'OPEN', 'HALF_OPEN')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_registry (
  id uuid primary key default extensions.gen_random_uuid(),
  council text not null check (council ~ '^[A-Z]{2,12}$'),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  registration_number text not null check (char_length(registration_number) between 1 and 80),
  normalized_registration text not null check (char_length(normalized_registration) between 1 and 80),
  professional_name text,
  registration_status text not null default 'UNKNOWN'
    check (registration_status in ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CANCELLED', 'UNKNOWN')),
  status_semantics text not null default 'UNKNOWN'
    check (status_semantics in ('EXPLICIT', 'INFERRED', 'UNKNOWN')),
  regional_council text,
  category text,
  provider_id uuid references public.providers(id) on delete set null,
  source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  freshness_state text not null default 'UNKNOWN'
    check (freshness_state in ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  acquisition_mode text not null default 'SCHEDULED'
    check (acquisition_mode in ('SCHEDULED', 'ON_DEMAND', 'MANUAL')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (council, uf, normalized_registration)
);

create table if not exists public.professional_registry_history (
  id bigint generated always as identity primary key,
  registry_id uuid not null references public.professional_registry(id) on delete restrict,
  provider_id uuid references public.providers(id) on delete set null,
  change_type text not null check (change_type in ('CREATED', 'STATUS_CHANGED', 'DATA_CHANGED', 'SOURCE_CHANGED')),
  previous_snapshot jsonb,
  new_snapshot jsonb not null,
  source_hash text check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$'),
  changed_at timestamptz not null default now()
);

create index if not exists idx_registry_freshness on public.professional_registry (freshness_state, last_verified_at);
create index if not exists idx_registry_provider on public.professional_registry (provider_id, last_seen_at);
create index if not exists idx_registry_history_registry_changed
  on public.professional_registry_history (registry_id, changed_at desc);

drop trigger if exists providers_set_updated_at on public.providers;
create trigger providers_set_updated_at before update on public.providers
for each row execute function private.set_updated_at();

drop trigger if exists professional_registry_set_updated_at on public.professional_registry;
create trigger professional_registry_set_updated_at before update on public.professional_registry
for each row execute function private.set_updated_at();

comment on table public.professional_registry is
  'Canonical operational snapshot. Absence from a sync never implies inactive/cancelled.';
comment on table public.professional_registry_history is
  'Append-only relevant changes observed from official providers.';
