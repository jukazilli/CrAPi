import { describe, expect, it, vi } from 'vitest';

import { SupabaseApiKeyRepository } from './supabase-api-key-repository.js';

const secret = 'sb_secret_test_only_value_123456789';

describe('SupabaseApiKeyRepository', () => {
  it('performs a single server-only RPC lookup and maps the record', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.supabase.co/rest/v1/rpc/lookup_api_key_auth');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('apikey')).toBe(secret);
      expect(new Headers(init?.headers).get('authorization')).toBeNull();
      expect(init?.body).toBe(JSON.stringify({ p_key_prefix: 'prk_test_0123456789abcdef' }));

      return new Response(
        JSON.stringify([
          {
            id: 'key-id',
            application_id: 'app-id',
            application_status: 'ACTIVE',
            key_prefix: 'prk_test_0123456789abcdef',
            key_digest: 'a'.repeat(64),
            key_status: 'ACTIVE',
            expires_at: null,
            scopes: ['registry:verify'],
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const repository = new SupabaseApiKeyRepository(
      'https://example.supabase.co/',
      secret,
      fetcher,
    );

    await expect(repository.findByPrefix('prk_test_0123456789abcdef')).resolves.toEqual({
      id: 'key-id',
      applicationId: 'app-id',
      applicationStatus: 'ACTIVE',
      keyPrefix: 'prk_test_0123456789abcdef',
      keyDigest: 'a'.repeat(64),
      status: 'ACTIVE',
      expiresAt: null,
      scopes: ['registry:verify'],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns null when the RPC returns no matching key', async () => {
    const fetcher = vi.fn(async () => new Response('[]', { status: 200 }));
    const repository = new SupabaseApiKeyRepository('https://example.supabase.co', secret, fetcher);

    await expect(repository.findByPrefix('prk_test_0123456789abcdef')).resolves.toBeNull();
  });

  it('fails closed when Supabase returns an error or an invalid payload', async () => {
    const failedFetch = vi.fn(async () => new Response('{}', { status: 503 }));
    const failedRepository = new SupabaseApiKeyRepository(
      'https://example.supabase.co',
      secret,
      failedFetch,
    );

    await expect(failedRepository.findByPrefix('prk_test_0123456789abcdef')).rejects.toThrow(
      'SUPABASE_AUTH_LOOKUP_FAILED:503',
    );

    const invalidFetch = vi.fn(async () => new Response('[{"id":"partial"}]', { status: 200 }));
    const invalidRepository = new SupabaseApiKeyRepository(
      'https://example.supabase.co',
      secret,
      invalidFetch,
    );

    await expect(invalidRepository.findByPrefix('prk_test_0123456789abcdef')).rejects.toThrow(
      'SUPABASE_AUTH_LOOKUP_INVALID_RESPONSE',
    );
  });
});
