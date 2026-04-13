import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const PROXIED_PATHS = new Set(['/api/specialties', '/api/cases/webhook/case-created']);

function getProxyTarget(env) {
  return (env.API_REMOTE_BASE_URL || '').replace(/\/$/, '');
}

function buildUpstreamHeaders(req, env) {
  const headers = {
    accept: req.headers.accept || 'application/json'
  };

  if (req.headers['content-type']) {
    headers['content-type'] = req.headers['content-type'];
  }

  if (env.API_AUTH_HEADER && env.API_AUTH_VALUE) {
    headers[env.API_AUTH_HEADER] = env.API_AUTH_VALUE;
  }

  if (env.API_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${env.API_BEARER_TOKEN}`;
  }

  return headers;
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function createApiProxyPlugin(env) {
  const target = getProxyTarget(env);

  async function handleProxy(req, res) {
    const requestPath = req.url?.split('?')[0] || '';

    if (!target || !PROXIED_PATHS.has(requestPath)) {
      return false;
    }

    const upstreamResponse = await fetch(`${target}${requestPath.replace(/^\/api/, '')}`, {
      method: req.method,
      headers: buildUpstreamHeaders(req, env),
      body: await readRequestBody(req)
    });

    res.statusCode = upstreamResponse.status;

    const contentType = upstreamResponse.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    const payload = await upstreamResponse.text();
    res.end(payload);
    return true;
  }

  return {
    name: 'local-api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await handleProxy(req, res)) {
          return;
        }

        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await handleProxy(req, res)) {
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), createApiProxyPlugin(env)],
    server: {
      port: 5173
    },
    preview: {
      port: 4173
    }
  };
});
