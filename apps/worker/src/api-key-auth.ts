import { parseApiKey, verifyApiKeyDigest } from '@crapi/security';

export interface ApiKeyAuthRecord {
  id: string;
  applicationId: string;
  applicationStatus: 'ACTIVE' | 'DISABLED';
  keyPrefix: string;
  keyDigest: string;
  status: 'ACTIVE' | 'ROTATING' | 'REVOKED' | 'EXPIRED';
  expiresAt: string | null;
  scopes: readonly string[];
}

export interface ApiKeyRepository {
  findByPrefix(keyPrefix: string): Promise<ApiKeyAuthRecord | null>;
}

export interface ApiPrincipal {
  applicationId: string;
  apiKeyId: string;
  keyPrefix: string;
  scopes: readonly string[];
}

export type ApiAuthenticationResult =
  | { ok: true; principal: ApiPrincipal }
  | { ok: false; status: 401 | 403; code: 'UNAUTHORIZED' | 'FORBIDDEN' };

function extractBearer(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (authorization === null) return null;

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match?.[1] ?? null;
}

export async function authenticateApiRequest(
  request: Request,
  repository: ApiKeyRepository,
  pepper: string,
  requiredScope: string,
  now = new Date(),
): Promise<ApiAuthenticationResult> {
  const rawKey = extractBearer(request);
  if (rawKey === null) return { ok: false, status: 401, code: 'UNAUTHORIZED' };

  const parsed = parseApiKey(rawKey);
  if (parsed === null) return { ok: false, status: 401, code: 'UNAUTHORIZED' };

  const record = await repository.findByPrefix(parsed.keyPrefix);
  if (record === null || record.keyPrefix !== parsed.keyPrefix) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  }

  if (record.applicationStatus !== 'ACTIVE') {
    return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  }

  if (record.status !== 'ACTIVE' && record.status !== 'ROTATING') {
    return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  }

  if (record.expiresAt !== null && new Date(record.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  }

  if (!(await verifyApiKeyDigest(rawKey, record.keyDigest, pepper))) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED' };
  }

  if (!record.scopes.includes(requiredScope)) {
    return { ok: false, status: 403, code: 'FORBIDDEN' };
  }

  return {
    ok: true,
    principal: {
      applicationId: record.applicationId,
      apiKeyId: record.id,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
    },
  };
}
