type JsonRecord = Record<string, unknown>;

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

export class SupabaseServerClient {
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

  private async request<T>(path: string, init: RequestInit = {}, prefer?: string): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.secretKey);
    headers.set('accept', 'application/json');
    if (init.body !== undefined) headers.set('content-type', 'application/json');
    if (prefer) headers.set('prefer', prefer);

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new Error(`SUPABASE_REQUEST_FAILED:${response.status}`);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  rpc<T>(functionName: string, args: JsonRecord): Promise<T[]> {
    return this.request<T[]>(`/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
      method: 'POST',
      body: JSON.stringify(args),
    });
  }

  select<T>(table: string, query: URLSearchParams): Promise<T[]> {
    return this.request<T[]>(`/rest/v1/${encodeURIComponent(table)}?${query.toString()}`, {
      method: 'GET',
    });
  }

  insert<T>(table: string, body: JsonRecord): Promise<T[]> {
    return this.request<T[]>(
      `/rest/v1/${encodeURIComponent(table)}`,
      { method: 'POST', body: JSON.stringify(body) },
      'return=representation',
    );
  }

  update<T>(table: string, query: URLSearchParams, body: JsonRecord): Promise<T[]> {
    return this.request<T[]>(
      `/rest/v1/${encodeURIComponent(table)}?${query.toString()}`,
      { method: 'PATCH', body: JSON.stringify(body) },
      'return=representation',
    );
  }
}
