-- CrAPi foundation: deny public Data API access and allow server runtime only.
alter table public.applications enable row level security;
alter table public.api_keys enable row level security;
alter table public.api_key_scopes enable row level security;
alter table public.providers enable row level security;
alter table public.provider_health enable row level security;
alter table public.professional_registry enable row level security;
alter table public.professional_registry_history enable row level security;
alter table public.sync_runs enable row level security;
alter table public.sync_cursors enable row level security;
alter table public.sync_changes enable row level security;
alter table public.api_requests enable row level security;
alter table public.professional_verifications enable row level security;
alter table public.security_events enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on
  public.applications, public.api_keys, public.api_key_scopes,
  public.providers, public.provider_health,
  public.professional_registry, public.professional_registry_history,
  public.sync_runs, public.sync_cursors, public.sync_changes,
  public.api_requests, public.professional_verifications,
  public.security_events, public.admin_audit_log
from anon, authenticated;

revoke all on
  public.professional_registry_history_id_seq,
  public.sync_changes_id_seq,
  public.security_events_id_seq,
  public.admin_audit_log_id_seq
from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.applications, public.api_keys, public.api_key_scopes,
  public.providers, public.provider_health,
  public.professional_registry, public.sync_runs, public.sync_cursors
to service_role;

grant select, insert on
  public.professional_registry_history, public.sync_changes,
  public.api_requests, public.professional_verifications,
  public.security_events, public.admin_audit_log
to service_role;

grant usage, select on
  public.professional_registry_history_id_seq,
  public.sync_changes_id_seq,
  public.security_events_id_seq,
  public.admin_audit_log_id_seq
to service_role;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
