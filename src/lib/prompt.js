import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadPromptTemplate(relativePath) {
  const promptPath = path.resolve(process.cwd(), relativePath);
  return readFile(promptPath, 'utf8');
}

export function buildAnalysisPrompt(template, { analysisTitle, pack }) {
  return [
    template.trim(),
    '',
    `Analysis: ${analysisTitle}`,
    'Use this JSON analysis pack as your only source of truth:',
    '```json',
    JSON.stringify(pack, null, 2),
    '```',
  ].join('\n');
}

export function buildQuestionPrompt(template, { question, routedAnalyses, packs }) {
  return [
    template.trim(),
    '',
    `Question: ${question}`,
    `Routed analyses: ${routedAnalyses.join(', ')}`,
    'Use this JSON analysis context as your only source of truth:',
    '```json',
    JSON.stringify(packs, null, 2),
    '```',
  ].join('\n');
}
