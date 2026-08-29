-- CrAPi foundation: synchronization, request evidence and audit.
create table if not exists public.sync_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete restrict,
  partition_key text not null default 'default',
  mode text not null check (mode in ('FULL', 'INCREMENTAL', 'KNOWN_RECORDS', 'ON_DEMAND')),
  status text not null default 'RUNNING'
    check (status in ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED')),
  processed_count integer not null default 0 check (processed_count >= 0),
  new_count integer not null default 0 check (new_count >= 0),
  changed_count integer not null default 0 check (changed_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.sync_cursors (
  provider_id uuid not null references public.providers(id) on delete cascade,
  partition_key text not null default 'default',
  cursor_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (provider_id, partition_key)
);

create table if not exists public.sync_changes (
  id bigint generated always as identity primary key,
  sync_run_id uuid not null references public.sync_runs(id) on delete cascade,
  registry_id uuid references public.professional_registry(id) on delete set null,
  change_type text not null check (change_type in ('NEW', 'CHANGED', 'UNCHANGED', 'ERROR')),
  source_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id text not null unique check (char_length(request_id) between 8 and 120),
  application_id uuid references public.applications(id) on delete set null,
  api_key_id uuid references public.api_keys(id) on delete set null,
  route text not null,
  method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  http_status integer not null check (http_status between 100 and 599),
  query_result text check (
    query_result is null or query_result in ('FOUND', 'NOT_FOUND', 'INCONCLUSIVE', 'SOURCE_UNAVAILABLE')
  ),
  provider_id uuid references public.providers(id) on delete set null,
  registry_store_hit boolean not null default false,
  live_refresh boolean not null default false,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  ip_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.professional_verifications (
  id uuid primary key default extensions.gen_random_uuid(),
  api_request_id uuid references public.api_requests(id) on delete set null,
  registry_id uuid references public.professional_registry(id) on delete set null,
  council text not null check (council ~ '^[A-Z]{2,12}$'),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  registration_number text not null,
  query_result text not null
    check (query_result in ('FOUND', 'NOT_FOUND', 'INCONCLUSIVE', 'SOURCE_UNAVAILABLE')),
  registration_status text not null
    check (registration_status in ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CANCELLED', 'UNKNOWN')),
  status_semantics text not null check (status_semantics in ('EXPLICIT', 'INFERRED', 'UNKNOWN')),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  freshness_state text not null check (freshness_state in ('FRESH', 'AGING', 'STALE', 'UNKNOWN')),
  provider_id uuid references public.providers(id) on delete set null,
  source_live boolean not null default false,
  queried_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  application_id uuid references public.applications(id) on delete set null,
  api_key_id uuid references public.api_keys(id) on delete set null,
  event_type text not null,
  severity text not null check (severity in ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_subject text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sync_runs_provider_started on public.sync_runs (provider_id, started_at desc);
create index if not exists idx_api_requests_application_created on public.api_requests (application_id, created_at desc);
create index if not exists idx_api_requests_key_created on public.api_requests (api_key_id, created_at desc);
create index if not exists idx_security_events_created on public.security_events (created_at desc);
