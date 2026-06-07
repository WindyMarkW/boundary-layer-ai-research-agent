import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWindFarmWhereClause, parseIdsValue } from '../src/lib/queries.js';

test('parseIdsValue returns integers', () => {
  assert.deepEqual(parseIdsValue('10, 20,30'), [10, 20, 30]);
});

test('buildWindFarmWhereClause includes country and type filters', () => {
  const result = buildWindFarmWhereClause({
    country: 'United Kingdom',
    windFarmType: 'Offshore wind farm',
  });

  assert.match(result.whereClause, /LOWER\(wf\.country\) = LOWER\(\$1\)/);
  assert.match(result.whereClause, /wf\.type = \$2/);
  assert.deepEqual(result.params, ['United Kingdom', 'Offshore wind farm']);
});
