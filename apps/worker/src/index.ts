interface Env {
  APP_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  API_KEY_PEPPER?: string;
}

interface WorkerHandler {
  fetch(request: Request, env: Env): Promise<Response>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

const worker: WorkerHandler = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        status: 'ok',
        service: 'crapi',
        environment: env.APP_ENV ?? 'unknown',
      });
    }

    if (request.method === 'GET' && url.pathname === '/ready') {
      const databaseConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);
      const securityConfigured = Boolean(env.API_KEY_PEPPER);

      if (!databaseConfigured || !securityConfigured) {
        return json(
          {
            status: 'not_ready',
            dependencies: {
              database: databaseConfigured ? 'configured' : 'missing',
              api_key_pepper: securityConfigured ? 'configured' : 'missing',
            },
          },
          503,
        );
      }

      return json({
        status: 'ready',
        dependencies: { database: 'configured', api_key_pepper: 'configured' },
      });
    }

    return json({ error: 'NOT_FOUND', message: 'Route not found.' }, 404);
  },
};

export default worker;
