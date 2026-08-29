import { describe, expect, it } from 'vitest';

import { generateApiKey } from '@crapi/security';

import {
  authenticateApiRequest,
  type ApiKeyRepository,
} from './api-key-auth.js';

const pepper = '0123456789abcdef0123456789abcdef';

async function fixture(scopes: readonly string[] = ['registry:verify']) {
  const key = await generateApiKey('TEST', pepper);
  const repository: ApiKeyRepository = {
    async findByPrefix(keyPrefix) {
      if (keyPrefix !== key.keyPrefix) return null;
      return {
        id: 'key-1',
        applicationId: 'app-1',
        applicationStatus: 'ACTIVE',
        keyPrefix: key.keyPrefix,
        keyDigest: key.digest,
        status: 'ACTIVE',
        expiresAt: null,
        scopes,
      };
    },
  };
  return { key, repository };
}

describe('API key authentication', () => {
  it('authenticates a valid key with the required scope', async () => {
    const { key, repository } = await fixture();
    const request = new Request(
      'https://crapi.test/v1/professional-registrations/verify',
      {
        headers: { authorization: `Bearer ${key.rawKey}` },
      },
    );

    const result = await authenticateApiRequest(
      request,
      repository,
      pepper,
      'registry:verify',
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a malformed or unknown bearer without leaking details', async () => {
    const { repository } = await fixture();
    const request = new Request(
      'https://crapi.test/v1/professional-registrations/verify',
      {
        headers: { authorization: 'Bearer invalid' },
      },
    );

    await expect(
      authenticateApiRequest(request, repository, pepper, 'registry:verify'),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('returns forbidden when a valid key lacks scope', async () => {
    const { key, repository } = await fixture([]);
    const request = new Request(
      'https://crapi.test/v1/professional-registrations/verify',
      {
        headers: { authorization: `Bearer ${key.rawKey}` },
      },
    );

    await expect(
      authenticateApiRequest(request, repository, pepper, 'registry:verify'),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});
