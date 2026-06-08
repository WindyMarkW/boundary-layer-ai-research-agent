import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRunInsightsArgs } from '../src/run-insights.js';
import { renderAnalysisMarkdown } from '../src/lib/markdown.js';
import { buildUkProductionTables } from '../src/lib/production-insights.js';

test('parseRunInsightsArgs supports production-specific filters', () => {
  const args = parseRunInsightsArgs([
    '--analysis',
    'wind-farm-production',
    '--wind-farm-name',
    'Hornsea 2',
    '--start-date',
    '2026-05-01',
    '--end-date',
    '2026-05-07',
    '--lookback-days',
    '14',
  ]);

  assert.equal(args.analysis, 'wind-farm-production');
  assert.equal(args.filters.windFarmName, 'Hornsea 2');
  assert.equal(args.filters.startDate, '2026-05-01');
  assert.equal(args.filters.endDate, '2026-05-07');
  assert.equal(args.filters.lookbackDays, 14);
});

test('renderAnalysisMarkdown includes production snapshot and LinkedIn angles', () => {
  const markdown = renderAnalysisMarkdown({
    analysis: 'wind-farm-production',
    title: 'Wind Farm Production Report',
    generatedAt: '2026-06-08T10:00:00.000Z',
    filters: {
      country: 'United Kingdom',
      windFarmName: 'Hornsea 2',
    },
    summary: {
      wind_farm_count: 1,
      country_count: 1,
      total_capacity_mw: 1320,
      average_capacity_mw: 1320,
      average_turbine_count: 165,
    },
    windFarm: {
      name: 'Hornsea 2',
      country: 'United Kingdom',
      type: 'Offshore wind farm',
      status: 'Operational',
      power_mw: 1320,
      turbine_count: 165,
      start_year: 2022,
    },
    productionWindow: {
      startDate: '2026-05-25',
      endDate: '2026-05-31',
      previousStartDate: '2026-05-18',
      previousEndDate: '2026-05-24',
      latestAvailableDate: '2026-05-31',
    },
    productionSummary: {
      supported: true,
      totalGenerationMwh: 185420.5,
      previousGenerationMwh: 170210.4,
      deltaGenerationMwh: 15210.1,
      deltaGenerationPct: 8.94,
      averageDailyGenerationMwh: 26488.6,
      capacityFactorPct: 66.92,
      currentDayCount: 7,
      mappedBmuCount: 2,
      generationRank: 2,
      capacityFactorRank: 4,
      peerCount: 115,
      windowLabel: '2026-05-25 to 2026-05-31',
    },
    storyAngles: [
      {
        angle: 'Hornsea 2 ranked #2 in the UK slice by metered output over the latest 7-day window.',
        evidence: 'Current-window generation: 185,420.5 MWh.',
        caveat: null,
      },
    ],
    tables: {
      dailyGeneration: [
        {
          settlement_date: '2026-05-25',
          generation_mwh: 25210.5,
          interval_count: 48,
          published_at: '2026-05-26T00:00:00.000Z',
        },
      ],
      linkedBmus: [
        {
          bmu_id: 'T_HNS2_1',
          national_grid_bmu_id: 'HNS201',
          bm_unit_name: 'Hornsea 2',
          lead_party_name: 'Hornsea 2 Limited',
          allocation_factor: 1,
          confidence: 0.96,
          mapping_source: 'manual_review',
        },
      ],
    },
  });

  assert.match(markdown, /## Production Snapshot/);
  assert.match(markdown, /## LinkedIn Angles/);
  assert.match(markdown, /Hornsea 2 ranked #2/);
  assert.match(markdown, /## Daily Generation/);
});

test('buildUkProductionTables keeps biggest drops empty when no farms are down', () => {
  const tables = buildUkProductionTables([
    {
      id: 1,
      name: 'London Array',
      current_generation_mwh: 11154.9,
      previous_generation_mwh: 2762.37,
      delta_generation_pct: 303.82,
      delta_generation_mwh: 8392.53,
      capacity_factor_pct: 10.54,
      power_mw: 630,
      mapped_bmu_count: 4,
    },
  ]);

  assert.equal(tables.biggestGains.length, 1);
  assert.deepEqual(tables.biggestDrops, []);
});
