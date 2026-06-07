import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_OUTPUT_DIR } from './runtime-config.js';

export function slugifyFileSegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'output';
}

export function buildTimestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function getOutputDirectory(configuredPath = process.env.ANALYSIS_OUTPUT_DIR) {
  return path.resolve(process.cwd(), configuredPath?.trim() || DEFAULT_OUTPUT_DIR);
}

export async function ensureDirectory(directoryPath) {
  await mkdir(directoryPath, { recursive: true });
}

export async function saveTextFile(filePath, content) {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, content, 'utf8');
}

export async function saveJsonFile(filePath, value) {
  await saveTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
