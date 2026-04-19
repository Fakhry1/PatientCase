const DEFAULT_UPLOADTHING_PROXY_URL = 'https://telemedicine-dashboard.vercel.app/api/uploadthing';
const FALLBACK_UPLOADTHING_PROXY_URL = 'https://doctor-telemedicine-server.vercel.app/api/uploadthing';
let activeUploadthingTarget = null;

function getUploadthingTarget() {
  return (process.env.UPLOADTHING_PROXY_URL || DEFAULT_UPLOADTHING_PROXY_URL).replace(/\/$/, '');
}

function getActiveUploadthingTarget() {
  if (!activeUploadthingTarget) {
    activeUploadthingTarget = getUploadthingTarget();
  }

  return activeUploadthingTarget;
}

function isMissingUploadthingRoute(response) {
  return response.status === 404 || response.status === 405;
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
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return undefined;
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return req.body;
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const queryString = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const requestBody = await readRequestBody(req);
  let response = await fetch(`${getActiveUploadthingTarget()}${queryString}`, {
    method: req.method,
    headers: buildUploadthingHeaders(req),
    body: requestBody
  });

  if (isMissingUploadthingRoute(response) && getActiveUploadthingTarget() !== FALLBACK_UPLOADTHING_PROXY_URL) {
    activeUploadthingTarget = FALLBACK_UPLOADTHING_PROXY_URL;
    response = await fetch(`${FALLBACK_UPLOADTHING_PROXY_URL}${queryString}`, {
      method: req.method,
      headers: buildUploadthingHeaders(req),
      body: requestBody
    });
  }

  const contentType = response.headers.get('content-type');
  if (contentType) {
    res.setHeader('content-type', contentType);
  }

  const payload = await response.text();
  return res.status(response.status).send(normalizeUploadthingResponsePayload(payload, queryString));
}
