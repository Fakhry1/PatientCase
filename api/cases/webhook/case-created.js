import fetch from "node-fetch";

export default async function handler(req, res) {
  console.log("[case-created] invoked", req.method);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const remoteBaseUrl = (process.env.API_REMOTE_BASE_URL || "").replace(/\/$/, "");
  const authHeader = process.env.API_AUTH_HEADER || "";
  const authValue = process.env.API_AUTH_VALUE || "";

  if (!remoteBaseUrl) {
    return res.status(500).json({ message: "API_REMOTE_BASE_URL is not configured." });
  }

  // Vercel auto-parses JSON body
  let requestJson = req.body && typeof req.body === "object" ? req.body : null;
  let bodyString = requestJson ? JSON.stringify(requestJson) : (typeof req.body === "string" ? req.body : "");
  if (!requestJson && typeof req.body === "string") {
    try { requestJson = JSON.parse(req.body); } catch { /* ignore */ }
  }

  const proxyHeaders = {
    "content-type": "application/json",
    "accept": "application/json",
    ...(authHeader && authValue ? { [authHeader]: authValue } : {}),
  };

  // 1. Create case via webhook
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`${remoteBaseUrl}/cases/webhook/case-created`, {
      method: "POST",
      headers: proxyHeaders,
      body: bodyString,
    });
  } catch (err) {
    console.error("[case-created] fetch failed:", err.message);
    return res.status(502).json({ message: "Failed to reach upstream: " + err.message });
  }

  const responseText = await upstreamResponse.text();
  let responseJson;
  try { responseJson = JSON.parse(responseText); }
  catch { return res.status(upstreamResponse.status).send(responseText); }

  console.log("[case-created] upstream status:", upstreamResponse.status);

  if (!upstreamResponse.ok) {
    return res.status(upstreamResponse.status).json(responseJson);
  }

  // 2. Post attachments
  const caseId = responseJson?.case?.id;
  const attachmentsList = Array.isArray(requestJson?.data?.attachments)
    ? requestJson.data.attachments
    : [];

  if (caseId && attachmentsList.length > 0) {
    const saved = await Promise.all(
      attachmentsList.filter((a) => a?.url).map(async (a) => {
        try {
          const r = await fetch(`${remoteBaseUrl}/cases/${caseId}/attachments`, {
            method: "POST",
            headers: proxyHeaders,
            body: JSON.stringify({
              url: a.url,
              fileName: a.fileName || a.name || "",
              mimeType: a.mimeType || a.type || "application/octet-stream",
              sizeBytes: a.sizeBytes || a.size || 0,
            }),
          });
          return r.ok ? await r.json() : null;
        } catch { return null; }
      })
    );
    if (responseJson.case) responseJson.case.attachments = saved.filter(Boolean);
  } else if (responseJson?.case) {
    responseJson.case.attachments = [];
  }

  return res.status(200).json(responseJson);
}
