export default async function handler(req, res) {
  console.log('[case-created] invoked', req.method);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const remoteBaseUrl = (process.env.API_REMOTE_BASE_URL || '').replace(/\/$/, '');
  const authHeader = process.env.API_AUTH_HEADER || '';
  const authValue = process.env.API_AUTH_VALUE || '';

  console.log('[case-created] remoteBaseUrl:', remoteBaseUrl ? 'set' : 'MISSING');

  if (!remoteBaseUrl) {
    return res.status(500).json({ message: 'API_REMOTE_BASE_URL is not configured.' });
  }

  // Read request body - Vercel auto-parses JSON so req.body is already an object
  let requestJson = null;
  let bodyString = '';

  try {
    if (req.body && typeof req.body === 'object') {
      requestJson = req.body;
      bodyString = JSON.stringify(req.body);
    } else if (typeof req.body === 'string') {
      bodyString = req.body;
      requestJson = JSON.parse(req.body);
    }
  } catch (e) {
    console.error('[case-created] body parse error:', e.message);
  }

  console.log('[case-created] body parsed, calling upstream...');

  // 1. Create case via webhook
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`${remoteBaseUrl}/cases/webhook/case-created`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        ...(authHeader && authValue ? { [authHeader]: authValue } : {}),
      },
      body: bodyString,
    });
  } catch (fetchErr) {
    console.error('[case-created] fetch error:', fetchErr.message);
    return res.status(502).json({ message: 'Failed to reach upstream server: ' + fetchErr.message });
  }

  console.log('[case-created] upstream status:', upstreamResponse.status);

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

  // 2. Post attachments
  const caseId = responseJson?.case?.id;
  const attachmentsList = Array.isArray(requestJson?.data?.attachments)
    ? requestJson.data.attachments
    : [];

  if (caseId && attachmentsList.length > 0) {
    console.log('[case-created] posting', attachmentsList.length, 'attachments for case', caseId);
    const authHeaders = authHeader && authValue ? { [authHeader]: authValue } : {};

    const saved = await Promise.all(
      attachmentsList
        .filter((a) => a?.url)
        .map(async (a) => {
          try {
            const r = await fetch(`${remoteBaseUrl}/cases/${caseId}/attachments`, {
              method: 'POST',
              headers: { 'content-type': 'application/json', ...authHeaders },
              body: JSON.stringify({
                url: a.url,
                fileName: a.fileName || a.name || '',
                mimeType: a.mimeType || a.type || 'application/octet-stream',
                sizeBytes: a.sizeBytes || a.size || 0,
              }),
            });
            if (!r.ok) return null;
            return await r.json();
          } catch {
            return null;
          }
        })
    );

    if (responseJson.case) {
      responseJson.case.attachments = saved.filter(Boolean);
    }
  } else if (responseJson?.case) {
    responseJson.case.attachments = [];
  }

  return res.status(200).json(responseJson);
}
