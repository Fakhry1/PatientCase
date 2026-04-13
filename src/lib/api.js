const API_ROOT = '/api';

async function requestJson(path, options, fallbackMessage) {
  const response = await fetch(`${API_ROOT}${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();

  if (!response.ok) {
    if (!responseText) {
      throw new Error(`${fallbackMessage}${response.status ? ` (${response.status})` : ''}`);
    }

    try {
      const json = JSON.parse(responseText);
      throw new Error(json.message || json.error || `${fallbackMessage} (${response.status})`);
    } catch {
      throw new Error(`${fallbackMessage}${response.status ? ` (${response.status})` : ''}: ${responseText}`);
    }
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    },
    fallbackMessage
  );
}
