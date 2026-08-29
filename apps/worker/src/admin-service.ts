import { generateApiKey, type ApiKeyEnvironment } from '@crapi/security';

import type { SupabaseServerClient } from './supabase-server-client.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const ALLOWED_SCOPES = new Set(['registry:verify', 'registry:read', 'registry:batch']);

interface ApplicationRow {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  created_at: string;
  updated_at?: string;
}

interface ApiKeyRow {
  id: string;
  application_id: string;
  name: string;
  environment: ApiKeyEnvironment;
  key_prefix: string;
  last4: string;
  status: 'ACTIVE' | 'ROTATING' | 'REVOKED' | 'EXPIRED';
  daily_limit: number;
  expires_at: string | null;
  created_at: string;
  revoked_at?: string | null;
}

interface ApiKeyScopeRow {
  api_key_id: string;
  scope: string;
}

interface AuditRow {
  id: number;
  actor_subject: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CreateApplicationInput {
  slug: string;
  name: string;
}

export interface CreateApiKeyInput {
  name: string;
  environment: ApiKeyEnvironment;
  dailyLimit: number;
  expiresAt: string | null;
  scopes: string[];
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error('INVALID_ID');
}

function parseApplicationInput(input: unknown): CreateApplicationInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('INVALID_BODY');
  }

  const source = input as Record<string, unknown>;
  const slug = typeof source.slug === 'string' ? source.slug.trim().toLowerCase() : '';
  const name = typeof source.name === 'string' ? source.name.trim() : '';

  if (!SLUG_PATTERN.test(slug)) throw new Error('INVALID_APPLICATION_SLUG');
  if (name.length < 2 || name.length > 120) throw new Error('INVALID_APPLICATION_NAME');
  return { slug, name };
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error('INVALID_EXPIRATION');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
    throw new Error('INVALID_EXPIRATION');
  }
  return parsed.toISOString();
}

function parseApiKeyInput(input: unknown): CreateApiKeyInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('INVALID_BODY');
  }

  const source = input as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const environment =
    source.environment === 'LIVE' ? 'LIVE' : source.environment === 'TEST' ? 'TEST' : null;
  const dailyLimit = typeof source.daily_limit === 'number' ? source.daily_limit : 1000;
  const scopes = Array.isArray(source.scopes)
    ? [...new Set(source.scopes.filter((scope): scope is string => typeof scope === 'string'))]
    : ['registry:verify'];

  if (name.length < 2 || name.length > 120) throw new Error('INVALID_KEY_NAME');
  if (environment === null) throw new Error('INVALID_KEY_ENVIRONMENT');
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1_000_000) {
    throw new Error('INVALID_DAILY_LIMIT');
  }
  if (scopes.length === 0 || scopes.some((scope) => !ALLOWED_SCOPES.has(scope))) {
    throw new Error('INVALID_SCOPES');
  }

  return {
    name,
    environment,
    dailyLimit,
    expiresAt: parseDate(source.expires_at),
    scopes,
  };
}

export class AdminService {
  constructor(
    private readonly db: SupabaseServerClient,
    private readonly apiKeyPepper: string,
    private readonly actorSubject = 'control-plane:admin-token',
  ) {}

  async listApplications(): Promise<ApplicationRow[]> {
    const query = new URLSearchParams({
      select: 'id,slug,name,status,created_at,updated_at',
      order: 'created_at.desc',
    });
    return this.db.select<ApplicationRow>('applications', query);
  }

  async createApplication(input: unknown): Promise<ApplicationRow> {
    const parsed = parseApplicationInput(input);
    const rows = await this.db.rpc<ApplicationRow>('admin_create_application', {
      p_slug: parsed.slug,
      p_name: parsed.name,
      p_actor_subject: this.actorSubject,
    });
    const application = rows[0];
    if (!application) throw new Error('APPLICATION_CREATE_FAILED');
    return application;
  }

