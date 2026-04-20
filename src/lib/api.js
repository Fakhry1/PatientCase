const DEFAULT_API_ROOT = '/api';
const PUBLIC_API_ROOT = (import.meta.env.VITE_PUBLIC_API_ROOT || '').trim().replace(/\/$/, '');

function buildApiUrl(apiRoot, path) {
  return `${apiRoot}${path}`;
}

async function fetchApiResponse(apiRoot, path, options) {
  const response = await fetch(buildApiUrl(apiRoot, path), options);
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();

  return {
    response,
    contentType,
    responseText
  };
}

function shouldRetryWithPublicApiRoot(apiRoot, contentType) {
  return apiRoot === DEFAULT_API_ROOT && !!PUBLIC_API_ROOT && !contentType.includes('application/json');
}

async function requestJson(path, options, fallbackMessage) {
  let apiRoot = DEFAULT_API_ROOT;
  let { response, contentType, responseText } = await fetchApiResponse(apiRoot, path, options);

  if (shouldRetryWithPublicApiRoot(apiRoot, contentType)) {
    apiRoot = PUBLIC_API_ROOT;
    ({ response, contentType, responseText } = await fetchApiResponse(apiRoot, path, options));
  }

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
      `${fallbackMessage}: The API returned HTML instead of JSON. Start the app with npm run dev or npm run preview after configuring the local proxy, deploy it behind the configured server proxy, or set VITE_PUBLIC_API_ROOT to a reachable deployed /api base.`
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
