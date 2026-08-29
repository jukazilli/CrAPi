import { describe, expect, it } from 'vitest';

import { digestApiKey, generateApiKey, parseApiKey, verifyApiKeyDigest } from '../src/api-key.js';

const pepper = '0123456789abcdef0123456789abcdef';

describe('API key security', () => {
  it('generates a parseable one-time secret and a non-reversible digest', async () => {
    const generated = await generateApiKey('TEST', pepper);

    expect(generated.rawKey).toMatch(/^prk_test_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/);
    expect(generated.keyPrefix).toMatch(/^prk_test_[0-9a-f]{16}$/);
    expect(generated.last4).toBe(generated.rawKey.slice(-4));
    expect(generated.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(generated.digest).not.toContain(generated.rawKey);
    expect(parseApiKey(generated.rawKey)).toEqual({
      environment: 'TEST',
      keyPrefix: generated.keyPrefix,
    });
  });

  it('uses HMAC-SHA256 and verifies only the original key', async () => {
    const generated = await generateApiKey('LIVE', pepper);
    const digest = await digestApiKey(generated.rawKey, pepper);

    expect(digest).toBe(generated.digest);
    expect(await verifyApiKeyDigest(generated.rawKey, digest, pepper)).toBe(true);
    expect(await verifyApiKeyDigest(`${generated.rawKey}x`, digest, pepper)).toBe(false);
  });

  it('rejects weak peppers', async () => {
    await expect(generateApiKey('TEST', 'too-short')).rejects.toThrow(/at least 32/);
  });
});
