-- CrAPi foundation: cover foreign keys reported by Supabase performance advisor.
create index if not exists idx_api_keys_rotated_from_id
  on public.api_keys (rotated_from_id)
  where rotated_from_id is not null;

create index if not exists idx_api_requests_provider_id
  on public.api_requests (provider_id)
  where provider_id is not null;

create index if not exists idx_registry_history_provider_id
  on public.professional_registry_history (provider_id)
  where provider_id is not null;

create index if not exists idx_professional_verifications_api_request_id
  on public.professional_verifications (api_request_id)
  where api_request_id is not null;

create index if not exists idx_professional_verifications_provider_id
  on public.professional_verifications (provider_id)
  where provider_id is not null;

create index if not exists idx_professional_verifications_registry_id
  on public.professional_verifications (registry_id)
  where registry_id is not null;

create index if not exists idx_security_events_api_key_id
  on public.security_events (api_key_id)
  where api_key_id is not null;

create index if not exists idx_security_events_application_id
  on public.security_events (application_id)
  where application_id is not null;

create index if not exists idx_sync_changes_registry_id
  on public.sync_changes (registry_id)
  where registry_id is not null;

create index if not exists idx_sync_changes_sync_run_id
  on public.sync_changes (sync_run_id);
