function getProxyConfig() {
  const remoteBaseUrl = (process.env.API_REMOTE_BASE_URL || '').replace(/\/$/, '');
  const authHeader = process.env.API_AUTH_HEADER || '';
  const authValue = process.env.API_AUTH_VALUE || '';
  const bearerToken = process.env.API_BEARER_TOKEN || '';
  return { remoteBaseUrl, authHeader, authValue, bearerToken };
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function buildProxyHeaders(req, config) {
  const headers = { accept: req.headers.accept || 'application/json' };
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (config.authHeader && config.authValue) headers[config.authHeader] = config.authValue;
  if (config.bearerToken) headers.Authorization = `Bearer ${config.bearerToken}`;
  return headers;
}

function extractAttachments(requestJson) {
  const data = requestJson?.data;
  if (!data || typeof data !== 'object') return [];

  // Prefer direct attachments array with full metadata
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

async function postAttachment(remoteBaseUrl, caseId, attachment, authHeaders) {
  const res = await fetch(`${remoteBaseUrl}/cases/${caseId}/attachments`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(attachment)
  });
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

export default async function handler(req, res) {
  const config = getProxyConfig();

  if (!config.remoteBaseUrl) {
    return res.status(500).json({ message: 'API proxy is not configured on the server.' });
  }
  if (req.method === 'OPTIONS') return res.status(204).end();

  const requestBody = await readRequestBody(req);
  let requestJson = null;
  try { requestJson = JSON.parse(typeof requestBody === 'string' ? requestBody : requestBody?.toString('utf8') || ''); } catch { /* ignore */ }

  // 1. Create the case via webhook
  const upstreamResponse = await fetch(`${config.remoteBaseUrl}/cases/webhook/case-created`, {
    method: req.method,
    headers: buildProxyHeaders(req, config),
    body: requestBody
  });

  const contentType = upstreamResponse.headers.get('content-type') || '';
  res.setHeader('content-type', 'application/json');

  const responseText = await upstreamResponse.text();
  if (!upstreamResponse.ok || !contentType.includes('application/json')) {
    return res.status(upstreamResponse.status).send(responseText);
  }

  let responseJson;
  try { responseJson = JSON.parse(responseText); } catch { return res.status(upstreamResponse.status).send(responseText); }

  // 2. Post attachments and merge into response
  const caseId = responseJson?.case?.id;
  const attachments = extractAttachments(requestJson);

  if (caseId && attachments.length > 0) {
    const authHeaders = {};
    if (config.authHeader && config.authValue) authHeaders[config.authHeader] = config.authValue;
    if (config.bearerToken) authHeaders.Authorization = `Bearer ${config.bearerToken}`;

    const saved = await Promise.all(
      attachments.map((a) => postAttachment(config.remoteBaseUrl, caseId, a, authHeaders))
    );
    responseJson.case.attachments = saved.filter(Boolean);
  } else if (responseJson?.case) {
    responseJson.case.attachments = [];
  }

  return res.status(upstreamResponse.status).json(responseJson);
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
