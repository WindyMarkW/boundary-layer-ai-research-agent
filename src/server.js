import http from 'node:http';
import process from 'node:process';
import dotenv from 'dotenv';
import { runAskWorkflow } from './ask-database.js';
import { runInsightsWorkflow } from './run-insights.js';
import { parseIdsValue } from './lib/queries.js';

dotenv.config();

const DEFAULT_PORT = 3002;
const DEFAULT_HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
  }
}

function getPort() {
  const parsed = Number.parseInt(process.env.PORT ?? '', 10);
  return Number.isInteger(parsed) ? parsed : DEFAULT_PORT;
}

function getHost() {
  return process.env.HOST?.trim() || DEFAULT_HOST;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function getBearerToken(request) {
  const header = request.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }

  return header.slice('Bearer '.length).trim() || null;
}

function requireAuthorizedRequest(request) {
  const expectedToken = process.env.RESEARCH_AGENT_SERVICE_TOKEN?.trim();
  if (!expectedToken) {
    return;
  }

  if (getBearerToken(request) !== expectedToken) {
    throw new HttpError(401, 'Unauthorized');
  }
}

async function readJsonBody(request) {
  let body = '';
  let totalBytes = 0;

  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Request body too large.');
    }

    body += chunk.toString('utf8');
  }

  if (!body.trim()) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

function normalizeAnalysisRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const normalizedFilters =
    typeof body.filters === 'object' && body.filters !== null && !Array.isArray(body.filters)
      ? { ...body.filters }
      : {};

  if (typeof normalizedFilters.ids === 'string') {
    normalizedFilters.ids = parseIdsValue(normalizedFilters.ids);
  }

  return {
    analysis: typeof body.analysis === 'string' ? body.analysis : undefined,
    filters: normalizedFilters,
    aiSummary: body.aiSummary === true,
    provider: typeof body.provider === 'string' ? body.provider : null,
    saveArtifacts: body.saveArtifacts !== false,
  };
}

function normalizeQuestionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  if (typeof body.question !== 'string' || !body.question.trim()) {
    throw new HttpError(400, 'question is required.');
  }

  const normalizedFilters =
    typeof body.filters === 'object' && body.filters !== null && !Array.isArray(body.filters)
      ? { ...body.filters }
      : {};

  if (typeof normalizedFilters.ids === 'string') {
    normalizedFilters.ids = parseIdsValue(normalizedFilters.ids);
  }

  return {
    question: body.question.trim(),
    filters: normalizedFilters,
    provider: typeof body.provider === 'string' ? body.provider : null,
    saveArtifacts: body.saveArtifacts !== false,
  };
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (request.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/internal/healthz')) {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method !== 'POST') {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    if (url.pathname !== '/internal/run-analysis' && url.pathname !== '/internal/ask-database') {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    requireAuthorizedRequest(request);
    const body = await readJsonBody(request);

    if (url.pathname === '/internal/run-analysis') {
      const result = await runInsightsWorkflow(normalizeAnalysisRequest(body));
      sendJson(response, 200, {
        result: {
          analysis: result.analysis,
          pack: result.pack,
          providerUsed: result.providerUsed,
          modelUsed: result.modelUsed,
          artifactPaths: result.artifactPaths,
          markdown: result.markdown,
        },
      });
      return;
    }

    const result = await runAskWorkflow(normalizeQuestionRequest(body));
    sendJson(response, 200, {
      result: {
        question: result.question,
        routedAnalyses: result.routedAnalyses,
        packs: result.packs,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
        artifactPaths: result.artifactPaths,
        markdown: result.markdown,
      },
    });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : 'Internal server error';

    if (statusCode >= 500) {
      console.error('Research agent request failed:', error);
    }

    sendJson(response, statusCode, { error: message });
  }
});

server.listen(getPort(), getHost(), () => {
  console.log(`boundary-layer-ai-research-agent listening on http://${getHost()}:${getPort()}`);
  if (!process.env.RESEARCH_AGENT_SERVICE_TOKEN?.trim()) {
    console.warn('RESEARCH_AGENT_SERVICE_TOKEN is not set. Internal endpoints are unsecured.');
  }
});
