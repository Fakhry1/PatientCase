import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const PROXIED_PATHS = new Set(['/api/specialties', '/api/cases/webhook/case-created']);
const DEFAULT_UPLOADTHING_PROXY_URL = 'https://telemedicine-dashboard.vercel.app/api/uploadthing';
const FALLBACK_UPLOADTHING_PROXY_URL = 'https://doctor-telemedicine-server.vercel.app/api/uploadthing';

function getProxyTarget(env) {
  return (env.API_REMOTE_BASE_URL || '').replace(/\/$/, '');
}

function buildUpstreamHeaders(req, env) {
  const requestHeaders = req && typeof req.headers === 'object' && req.headers ? req.headers : {};
  const headers = {
    accept: requestHeaders.accept || 'application/json'
  };

  if (requestHeaders['content-type']) {
    headers['content-type'] = requestHeaders['content-type'];
  }

  if (env.API_AUTH_HEADER && env.API_AUTH_VALUE) {
    headers[env.API_AUTH_HEADER] = env.API_AUTH_VALUE;
  }

  if (env.API_BEARER_TOKEN) {
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
        fileUrl: item.fileUrl || item.url,
        fields: item.fields && typeof item.fields === 'object' ? item.fields : {},
      };
    });

    return JSON.stringify(normalized);
  } catch {
    return payload;
  }
}

function isMissingUploadthingRoute(response) {
  return response.status === 404 || response.status === 405;
}

function parseRequestJson(requestBody) {
  if (!requestBody) return null;

  const text = Buffer.isBuffer(requestBody) ? requestBody.toString('utf8') : String(requestBody);
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractAttachmentDebugInfo(requestJson) {
  const data = requestJson && typeof requestJson === 'object' ? requestJson.data : null;
  if (!data || typeof data !== 'object') {
    return { attachments: [], attachmentUploadResponses: [] };
  }

  const directAttachments = Array.isArray(data.attachments) ? data.attachments : [];
  const directUploadResponses = Array.isArray(data.attachmentUploadResponses) ? data.attachmentUploadResponses : [];

  let fieldAttachments = [];
  let fieldAttachmentUploadResponses = [];

  const fields = Array.isArray(data.fields) ? data.fields : [];
  for (const field of fields) {
    if (!field || typeof field !== 'object' || typeof field.value !== 'string' || !field.value.trim()) {
      continue;
    }

    if (field.key === 'question_attachments') {
      try {
        const parsed = JSON.parse(field.value);
        if (Array.isArray(parsed)) {
          fieldAttachments = parsed;
        }
      } catch {
        // Ignore invalid JSON in debug field.
      }
    }

    if (field.key === 'question_attachment_upload_responses') {
      try {
        const parsed = JSON.parse(field.value);
        if (Array.isArray(parsed)) {
          fieldAttachmentUploadResponses = parsed;
        }
      } catch {
        // Ignore invalid JSON in debug field.
      }
    }
  }

  return {
    attachments: directAttachments.length > 0 ? directAttachments : fieldAttachments,
    attachmentUploadResponses: directUploadResponses.length > 0 ? directUploadResponses : fieldAttachmentUploadResponses
  };
}

function normalizeAttachmentList(debugInfo) {
  const combined = [
    ...(Array.isArray(debugInfo?.attachments) ? debugInfo.attachments : []),
    ...(Array.isArray(debugInfo?.attachmentUploadResponses) ? debugInfo.attachmentUploadResponses : [])
  ];

  const uniqueUrls = new Set();
  const attachments = [];

  for (const item of combined) {
    const url =
      (item && typeof item === 'object' && (item.url || item.fileUrl)) ||
      (typeof item === 'string' ? item : '');
    const key = item && typeof item === 'object' ? item.key : '';
    const utfsUrl =
      (item && typeof item === 'object' && item.utfsUrl) ||
      (key ? `https://utfs.io/f/${key}` : '');

    if (!url || uniqueUrls.has(url)) continue;
    uniqueUrls.add(url);
    attachments.push({
      url,
      utfsUrl: utfsUrl || url
    });
  }

  return attachments;
}

function appendAttachmentEchoToCaseResponse(payload, requestJson) {
  if (!payload || typeof payload !== 'string') {
    return payload;
  }

  try {
    const responseJson = JSON.parse(payload);
    const debugInfo = extractAttachmentDebugInfo(requestJson);
    const attachments = normalizeAttachmentList(debugInfo);

    if (attachments.length > 0) {
      responseJson.attachments = attachments;
      responseJson.proxyEchoEnabled = true;
    }

    return JSON.stringify(responseJson);
  } catch {
    return payload;
  }
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

    if (!target || !PROXIED_PATHS.has(requestPath)) {
      return false;
    }

    const requestBody = await readRequestBody(req);
    const requestJson = requestPath === '/api/cases/webhook/case-created' ? parseRequestJson(requestBody) : null;

    const upstreamResponse = await fetch(`${target}${requestPath.replace(/^\/api/, '')}`, {
      method: req.method,
      headers: buildUpstreamHeaders(req, env),
      body: requestBody
    });

    res.statusCode = upstreamResponse.status;

    const contentType = upstreamResponse.headers.get('content-type');
    if (contentType) {
      res.setHeader('content-type', contentType);
    }

    let payload = await upstreamResponse.text();
    if (requestPath === '/api/cases/webhook/case-created') {
      payload = appendAttachmentEchoToCaseResponse(payload, requestJson);
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
