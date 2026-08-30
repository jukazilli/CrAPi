type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type JsonObject = Record<string, unknown>;

export interface AuthUser {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthSessionResult {
  user: AuthUser | null;
  accessToken: string | null;
  setCookies: string[];
}

interface AuthResponseBody extends JsonObject {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user?: unknown;
}

const ACCESS_COOKIE = '__Host-crapi_at';
const REFRESH_COOKIE = '__Host-crapi_rt';
const MAX_REFRESH_COOKIE_AGE = 60 * 60 * 24 * 30;
const MIN_PASSWORD_LENGTH = 10;

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUser(value: unknown): AuthUser | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  return {
    id: value.id,
    email: typeof value.email === 'string' ? value.email : null,
    emailConfirmedAt:
      typeof value.email_confirmed_at === 'string' ? value.email_confirmed_at : null,
  };
}

function parseTokens(body: AuthResponseBody): AuthTokens | null {
  if (
    typeof body.access_token !== 'string' ||
    typeof body.refresh_token !== 'string' ||
    typeof body.expires_in !== 'number'
  ) {
    return null;
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: Math.max(Math.trunc(body.expires_in), 1),
  };
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies.set(name, value);
  }
  return cookies;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function sessionCookies(tokens: AuthTokens): string[] {
  return [
    cookie(ACCESS_COOKIE, tokens.accessToken, tokens.expiresIn),
    cookie(REFRESH_COOKIE, tokens.refreshToken, MAX_REFRESH_COOKIE_AGE),
  ];
}

export function clearSessionCookies(): string[] {
  return [cookie(ACCESS_COOKIE, '', 0), cookie(REFRESH_COOKIE, '', 0)];
}

export function appendSetCookies(response: Response, cookies: readonly string[]): Response {
  if (cookies.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const value of cookies) headers.append('set-cookie', value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function validateEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_EMAIL');
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('INVALID_EMAIL');
  }
  return email;
}

export function validatePassword(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_PASSWORD');
  if (value.length < MIN_PASSWORD_LENGTH || value.length > 128) throw new Error('INVALID_PASSWORD');
  return value;
}

export class SupabaseAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export class SupabaseAuthService {
  private readonly baseUrl: string;

  constructor(
    supabaseUrl: string,
    private readonly publishableKey: string,
    private readonly fetcher: Fetcher = fetch,
  ) {
    this.baseUrl = normalizeBaseUrl(supabaseUrl);
    if (publishableKey.length < 16 || publishableKey.includes('<')) {
      throw new Error('SUPABASE_PUBLISHABLE_KEY is not configured.');
    }
  }

  private async request<T extends JsonObject>(
    path: string,
    init: RequestInit = {},
    accessToken?: string,
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.publishableKey);
    headers.set('accept', 'application/json');
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers });
    const body = (await response.json().catch(() => ({}))) as JsonObject;
    if (!response.ok) {
      const rawCode =
        typeof body.code === 'string'
          ? body.code
          : typeof body.error_code === 'string'
            ? body.error_code
            : `HTTP_${response.status}`;
      throw new SupabaseAuthError(response.status, rawCode);
    }
    return body as T;
  }

  async signUp(email: string, password: string, redirectTo: string): Promise<{ tokens: AuthTokens | null }> {
    const query = new URLSearchParams({ redirect_to: redirectTo });
    const body = await this.request<AuthResponseBody>(`/auth/v1/signup?${query.toString()}`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return { tokens: parseTokens(body) };
  }

  async signIn(email: string, password: string): Promise<AuthTokens> {
    const body = await this.request<AuthResponseBody>('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const tokens = parseTokens(body);
    if (!tokens) throw new SupabaseAuthError(502, 'AUTH_SESSION_MISSING');
    return tokens;
  }

  async sendPasswordRecovery(email: string, redirectTo: string): Promise<void> {
    const query = new URLSearchParams({ redirect_to: redirectTo });
    await this.request(`/auth/v1/recover?${query.toString()}`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async verifyOtp(tokenHash: string, type: string): Promise<AuthTokens> {
    const allowedTypes = new Set(['email', 'signup', 'recovery', 'magiclink', 'invite', 'email_change']);
    if (!tokenHash || !allowedTypes.has(type)) throw new SupabaseAuthError(400, 'INVALID_AUTH_CALLBACK');
    const body = await this.request<AuthResponseBody>('/auth/v1/verify', {
      method: 'POST',
      body: JSON.stringify({ token_hash: tokenHash, type }),
    });
    const tokens = parseTokens(body);
    if (!tokens) throw new SupabaseAuthError(502, 'AUTH_SESSION_MISSING');
    return tokens;
  }

  async getUser(accessToken: string): Promise<AuthUser> {
    const body = await this.request<JsonObject>('/auth/v1/user', { method: 'GET' }, accessToken);
    const user = parseUser(body);
    if (!user) throw new SupabaseAuthError(502, 'AUTH_USER_MISSING');
    return user;
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const body = await this.request<AuthResponseBody>('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const tokens = parseTokens(body);
    if (!tokens) throw new SupabaseAuthError(401, 'REFRESH_FAILED');
    return tokens;
  }

  async updatePassword(accessToken: string, password: string): Promise<void> {
    await this.request('/auth/v1/user', {
      method: 'PUT',
      body: JSON.stringify({ password }),
    }, accessToken);
  }

  async logout(accessToken: string | null): Promise<void> {
    if (!accessToken) return;
    try {
      await this.request('/auth/v1/logout', { method: 'POST', body: '{}' }, accessToken);
    } catch (error) {
      if (!(error instanceof SupabaseAuthError) || error.status >= 500) throw error;
    }
  }

  async adoptSession(accessToken: string, refreshToken: string): Promise<AuthTokens> {
    if (!accessToken || !refreshToken) throw new SupabaseAuthError(400, 'INVALID_SESSION');
    await this.getUser(accessToken);
    return { accessToken, refreshToken, expiresIn: 3600 };
  }
}

export async function resolveSession(
  request: Request,
  auth: SupabaseAuthService,
): Promise<AuthSessionResult> {
  const cookies = parseCookies(request.headers.get('cookie'));
  const accessToken = cookies.get(ACCESS_COOKIE) ?? null;
  const refreshToken = cookies.get(REFRESH_COOKIE) ?? null;

  if (accessToken) {
    try {
      return { user: await auth.getUser(accessToken), accessToken, setCookies: [] };
    } catch (error) {
      if (!(error instanceof SupabaseAuthError) || error.status !== 401) throw error;
    }
  }

  if (!refreshToken) return { user: null, accessToken: null, setCookies: clearSessionCookies() };

  try {
    const refreshed = await auth.refresh(refreshToken);
    const user = await auth.getUser(refreshed.accessToken);
    return {
      user,
      accessToken: refreshed.accessToken,
      setCookies: sessionCookies(refreshed),
    };
  } catch (error) {
    if (error instanceof SupabaseAuthError && error.status < 500) {
      return { user: null, accessToken: null, setCookies: clearSessionCookies() };
    }
    throw error;
  }
}
