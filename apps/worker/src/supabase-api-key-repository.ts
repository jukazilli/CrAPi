import type { ApiKeyAuthRecord, ApiKeyRepository } from './api-key-auth.js';

interface SupabaseApiKeyAuthRow {
  id: string;
  application_id: string;
  application_status: 'ACTIVE' | 'DISABLED';
  key_prefix: string;
  key_digest: string;
  key_status: 'ACTIVE' | 'ROTATING' | 'REVOKED' | 'EXPIRED';
  expires_at: string | null;
  scopes: string[];
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('SUPABASE_URL must use HTTPS.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function isAuthRow(value: unknown): value is SupabaseApiKeyAuthRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;

  return (
    typeof row.id === 'string' &&
    typeof row.application_id === 'string' &&
    (row.application_status === 'ACTIVE' || row.application_status === 'DISABLED') &&
    typeof row.key_prefix === 'string' &&
    typeof row.key_digest === 'string' &&
    ['ACTIVE', 'ROTATING', 'REVOKED', 'EXPIRED'].includes(String(row.key_status)) &&
    (row.expires_at === null || typeof row.expires_at === 'string') &&
    Array.isArray(row.scopes) &&
    row.scopes.every((scope) => typeof scope === 'string')
  );
}

export class SupabaseApiKeyRepository implements ApiKeyRepository {
  private readonly baseUrl: string;

  constructor(
    supabaseUrl: string,
    private readonly secretKey: string,
    private readonly fetcher: Fetcher = fetch,
  ) {
    this.baseUrl = normalizeBaseUrl(supabaseUrl);
    if (secretKey.length < 16 || secretKey.includes('<')) {
      throw new Error('SUPABASE_SECRET_KEY is not configured.');
    }
  }

  async findByPrefix(keyPrefix: string): Promise<ApiKeyAuthRecord | null> {
    const response = await this.fetcher(`${this.baseUrl}/rest/v1/rpc/lookup_api_key_auth`, {
      method: 'POST',
      headers: {
        apikey: this.secretKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ p_key_prefix: keyPrefix }),
    });

    if (!response.ok) {
      throw new Error(`SUPABASE_AUTH_LOOKUP_FAILED:${response.status}`);
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) return null;

    const row = payload[0];
    if (!isAuthRow(row)) {
      throw new Error('SUPABASE_AUTH_LOOKUP_INVALID_RESPONSE');
    }

    return {
      id: row.id,
      applicationId: row.application_id,
      applicationStatus: row.application_status,
      keyPrefix: row.key_prefix,
      keyDigest: row.key_digest,
      status: row.key_status,
      expiresAt: row.expires_at,
      scopes: row.scopes,
    };
  }
}
