import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHermesAnalysisArgs } from '../src/hermes-run-analysis.js';
import { parseHermesAskArgs } from '../src/hermes-ask.js';
import { normalizeInternalBaseUrl } from '../src/lib/internal-api.js';

test('hermes analysis bridge defaults to no artifact saves', () => {
  const args = parseHermesAnalysisArgs(['--analysis', 'priority-targets']);

  assert.equal(args.analysis, 'priority-targets');
  assert.equal(args.saveArtifacts, false);
  assert.equal(args.outputJson, false);
});

test('hermes ask bridge supports json output and explicit saves', () => {
  const args = parseHermesAskArgs(['--question', 'What should we research next?', '--json', '--save']);

  assert.equal(args.question, 'What should we research next?');
  assert.equal(args.outputJson, true);
  assert.equal(args.saveArtifacts, true);
});

test('normalizeInternalBaseUrl trims trailing slashes', () => {
  assert.equal(normalizeInternalBaseUrl('http://127.0.0.1:3002///'), 'http://127.0.0.1:3002');
});
