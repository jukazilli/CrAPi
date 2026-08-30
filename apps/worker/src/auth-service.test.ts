import { describe, expect, it, vi } from 'vitest';

import { resolveSession, SupabaseAuthService } from './auth-service.js';

describe('SupabaseAuthService', () => {
  it('signs in with the publishable key and never treats it as a bearer secret', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://project.supabase.co/auth/v1/token?grant_type=password');
      const headers = new Headers(init?.headers);
      expect(headers.get('apikey')).toBe('sb_publishable_test_key_1234567890');
      expect(headers.get('authorization')).toBeNull();
      expect(JSON.parse(String(init?.body))).toEqual({
        email: 'owner@example.com',
        password: 'a-strong-password',
      });
      return new Response(
        JSON.stringify({
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          expires_in: 3600,
          user: { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.com' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const auth = new SupabaseAuthService(
      'https://project.supabase.co',
      'sb_publishable_test_key_1234567890',
      fetcher,
    );
    const session = await auth.signIn('owner@example.com', 'a-strong-password');

    expect(session.accessToken).toBe('access-token');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('validates the HttpOnly session token against the Auth service before trusting the user', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://project.supabase.co/auth/v1/user');
      const headers = new Headers(init?.headers);
      expect(headers.get('apikey')).toBe('sb_publishable_test_key_1234567890');
      expect(headers.get('authorization')).toBe('Bearer user-access-token');
      return new Response(
        JSON.stringify({
          id: '00000000-0000-4000-8000-000000000001',
          email: 'owner@example.com',
          email_confirmed_at: '2026-08-30T00:00:00Z',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    const auth = new SupabaseAuthService(
      'https://project.supabase.co',
      'sb_publishable_test_key_1234567890',
      fetcher,
    );
    const request = new Request('https://crapi.test/admin', {
      headers: { cookie: '__Host-crapi_at=user-access-token; __Host-crapi_rt=refresh-token' },
    });
    const session = await resolveSession(request, auth);

    expect(session.user?.email).toBe('owner@example.com');
    expect(session.accessToken).toBe('user-access-token');
    expect(session.setCookies).toEqual([]);
  });

  it('refreshes an expired browser session and emits Secure HttpOnly cookies', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/token?grant_type=refresh_token')) {
        expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'old-refresh-token' });
        return new Response(
          JSON.stringify({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/auth/v1/user')) {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer new-access-token');
        return new Response(
          JSON.stringify({
            id: '00000000-0000-4000-8000-000000000001',
            email: 'owner@example.com',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const auth = new SupabaseAuthService(
      'https://project.supabase.co',
      'sb_publishable_test_key_1234567890',
      fetcher,
    );
    const request = new Request('https://crapi.test/admin', {
      headers: { cookie: '__Host-crapi_rt=old-refresh-token' },
    });
    const session = await resolveSession(request, auth);

    expect(session.accessToken).toBe('new-access-token');
    expect(session.setCookies).toHaveLength(2);
    expect(session.setCookies[0]).toContain('HttpOnly');
    expect(session.setCookies[0]).toContain('Secure');
    expect(session.setCookies[0]).toContain('SameSite=Strict');
    expect(session.setCookies[1]).toContain('__Host-crapi_rt=new-refresh-token');
  });
});
