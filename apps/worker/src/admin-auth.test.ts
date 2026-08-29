import { describe, expect, it } from 'vitest';

import { authenticateAdminRequest } from './admin-auth.js';

const token = '0123456789abcdef0123456789abcdef';

describe('admin authentication', () => {
  it('accepts the configured control plane token', async () => {
    const request = new Request('https://crapi.test/admin/api/applications', {
      headers: { 'x-crapi-admin-token': token },
    });
    await expect(authenticateAdminRequest(request, token)).resolves.toBe(true);
  });

  it('rejects missing, short or different tokens', async () => {
    const missing = new Request('https://crapi.test/admin/api/applications');
    const wrong = new Request('https://crapi.test/admin/api/applications', {
      headers: { 'x-crapi-admin-token': token + 'x' },
    });

    await expect(authenticateAdminRequest(missing, token)).resolves.toBe(false);
    await expect(authenticateAdminRequest(wrong, token)).resolves.toBe(false);
    await expect(authenticateAdminRequest(wrong, 'short')).resolves.toBe(false);
  });
});
