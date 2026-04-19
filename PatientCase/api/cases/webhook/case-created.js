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

function buildProxyHeaders(req, config) {
  const headers = {
    accept: req.headers.accept || 'application/json'
  };

  if (req.headers['content-type']) {
    headers['content-type'] = req.headers['content-type'];
  }

  if (config.authHeader && config.authValue) {
    headers[config.authHeader] = config.authValue;
  }

  if (config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  }

  return headers;
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

export default async function handler(req, res) {
  const config = getProxyConfig();

  if (!config.remoteBaseUrl) {
    return res.status(500).json({ message: 'API proxy is not configured on the server.' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const requestBody = await readRequestBody(req);
  let requestJson = null;
  if (typeof requestBody === 'string' && requestBody.trim()) {
    try {
      requestJson = JSON.parse(requestBody);
    } catch {
      requestJson = null;
    }
  }

  const upstreamResponse = await fetch(`${config.remoteBaseUrl}/cases/webhook/case-created`, {
    method: req.method,
    headers: buildProxyHeaders(req, config),
    body: requestBody
  });

  const contentType = upstreamResponse.headers.get('content-type') || '';
  if (contentType) {
    res.setHeader('content-type', contentType);
  }

  const responseText = await upstreamResponse.text();
  if (!contentType.includes('application/json')) {
    return res.status(upstreamResponse.status).send(responseText);
  }

  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    return res.status(upstreamResponse.status).send(responseText);
  }

  const debugInfo = extractAttachmentDebugInfo(requestJson);
  const attachments = normalizeAttachmentList(debugInfo);
  if (attachments.length > 0) {
    responseJson.attachments = attachments;
    responseJson.proxyEchoEnabled = true;
  }

  return res.status(upstreamResponse.status).json(responseJson);
}
