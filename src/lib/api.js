const API_ROOT = '/api';

async function requestJson(path, options, fallbackMessage) {
  const response = await fetch(`${API_ROOT}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();

  if (!response.ok) {
    if (!responseText) {
      throw new Error(`${fallbackMessage} (${response.status})`);
    }

    let errorJson;
    try {
      errorJson = JSON.parse(responseText);
    } catch {
      throw new Error(`${fallbackMessage} (${response.status}): ${responseText}`);
    }
    throw new Error(errorJson.message || errorJson.error || `${fallbackMessage} (${response.status})`);
  }

  if (!contentType.includes('application/json')) {
    throw new Error(
      `${fallbackMessage}: The API returned HTML instead of JSON. Start the app with npm run dev or npm run preview after configuring the local proxy, or deploy it behind the configured server proxy.`
    );
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`${fallbackMessage}: Invalid JSON response received from the API.`);
  }
}

export function fetchSpecialties(fallbackMessage) {
  return requestJson('/specialties', undefined, fallbackMessage);
}

export function submitConsultation(payload, fallbackMessage) {
  return requestJson(
    '/cases/webhook/case-created',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    },
    fallbackMessage
  );
}

export function addCaseAttachment(caseId, attachment, fallbackMessage) {
  return requestJson(
    `/cases/${caseId}/attachments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: attachment.url,
        fileName: attachment.fileName || '',
        mimeType: attachment.mimeType || 'application/octet-stream',
        sizeBytes: attachment.sizeBytes || 0
      })
    },
    fallbackMessage
  );
}
