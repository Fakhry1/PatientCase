import https from "https";
import http from "http";

function httpRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(parsed, options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: () => Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();

  const remoteBaseUrl = (process.env.API_REMOTE_BASE_URL || "").replace(/\/$/, "");
  const authHeader = process.env.API_AUTH_HEADER || "";
  const authValue = process.env.API_AUTH_VALUE || "";

  if (!remoteBaseUrl) {
    return res.status(500).json({ message: "API_REMOTE_BASE_URL is not configured." });
  }

  const requestJson = req.body && typeof req.body === "object" ? req.body : null;
  const bodyString = requestJson ? JSON.stringify(requestJson) : (typeof req.body === "string" ? req.body : "{}");

  const proxyHeaders = {
    "content-type": "application/json",
    "accept": "application/json",
    "content-length": Buffer.byteLength(bodyString).toString(),
    ...(authHeader && authValue ? { [authHeader]: authValue } : {}),
  };

  // 1. Create case
  let upstream;
  try {
    upstream = await httpRequest(
      `${remoteBaseUrl}/cases/webhook/case-created`,
      { method: "POST", headers: proxyHeaders },
      bodyString
    );
  } catch (err) {
    return res.status(502).json({ message: "Upstream error: " + err.message });
  }

  const responseText = upstream.text();
  let responseJson;
  try { responseJson = JSON.parse(responseText); }
  catch { return res.status(upstream.status).send(responseText); }

  if (upstream.status >= 400) {
    return res.status(upstream.status).json(responseJson);
  }

  // 2. Post attachments
  const caseId = responseJson?.case?.id;
  const attachmentsList = Array.isArray(requestJson?.data?.attachments) ? requestJson.data.attachments : [];

  if (caseId && attachmentsList.length > 0) {
    const saved = await Promise.all(
      attachmentsList.filter((a) => a?.url).map(async (a) => {
        const body = JSON.stringify({
          url: a.url,
          fileName: a.fileName || a.name || "",
          mimeType: a.mimeType || a.type || "application/octet-stream",
          sizeBytes: a.sizeBytes || a.size || 0,
        });
        try {
          const r = await httpRequest(
            `${remoteBaseUrl}/cases/${caseId}/attachments`,
            { method: "POST", headers: { ...proxyHeaders, "content-length": Buffer.byteLength(body).toString() } },
            body
          );
          if (r.status >= 400) return null;
          try { return JSON.parse(r.text()); } catch { return null; }
        } catch { return null; }
      })
    );
    if (responseJson.case) responseJson.case.attachments = saved.filter(Boolean);
  } else if (responseJson?.case) {
    responseJson.case.attachments = [];
  }

  return res.status(200).json(responseJson);
}
