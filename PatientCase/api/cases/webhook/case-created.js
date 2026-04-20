const remoteBaseUrl = (process.env.API_REMOTE_BASE_URL || '').replace(/\/$/, '');
const authHeader = process.env.API_AUTH_HEADER || '';
const authValue = process.env.API_AUTH_VALUE || '';

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

export default async function handler(req, res) {
  if (!remoteBaseUrl) {
    return res.status(500).json({ message: 'API proxy is not configured on the server.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
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

    let requestJson = null;
    if (typeof body === 'string' && body.trim()) {
      try { requestJson = JSON.parse(body); } catch { requestJson = null; }
    } else if (req.body && typeof req.body === 'object') {
      requestJson = req.body;
    }

    const response = await fetch(`${remoteBaseUrl}/cases/webhook/case-created`, {
      method: req.method,
      headers,
      body,
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType) res.setHeader('content-type', contentType);

    const responseText = await response.text();

    if (!contentType.includes('application/json')) {
      return res.status(response.status).send(responseText);
    }

    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      return res.status(response.status).send(responseText);
    }

    const attachments = normalizeAttachmentList(requestJson);
    if (attachments.length > 0) {
      responseJson.attachments = attachments;
      responseJson.proxyEchoEnabled = true;
    }

    return res.status(response.status).json(responseJson);
  } catch (err) {
    return res.status(500).json({
      message: err.message || 'Internal proxy error',
    });
  }
}
