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

function buildProxyHeaders(req, config, skipAuth = false) {
  const headers = {
    accept: req.headers.accept || 'application/json'
  };

  if (req.headers['content-type']) {
    headers['content-type'] = req.headers['content-type'];
  }

  if (!skipAuth && config.authHeader && config.authValue) {
    headers[config.authHeader] = config.authValue;
  }

  if (!skipAuth && config.bearerToken) {
    headers.Authorization = `Bearer ${config.bearerToken}`;
  }

  return headers;
}

function extractAttachments(requestJson) {
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

function getAttachmentSyncHint(config) {
  if (config.authValue || config.bearerToken) {
    return 'The upstream attachment endpoint rejected one or more files.';
  }

  return 'The upstream attachment endpoint likely requires API_AUTH_VALUE or API_BEARER_TOKEN.';
}

async function postCaseAttachment(remoteBaseUrl, caseId, attachment, authHeaders) {
  try {
    const response = await fetch(`${remoteBaseUrl}/cases/${caseId}/attachments`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify(attachment)
    });

    const payload = await response.text();
    let parsed = null;
    try {
      parsed = payload ? JSON.parse(payload) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: parsed?.message || parsed?.error || payload || `Attachment request failed with status ${response.status}.`,
        attachment: {
          url: attachment.url,
          fileName: attachment.fileName || ''
        }
      };
    }

    return {
      ok: true,
      value: parsed
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Attachment request failed.',
      attachment: {
        url: attachment.url,
        fileName: attachment.fileName || ''
      }
    };
  }
}

async function syncCaseAttachments(remoteBaseUrl, caseId, attachments, authHeaders, config) {
  const results = await Promise.all(
    attachments.map((attachment) => postCaseAttachment(remoteBaseUrl, caseId, attachment, authHeaders))
  );

  const saved = results
    .filter((result) => result.ok && result.value)
    .map((result) => result.value);
  const failures = results
    .filter((result) => !result.ok)
    .map(({ status, error, attachment }) => ({ status, error, attachment }));

  return {
    saved,
    failures,
    summary: {
      attempted: attachments.length,
      saved: saved.length,
      failed: failures.length,
      hint: failures.length > 0 ? getAttachmentSyncHint(config) : ''
    }
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const config = getProxyConfig();

  if (!config.remoteBaseUrl) {
    return res.status(500).json({ message: 'API_REMOTE_BASE_URL is not configured.' });
  }

  const requestBody = await readRequestBody(req);
  let requestJson = null;
  try {
    const bodyText = Buffer.isBuffer(requestBody) ? requestBody.toString('utf8') : requestBody || '';
    requestJson = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    requestJson = null;
  }

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`${config.remoteBaseUrl}/cases/webhook/case-created`, {
      method: req.method,
      headers: buildProxyHeaders(req, config),
      body: requestBody
    });
  } catch (error) {
    return res.status(502).json({ message: `Upstream error: ${error instanceof Error ? error.message : 'Unknown error.'}` });
  }

  const contentType = upstreamResponse.headers.get('content-type') || '';
  res.setHeader('content-type', contentType || 'application/json');

  const responseText = await upstreamResponse.text();
  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    return res.status(upstreamResponse.status).send(responseText);
  }

  if (!upstreamResponse.ok) {
    return res.status(upstreamResponse.status).json(responseJson);
  }

  const caseId = responseJson?.case?.id;
  const attachments = extractAttachments(requestJson);

  if (caseId && attachments.length > 0) {
    const authHeaders = buildProxyHeaders(req, config);
    const attachmentSync = await syncCaseAttachments(config.remoteBaseUrl, caseId, attachments, authHeaders, config);
    if (responseJson.case) {
      responseJson.case.attachments = attachmentSync.saved;
    }
    if (attachmentSync.failures.length > 0) {
      responseJson.attachmentSync = {
        ...attachmentSync.summary,
        failures: attachmentSync.failures
      };
    }
  } else if (responseJson?.case) {
    responseJson.case.attachments = [];
  }

  return res.status(upstreamResponse.status).json(responseJson);
}
