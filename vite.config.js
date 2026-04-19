import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const PROXIED_PATHS = new Set(['/api/specialties', '/api/cases/webhook/case-created']);

function isProxiedPath(requestPath) {
  if (PROXIED_PATHS.has(requestPath)) return true;
  // /api/cases/{id}/attachments
  if (/^\/api\/cases\/[^/]+\/attachments$/.test(requestPath)) return true;
  return false;
}

function extractAttachmentsFromWebhookPayload(requestJson) {
  const data = requestJson?.data;
  if (!data || typeof data !== 'object') return [];
  const direct = Array.isArray(data.attachments) ? data.attachments : [];
  const seen = new Set();
  const result = [];
  for (const item of direct) {
    const url = item?.url || item?.fileUrl || '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({
      url,
      fileName: item.fileName || item.name || '',
      mimeType: item.mimeType || item.type || 'application/octet-stream',
      sizeBytes: item.sizeBytes || item.size || 0
    });
  }
  return result;
}
const DEFAULT_UPLOADTHING_PROXY_URL = 'https://telemedicine-dashboard.vercel.app/api/uploadthing';
const FALLBACK_UPLOADTHING_PROXY_URL = 'https://doctor-telemedicine-server.vercel.app/api/uploadthing';

function getProxyTarget(env) {
  return (env.API_REMOTE_BASE_URL || '').replace(/\/$/, '');
}

function buildUpstreamHeaders(req, env, skipAuth = false) {
  const requestHeaders = req && typeof req.headers === 'object' && req.headers ? req.headers : {};
  const headers = {
    accept: requestHeaders.accept || 'application/json'
  };

  if (requestHeaders['content-type']) {
    headers['content-type'] = requestHeaders['content-type'];
  }

  if (!skipAuth && env.API_AUTH_HEADER && env.API_AUTH_VALUE) {
    headers[env.API_AUTH_HEADER] = env.API_AUTH_VALUE;
  }

  if (!skipAuth && env.API_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${env.API_BEARER_TOKEN}`;
  }

  return headers;
}

function buildUploadthingHeaders(req) {
  const requestHeaders = req && typeof req.headers === 'object' && req.headers ? req.headers : {};
  const headers = {
    accept: requestHeaders.accept || '*/*'
  };

  if (requestHeaders['content-type']) {
    headers['content-type'] = requestHeaders['content-type'];
  }

  for (const [name, value] of Object.entries(requestHeaders)) {
    if (typeof value !== 'string') continue;
    if (name.startsWith('x-uploadthing-')) {
      headers[name] = value;
    }
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

function normalizeUploadthingResponsePayload(payload, queryString) {
  if (!queryString.includes('actionType=upload')) {
    return payload;
  }

  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return payload;

    const normalized = parsed.map((item) => {
      if (!item || typeof item !== 'object') return item;
      return {
        ...item,
        fileName: item.fileName || item.name,
        fileUrl: item.fileUrl && !item.fileUrl.includes('ingest.uploadthing.com') ? item.fileUrl : undefined,
        fields: item.fields && typeof item.fields === 'object' ? item.fields : {},
      };
    });

    return JSON.stringify(normalized);
  } catch (_e) {
    return payload;
  }
}

function isMissingUploadthingRoute(response) {
  return response.status === 404 || response.status === 405;
}

function createApiProxyPlugin(env) {
  const target = getProxyTarget(env);
  const uploadthingTarget = (env.UPLOADTHING_PROXY_URL || DEFAULT_UPLOADTHING_PROXY_URL).replace(/\/$/, '');
  let activeUploadthingTarget = uploadthingTarget;

  async function handleProxy(req, res) {
    const requestPath = req.url?.split('?')[0] || '';
    const queryString = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

    if (requestPath === '/api/uploadthing') {
      const requestBody = await readRequestBody(req);
      let upstreamResponse = await fetch(`${activeUploadthingTarget}${queryString}`, {
        method: req.method,
        headers: buildUploadthingHeaders(req),
        body: requestBody
      });

      if (isMissingUploadthingRoute(upstreamResponse) && activeUploadthingTarget !== FALLBACK_UPLOADTHING_PROXY_URL) {
        activeUploadthingTarget = FALLBACK_UPLOADTHING_PROXY_URL;
        upstreamResponse = await fetch(`${FALLBACK_UPLOADTHING_PROXY_URL}${queryString}`, {
          method: req.method,
          headers: buildUploadthingHeaders(req),
          body: requestBody
        });
      }

      res.statusCode = upstreamResponse.status;

      const contentType = upstreamResponse.headers.get('content-type');
      if (contentType) {
        res.setHeader('content-type', contentType);
      }

      const payload = await upstreamResponse.text();
      res.end(normalizeUploadthingResponsePayload(payload, queryString));
      return true;
    }

    if (!target || !isProxiedPath(requestPath)) {
      return false;
    }

    const requestBody = await readRequestBody(req);

    const upstreamResponse = await fetch(`${target}${requestPath.replace(/^\/api/, '')}`, {
      method: req.method,
      headers: buildUpstreamHeaders(req, env),
      body: requestBody
    });

    res.statusCode = upstreamResponse.status;
    res.setHeader('content-type', 'application/json');

    const contentType = upstreamResponse.headers.get('content-type') || '';
    const payload = await upstreamResponse.text();

    // For the webhook: post attachments then merge into response
    if (
      requestPath === '/api/cases/webhook/case-created' &&
      upstreamResponse.ok &&
      contentType.includes('application/json')
    ) {
      let responseJson;
      try { responseJson = JSON.parse(payload); } catch { res.end(payload); return true; }

      let requestJson = null;
      try {
        const bodyText = Buffer.isBuffer(requestBody) ? requestBody.toString('utf8') : (requestBody || '');
        requestJson = JSON.parse(bodyText);
      } catch { /* ignore */ }

      const caseId = responseJson?.case?.id;
      const attachments = extractAttachmentsFromWebhookPayload(requestJson);

      if (caseId && attachments.length > 0) {
        const authHeaders = buildUpstreamHeaders(req, env);
        const saved = await Promise.all(
          attachments.map((a) =>
            fetch(`${target}/cases/${caseId}/attachments`, {
              method: 'POST',
              headers: { ...authHeaders, 'content-type': 'application/json' },
              body: JSON.stringify(a)
            }).then((r) => r.ok ? r.json() : null).catch(() => null)
          )
        );
        responseJson.case.attachments = saved.filter(Boolean);
      } else if (responseJson?.case) {
        responseJson.case.attachments = [];
      }

      res.end(JSON.stringify(responseJson));
      return true;
    }

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
