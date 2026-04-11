function getProxyConfig() {
  const remoteBaseUrl = (process.env.API_REMOTE_BASE_URL || '').replace(/\/$/, '');
  const authHeader = process.env.API_AUTH_HEADER || '';
  const authValue = process.env.API_AUTH_VALUE || '';
  const bearerToken = process.env.API_BEARER_TOKEN || '';

  return {
    remoteBaseUrl,
    authHeader,
    authValue,
    bearerToken
  };
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined;
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (req.body && typeof req.body === 'object') {
    return JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function applyProxyHeaders(req, extraHeaders = {}) {
  const { authHeader, authValue, bearerToken } = getProxyConfig();
  const headers = {
    accept: req.headers.accept || 'application/json',
    ...extraHeaders
  };

  if (req.headers['content-type']) {
    headers['content-type'] = req.headers['content-type'];
  }

  if (authHeader && authValue) {
    headers[authHeader] = authValue;
  }

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  return headers;
}

export async function proxyRequest(req, res, path) {
  const { remoteBaseUrl } = getProxyConfig();

  if (!remoteBaseUrl) {
    return res.status(500).json({ message: 'API proxy is not configured on the server.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const response = await fetch(`${remoteBaseUrl}${path}`, {
    method: req.method,
    headers: applyProxyHeaders(req),
    body: await readRequestBody(req)
  });

  const contentType = response.headers.get('content-type');
  if (contentType) {
    res.setHeader('content-type', contentType);
  }

  const payload = await response.text();
  return res.status(response.status).send(payload);
}
