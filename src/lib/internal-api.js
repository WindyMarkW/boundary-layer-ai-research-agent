import { readEnvValue } from './runtime-config.js';

const LOOPBACK_INTERNAL_URL = 'http://127.0.0.1:3002';

export function normalizeInternalBaseUrl(value = readEnvValue('BOUNDARY_LAYER_INTERNAL_URL') || LOOPBACK_INTERNAL_URL) {
  return value.trim().replace(/\/+$/, '');
}

export function getInternalServiceToken() {
  return readEnvValue('BOUNDARY_LAYER_INTERNAL_TOKEN') || readEnvValue('RESEARCH_AGENT_SERVICE_TOKEN') || null;
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Internal API returned invalid JSON for ${response.url}.`);
  }
}

async function postInternal(pathname, payload, { baseUrl, token } = {}) {
  const resolvedBaseUrl = normalizeInternalBaseUrl(baseUrl);
  const resolvedToken = token ?? getInternalServiceToken();
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
  };

  if (resolvedToken) {
    headers.authorization = `Bearer ${resolvedToken}`;
  }

  const response = await fetch(`${resolvedBaseUrl}${pathname}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      typeof body?.error === 'string' && body.error.trim()
        ? body.error.trim()
        : `Internal API request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  return body.result ?? body;
}

export function requestInternalAnalysis(payload, options) {
  return postInternal('/internal/run-analysis', payload, options);
}

export function requestInternalQuestion(payload, options) {
  return postInternal('/internal/ask-database', payload, options);
}
