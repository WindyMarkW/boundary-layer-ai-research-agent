import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWindFarmWhereClause, parseIdsValue } from '../src/lib/queries.js';
import { buildProductionUniverseFilters, normalizeProductionFilters } from '../src/lib/production-queries.js';

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

test('buildWindFarmWhereClause supports exact wind-farm name matching', () => {
  const result = buildWindFarmWhereClause({
    windFarmName: 'Hornsea 2',
  });

  assert.match(result.whereClause, /LOWER\(BTRIM\(wf\.name\)\) = LOWER\(BTRIM\(\$1\)\)/);
  assert.deepEqual(result.params, ['Hornsea 2']);
});

test('normalizeProductionFilters validates production date filters', () => {
  const result = normalizeProductionFilters({
    startDate: '2026-05-01',
    endDate: '2026-05-07',
    lookbackDays: '14',
  });

  assert.deepEqual(result, {
    startDate: '2026-05-01',
    endDate: '2026-05-07',
    lookbackDays: 14,
  });
});

test('buildProductionUniverseFilters defaults production analyses to the United Kingdom slice', () => {
  const result = buildProductionUniverseFilters({
    windFarmName: 'Hornsea 2',
    lookbackDays: 7,
  });

  assert.equal(result.country, 'United Kingdom');
  assert.equal(result.windFarmName, null);
  assert.equal(result.ids, null);
  assert.equal(result.lookbackDays, 7);
});