  async listApiKeys(applicationId: string): Promise<Array<ApiKeyRow & { scopes: string[] }>> {
    assertUuid(applicationId);
    const keyQuery = new URLSearchParams({
      select:
        'id,application_id,name,environment,key_prefix,last4,status,daily_limit,expires_at,created_at,revoked_at',
      application_id: `eq.${applicationId}`,
      order: 'created_at.desc',
    });
    const scopeQuery = new URLSearchParams({
      select: 'api_key_id,scope',
      order: 'scope.asc',
    });
    const [keys, scopes] = await Promise.all([
      this.db.select<ApiKeyRow>('api_keys', keyQuery),
      this.db.select<ApiKeyScopeRow>('api_key_scopes', scopeQuery),
    ]);

    return keys.map((key) => ({
      ...key,
      scopes: scopes.filter((scope) => scope.api_key_id === key.id).map((scope) => scope.scope),
    }));
  }

  async createApiKey(applicationId: string, input: unknown) {
    assertUuid(applicationId);
    const parsed = parseApiKeyInput(input);
    const generated = await generateApiKey(parsed.environment, this.apiKeyPepper);

    const rows = await this.db.rpc<ApiKeyRow & { scopes: string[] }>('admin_create_api_key', {
      p_application_id: applicationId,
      p_name: parsed.name,
      p_environment: parsed.environment,
      p_key_prefix: generated.keyPrefix,
      p_key_digest: generated.digest,
      p_last4: generated.last4,
      p_daily_limit: parsed.dailyLimit,
      p_expires_at: parsed.expiresAt,
      p_scopes: parsed.scopes,
      p_actor_subject: this.actorSubject,
    });
    const stored = rows[0];
    if (!stored) throw new Error('API_KEY_CREATE_FAILED');

    return {
      ...stored,
      raw_key: generated.rawKey,
      warning: 'Copy this key now. The raw value is never stored and cannot be recovered.',
    };
  }

  async revokeApiKey(apiKeyId: string) {
    assertUuid(apiKeyId);
    const rows = await this.db.rpc<ApiKeyRow>('admin_revoke_api_key', {
      p_api_key_id: apiKeyId,
      p_actor_subject: this.actorSubject,
    });
    const revoked = rows[0];
    if (!revoked) throw new Error('API_KEY_REVOKE_FAILED');
    return revoked;
  }

  async rotateApiKey(apiKeyId: string, input: unknown) {
    assertUuid(apiKeyId);
    const keyQuery = new URLSearchParams({
      select:
        'id,application_id,name,environment,key_prefix,last4,status,daily_limit,expires_at,created_at',
      id: `eq.${apiKeyId}`,
      limit: '1',
    });
    const existing = (await this.db.select<ApiKeyRow>('api_keys', keyQuery))[0];
    if (!existing) throw new Error('API_KEY_NOT_FOUND');

    const source =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)
        : {};
    const name =
      typeof source.name === 'string' && source.name.trim().length >= 2
        ? source.name.trim()
        : `${existing.name} rotation`;
    const expiresAt = parseDate(source.expires_at);
    const generated = await generateApiKey(existing.environment, this.apiKeyPepper);

    const rows = await this.db.rpc<{
      old_key_id: string;
      old_key_status: string;
      new_key_id: string;
      application_id: string;
      environment: ApiKeyEnvironment;
      key_prefix: string;
      last4: string;
      daily_limit: number;
      expires_at: string | null;
      scopes: string[];
      created_at: string;
    }>('admin_rotate_api_key', {
      p_api_key_id: apiKeyId,
      p_name: name,
      p_key_prefix: generated.keyPrefix,
      p_key_digest: generated.digest,
      p_last4: generated.last4,
      p_expires_at: expiresAt,
      p_actor_subject: this.actorSubject,
    });
    const rotated = rows[0];
    if (!rotated) throw new Error('API_KEY_ROTATE_FAILED');

    return {
      ...rotated,
      raw_key: generated.rawKey,
      warning: 'Copy the new key now. Revoke the old ROTATING key after consumers switch.',
    };
  }

  async listAudit(limit = 50): Promise<AuditRow[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200);
    const query = new URLSearchParams({
      select: 'id,actor_subject,action,entity_type,entity_id,metadata,created_at',
      order: 'created_at.desc',
      limit: String(safeLimit),
    });
    return this.db.select<AuditRow>('admin_audit_log', query);
  }
}
