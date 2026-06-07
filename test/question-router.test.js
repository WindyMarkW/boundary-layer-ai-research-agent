import test from 'node:test';
import assert from 'node:assert/strict';
import { routeQuestionToAnalyses } from '../src/lib/question-router.js';

test('routes research questions to research coverage and priority targets', () => {
  const analyses = routeQuestionToAnalyses('Which farms should we research next in Germany?');

  assert.deepEqual(analyses, ['research-coverage', 'priority-targets']);
});

test('routes broad quality questions to the quality pack', () => {
  const analyses = routeQuestionToAnalyses('What are the biggest data quality mismatches?');

  assert.deepEqual(analyses, ['data-quality']);
});

test('falls back to a broad analysis set when the question is generic', () => {
  const analyses = routeQuestionToAnalyses('Help me understand this dataset.');

  assert.deepEqual(analyses, ['portfolio-overview', 'data-quality', 'research-coverage']);
});
