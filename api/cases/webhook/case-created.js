export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    const remoteBaseUrl = (process.env.API_REMOTE_BASE_URL || '').replace(/\/$/, '');
    if (!remoteBaseUrl) {
      return res.status(500).json({ message: 'API proxy is not configured on the server.' });
    }

    const authHeader = process.env.API_AUTH_HEADER || '';
    const authValue = process.env.API_AUTH_VALUE || '';

    const headers = {
      accept: req.headers.accept || 'application/json',
    };
    if (req.headers['content-type']) {
      headers['content-type'] = req.headers['content-type'];
    }
    if (authHeader && authValue) {
      headers[authHeader] = authValue;
    }

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (req.body && typeof req.body === 'object') {
        body = JSON.stringify(req.body);
      }
    }

    const response = await fetch(`${remoteBaseUrl}/cases/webhook/case-created`, {
      method: req.method,
      headers,
      body,
    });

    const ct = response.headers.get('content-type');
    if (ct) res.setHeader('content-type', ct);

    const payload = await response.text();
    return res.status(response.status).send(payload);
  } catch (err) {
    return res.status(500).json({
      message: err.message || 'Internal proxy error',
    });
  }
}
