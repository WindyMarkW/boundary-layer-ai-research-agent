import dotenv from 'dotenv';
import process from 'node:process';

dotenv.config();

export const DEFAULT_ANALYSIS = readEnvValue('ANALYSIS_DEFAULT') || 'portfolio-overview';
export const DEFAULT_OUTPUT_DIR = readEnvValue('ANALYSIS_OUTPUT_DIR') || 'reports';
export const DEFAULT_AI_PROVIDER = getAiProvider(readEnvValue('AI_PROVIDER') || 'none', 'AI_PROVIDER');
export const DEFAULT_OPENAI_MODEL = readEnvValue('OPENAI_MODEL') || 'gpt-5.4-2026-03-05';
export const DEFAULT_OPENROUTER_MODEL = readEnvValue('OPENROUTER_MODEL') || 'openai/gpt-5.4-mini';

export function readEnvValue(name) {
  return process.env[name]?.trim();
}

export function requireValue(value, name, message) {
  if (value?.trim()) {
    return value.trim();
  }

  throw new Error(message || `Missing ${name}. Copy .env.example to .env and set ${name} first.`);
}

export function getAiProvider(value, variableName = 'provider') {
  const normalized = (value || '').trim().toLowerCase();
  const allowed = new Set(['none', 'codex', 'openrouter']);

  if (!allowed.has(normalized)) {
    throw new Error(`${variableName} must be one of: none, codex, openrouter.`);
  }

  return normalized;
}

export function getModelForProvider(provider) {
  return provider === 'openrouter' ? DEFAULT_OPENROUTER_MODEL : DEFAULT_OPENAI_MODEL;
}

export function getApiKeyForProvider(provider) {
  if (provider === 'codex') {
    return requireValue(
      process.env.OPENAI_API_KEY,
      'OPENAI_API_KEY',
      'Missing OPENAI_API_KEY for codex provider.',
    );
  }

  if (provider === 'openrouter') {
    return requireValue(
      process.env.OPENROUTER_API_KEY,
      'OPENROUTER_API_KEY',
      'Missing OPENROUTER_API_KEY for openrouter provider.',
    );
  }

  return null;
}
