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

test('routes production questions to the UK production brief', () => {
  const analyses = routeQuestionToAnalyses('Which UK wind farms had the highest generation this week?');

  assert.deepEqual(analyses, ['uk-production-brief']);
});

test('routes targeted production questions to the wind-farm production report', () => {
  const analyses = routeQuestionToAnalyses(
    'Give me a production profile for this wind farm.',
    { ids: [101] },
  );

  assert.deepEqual(analyses, ['uk-production-brief', 'wind-farm-production']);
});
