function formatNumber(value) {
  if (value == null || value === '') {
    return 'n/a';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatDate(value) {
  if (!value) {
    return 'n/a';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function formatFilters(filters = {}) {
  const entries = Object.entries(filters).filter(([, value]) => value != null && value !== '');
  if (entries.length === 0) {
    return 'All active wind farms';
  }

  return entries.map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`).join(', ');
}

function renderRowsTable(rows, columns) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '_No rows returned._';
  }

  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => {
    const cells = columns.map((column) => {
      const rawValue = row[column.key];

      if (column.type === 'number') {
        return formatNumber(rawValue);
      }

      if (column.type === 'date') {
        return formatDate(rawValue);
      }

      return rawValue == null || rawValue === '' ? 'n/a' : String(rawValue);
    });

    return `| ${cells.join(' | ')} |`;
  });

  return [header, divider, ...body].join('\n');
}

export function buildAnalysisHighlights(pack) {
  const highlights = [];
  const summary = pack.summary || {};
  const firstCountry = pack.tables?.countryBreakdown?.[0];
  const firstStatus = pack.tables?.statusBreakdown?.[0];
  const firstMismatch = pack.tables?.capacityMismatchCandidates?.[0];
  const firstUnlinked = pack.tables?.unlinkedOperationalFarms?.[0];
  const firstTarget = pack.tables?.highValueResearchTargets?.[0];
  const firstConflict = pack.tables?.factConflicts?.[0];

  if (pack.analysis === 'portfolio-overview') {
    highlights.push(
      `${formatNumber(summary.wind_farm_count)} active wind farms across ${formatNumber(summary.country_count)} countries with ${formatNumber(summary.total_capacity_mw)} MW of recorded capacity.`,
    );

    if (firstCountry) {
      highlights.push(
        `${firstCountry.country} has the largest recorded footprint in this slice at ${formatNumber(firstCountry.total_capacity_mw)} MW across ${formatNumber(firstCountry.wind_farm_count)} farms.`,
      );
    }

    if (firstStatus) {
      highlights.push(
        `The most common status in this slice is ${firstStatus.status} with ${formatNumber(firstStatus.wind_farm_count)} farms.`,
      );
    }

    const missingTotal =
      Number(summary.missing_capacity_count || 0) +
      Number(summary.missing_turbine_count || 0) +
      Number(summary.missing_status_count || 0);

    if (missingTotal > 0) {
      highlights.push(
        `Core metadata is incomplete in this slice: ${formatNumber(summary.missing_capacity_count)} farms are missing capacity, ${formatNumber(summary.missing_turbine_count)} are missing turbine count, and ${formatNumber(summary.missing_status_count)} are missing status.`,
      );
    }
  }

  if (pack.analysis === 'data-quality') {
    if (firstMismatch) {
      highlights.push(
        `${firstMismatch.name} has a ${formatNumber(firstMismatch.absolute_delta_mw)} MW gap between recorded wind farm capacity and linked turbine capacity.`,
      );
    }

    if (firstUnlinked) {
      highlights.push(
        `${firstUnlinked.name} is marked Operational but currently has zero linked turbines in core_wind_farm_turbine_links.`,
      );
    }

    if ((pack.tables?.missingMetadata?.length || 0) > 0) {
      highlights.push(
        `${formatNumber(pack.tables.missingMetadata.length)} farms in the top issue set are missing one or more core metadata fields.`,
      );
    }

    if (firstConflict) {
      highlights.push(
        `${firstConflict.name} has a field-level disagreement between EMODnet and research for ${firstConflict.field_name}.`,
      );
    }
  }

  if (pack.analysis === 'research-coverage') {
    if (pack.researchCoverage?.supported === false) {
      highlights.push('Research coverage tables are not present in this database yet, so this analysis is currently schema-limited.');
    } else {
      highlights.push(
        `${formatNumber(pack.researchCoverage?.published_count)} published reports and ${formatNumber(pack.researchCoverage?.draft_count)} draft reports are available in this slice.`,
      );
      highlights.push(
        `${formatNumber(pack.researchCoverage?.missing_count)} farms still have no research report in this slice.`,
      );
    }

    if (firstTarget) {
      highlights.push(
        `${firstTarget.name} is one of the highest-capacity farms still missing a research report.`,
      );
    }

    if (firstConflict) {
      highlights.push(
        `${firstConflict.name} is a strong moderation candidate because EMODnet and research disagree on ${firstConflict.field_name}.`,
      );
    }
  }

  if (pack.analysis === 'priority-targets') {
    if (firstTarget) {
      highlights.push(
        `${firstTarget.name} is a high-value research target because it has no report and carries ${formatNumber(firstTarget.power_mw)} MW of recorded capacity.`,
      );
    }

    if (firstConflict) {
      highlights.push(
        `${firstConflict.name} should be reviewed because research and EMODnet disagree on ${firstConflict.field_name}.`,
      );
    }

    if (firstMismatch) {
      highlights.push(
        `${firstMismatch.name} is a data-cleanup priority due to a ${formatNumber(firstMismatch.absolute_delta_mw)} MW capacity mismatch.`,
      );
    }

    if ((pack.tables?.missingMetadata?.length || 0) > 0) {
      highlights.push(
        `${formatNumber(pack.tables.missingMetadata.length)} farms appear in the first-page missing metadata queue for this slice.`,
      );
    }
  }

  if (pack.analysis === 'wind-farm-production') {
    const farm = pack.windFarm || {};
    const production = pack.productionSummary || {};

    if (production.supported === false) {
      highlights.push(production.reason || 'Production reporting is not available for this database yet.');
    } else {
      highlights.push(
        `${farm.name || 'This farm'} generated ${formatNumber(production.totalGenerationMwh)} MWh in ${production.windowLabel || 'the latest production window'}.`,
      );

      if (production.generationRank) {
        highlights.push(
          `${farm.name || 'This farm'} ranks #${formatNumber(production.generationRank)} out of ${formatNumber(production.peerCount)} UK farms in the selected slice by metered output.`,
        );
      }

      if (production.capacityFactorPct != null) {
        highlights.push(
          `The estimated metered capacity factor for ${farm.name || 'this farm'} is ${formatNumber(production.capacityFactorPct)}%.`,
        );
      }

      if (production.deltaGenerationPct != null) {
        const direction = Number(production.deltaGenerationPct) >= 0 ? 'up' : 'down';
        highlights.push(
          `${farm.name || 'This farm'} is ${direction} ${formatNumber(Math.abs(Number(production.deltaGenerationPct)))}% versus the previous comparison window.`,
        );
      }

      if ((production.mappedBmuCount || 0) <= 0) {
        highlights.push(
          `${farm.name || 'This farm'} currently has no active BMU mapping in the production feed, so any public narrative should lead with that data caveat.`,
        );
      }
    }
  }

  if (pack.analysis === 'uk-production-brief') {
    const production = pack.productionSummary || {};
    const topFarm = pack.tables?.topGeneratingFarms?.[0];
    const topCapacityFactorFarm = pack.tables?.highestCapacityFactorFarms?.[0];
    const unmappedFarm = pack.tables?.unmappedOperationalFarms?.[0];

    if (production.supported === false) {
      highlights.push(production.reason || 'Production reporting is not available for this database yet.');
    } else {
      highlights.push(
        `The selected UK slice generated ${formatNumber(production.totalGenerationMwh)} MWh in ${production.windowLabel || 'the latest production window'}.`,
      );

      if (production.deltaGenerationPct != null) {
        const direction = Number(production.deltaGenerationPct) >= 0 ? 'up' : 'down';
        highlights.push(
          `That is ${direction} ${formatNumber(Math.abs(Number(production.deltaGenerationPct)))}% versus the previous comparison window.`,
        );
      }

      if (topFarm) {
        highlights.push(
          `${topFarm.name} led the slice with ${formatNumber(topFarm.current_generation_mwh)} MWh of metered generation.`,
        );
      }

      if (topCapacityFactorFarm) {
        highlights.push(
          `${topCapacityFactorFarm.name} posted the strongest estimated capacity factor at ${formatNumber(topCapacityFactorFarm.capacity_factor_pct)}%.`,
        );
      }

      if (unmappedFarm) {
        highlights.push(
          `${unmappedFarm.name} is a large coverage gap because it has ${formatNumber(unmappedFarm.power_mw)} MW recorded capacity but no active BMU mapping.`,
        );
      }
    }
  }

  return highlights;
}

export function renderAnalysisMarkdown(pack) {
  const lines = [
    `# ${pack.title}`,
    '',
    `Generated at: ${pack.generatedAt}`,
    `Filters: ${formatFilters(pack.filters)}`,
    '',
    '## Key Insights',
  ];

  for (const highlight of buildAnalysisHighlights(pack)) {
    lines.push(`- ${highlight}`);
  }

  lines.push('', '## Metrics');
  lines.push(`- Wind farms: ${formatNumber(pack.summary?.wind_farm_count)}`);
  lines.push(`- Countries: ${formatNumber(pack.summary?.country_count)}`);
  lines.push(`- Recorded capacity MW: ${formatNumber(pack.summary?.total_capacity_mw)}`);
  lines.push(`- Average capacity MW: ${formatNumber(pack.summary?.average_capacity_mw)}`);
  lines.push(`- Average turbine count: ${formatNumber(pack.summary?.average_turbine_count)}`);

  if (pack.analysis === 'research-coverage' || pack.analysis === 'priority-targets') {
    lines.push(`- Published reports: ${formatNumber(pack.researchCoverage?.published_count)}`);
    lines.push(`- Draft reports: ${formatNumber(pack.researchCoverage?.draft_count)}`);
    lines.push(`- Farms without reports: ${formatNumber(pack.researchCoverage?.missing_count)}`);
  }

  if (pack.windFarm) {
    lines.push('', '## Focus Farm');
    lines.push(`- Wind farm: ${pack.windFarm.name}`);
    lines.push(`- Country: ${pack.windFarm.country || 'n/a'}`);
    lines.push(`- Type: ${pack.windFarm.type || 'n/a'}`);
    lines.push(`- Status: ${pack.windFarm.status || 'n/a'}`);
    lines.push(`- Recorded capacity MW: ${formatNumber(pack.windFarm.power_mw)}`);
    lines.push(`- Turbines: ${formatNumber(pack.windFarm.turbine_count)}`);
    lines.push(`- Start year: ${formatNumber(pack.windFarm.start_year)}`);
  }

  if (pack.productionWindow) {
    lines.push('', '## Production Window');
    lines.push(`- Current window: ${pack.productionWindow.startDate || 'n/a'} to ${pack.productionWindow.endDate || 'n/a'}`);
    lines.push(`- Previous window: ${pack.productionWindow.previousStartDate || 'n/a'} to ${pack.productionWindow.previousEndDate || 'n/a'}`);
    lines.push(`- Latest available settlement date: ${pack.productionWindow.latestAvailableDate || 'n/a'}`);
  }

  if (pack.productionSummary) {
    lines.push('', '## Production Snapshot');
    lines.push(`- Production supported: ${pack.productionSummary.supported === false ? 'no' : 'yes'}`);

    if (pack.productionSummary.reason) {
      lines.push(`- Support note: ${pack.productionSummary.reason}`);
    }

    lines.push(`- Current generation MWh: ${formatNumber(pack.productionSummary.totalGenerationMwh)}`);
    lines.push(`- Previous generation MWh: ${formatNumber(pack.productionSummary.previousGenerationMwh)}`);
    lines.push(`- Delta generation MWh: ${formatNumber(pack.productionSummary.deltaGenerationMwh)}`);
    lines.push(`- Delta generation %: ${formatNumber(pack.productionSummary.deltaGenerationPct)}`);
    lines.push(`- Average daily generation MWh: ${formatNumber(pack.productionSummary.averageDailyGenerationMwh)}`);
    lines.push(`- Estimated capacity factor %: ${formatNumber(pack.productionSummary.capacityFactorPct)}`);
    lines.push(`- Window days with data: ${formatNumber(pack.productionSummary.currentDayCount)}`);
    lines.push(`- Mapped BMUs: ${formatNumber(pack.productionSummary.mappedBmuCount)}`);

    if (pack.productionSummary.generationRank) {
      lines.push(`- Generation rank: ${formatNumber(pack.productionSummary.generationRank)} of ${formatNumber(pack.productionSummary.peerCount)}`);
    }

    if (pack.productionSummary.capacityFactorRank) {
      lines.push(`- Capacity factor rank: ${formatNumber(pack.productionSummary.capacityFactorRank)} of ${formatNumber(pack.productionSummary.peerCount)}`);
    }

    if (pack.productionSummary.mappedCapacityMw != null) {
      lines.push(`- Mapped capacity MW: ${formatNumber(pack.productionSummary.mappedCapacityMw)}`);
    }

    if (pack.productionSummary.unmappedCapacityMw != null) {
      lines.push(`- Unmapped capacity MW: ${formatNumber(pack.productionSummary.unmappedCapacityMw)}`);
    }
  }

  if (Array.isArray(pack.storyAngles) && pack.storyAngles.length > 0) {
    lines.push('', '## LinkedIn Angles');

    for (const item of pack.storyAngles) {
      const fragments = [item.angle];
      if (item.evidence) {
        fragments.push(`Evidence: ${item.evidence}`);
      }
      if (item.caveat) {
        fragments.push(`Caveat: ${item.caveat}`);
      }
      lines.push(`- ${fragments.join(' ')}`);
    }
  }

  const tableSections = [];

  if (pack.tables?.countryBreakdown) {
    tableSections.push({
      title: 'Country Breakdown',
      rows: pack.tables.countryBreakdown,
      columns: [
        { key: 'country', label: 'Country' },
        { key: 'wind_farm_count', label: 'Farms', type: 'number' },
        { key: 'total_capacity_mw', label: 'Capacity MW', type: 'number' },
        { key: 'operational_count', label: 'Operational', type: 'number' },
      ],
    });
  }

  if (pack.tables?.statusBreakdown) {
    tableSections.push({
      title: 'Status Breakdown',
      rows: pack.tables.statusBreakdown,
      columns: [
        { key: 'status', label: 'Status' },
        { key: 'wind_farm_count', label: 'Farms', type: 'number' },
        { key: 'total_capacity_mw', label: 'Capacity MW', type: 'number' },
      ],
    });
  }

  if (pack.tables?.missingMetadata) {
    tableSections.push({
      title: 'Missing Metadata',
      rows: pack.tables.missingMetadata,
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'name', label: 'Name' },
        { key: 'country', label: 'Country' },
        { key: 'status', label: 'Status' },
        { key: 'power_mw', label: 'Capacity MW', type: 'number' },
        { key: 'turbine_count', label: 'Turbines', type: 'number' },
        { key: 'missing_field_count', label: 'Missing Fields', type: 'number' },
      ],
    });
  }

  if (pack.tables?.capacityMismatchCandidates) {
    tableSections.push({
      title: 'Capacity Mismatch Candidates',
      rows: pack.tables.capacityMismatchCandidates,
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'name', label: 'Name' },
        { key: 'country', label: 'Country' },
        { key: 'recorded_capacity_mw', label: 'Recorded MW', type: 'number' },
        { key: 'linked_capacity_mw', label: 'Linked MW', type: 'number' },
        { key: 'absolute_delta_mw', label: 'Delta MW', type: 'number' },
      ],
    });
  }

  if (pack.tables?.unlinkedOperationalFarms) {
    tableSections.push({
      title: 'Operational Farms Without Linked Turbines',
      rows: pack.tables.unlinkedOperationalFarms,
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'name', label: 'Name' },
        { key: 'country', label: 'Country' },
        { key: 'power_mw', label: 'Capacity MW', type: 'number' },
        { key: 'linked_turbine_count', label: 'Linked Turbines', type: 'number' },
      ],
    });
  }

  if (pack.tables?.highValueResearchTargets) {
    tableSections.push({
      title: 'High-Value Farms Missing Research',
      rows: pack.tables.highValueResearchTargets,
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'name', label: 'Name' },
        { key: 'country', label: 'Country' },
        { key: 'status', label: 'Status' },
        { key: 'power_mw', label: 'Capacity MW', type: 'number' },
        { key: 'turbine_count', label: 'Turbines', type: 'number' },
      ],
    });
  }

  if (pack.tables?.recentReportActivity) {
    tableSections.push({
      title: 'Recent Report Activity',
      rows: pack.tables.recentReportActivity,
      columns: [
        { key: 'wind_farm_id', label: 'Wind Farm ID', type: 'number' },
        { key: 'name', label: 'Name' },
        { key: 'country', label: 'Country' },
        { key: 'review_status', label: 'Review Status' },
        { key: 'researched_at', label: 'Researched At', type: 'date' },
        { key: 'model_used', label: 'Model' },
      ],
    });
  }

  if (pack.tables?.factConflicts) {
    tableSections.push({
      title: 'Fact Conflicts',
      rows: pack.tables.factConflicts,
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'name', label: 'Name' },
        { key: 'country', label: 'Country' },
        { key: 'field_name', label: 'Field' },
        { key: 'emodnet_value', label: 'EMODnet' },
        { key: 'research_value', label: 'Research' },
        { key: 'community_value', label: 'Community' },
      ],
    });
  }

  if (pack.tables?.dailyGeneration) {
    tableSections.push({
      title: 'Daily Generation',
      rows: pack.tables.dailyGeneration,
      columns: [
        { key: 'settlement_date', label: 'Date', type: 'date' },
        { key: 'generation_mwh', label: 'Generation MWh', type: 'number' },
        { key: 'interval_count', label: 'Intervals', type: 'number' },
        { key: 'published_at', label: 'Published At', type: 'date' },
      ],
    });
  }

  if (pack.tables?.linkedBmus) {
    tableSections.push({
      title: 'Linked BMUs',
      rows: pack.tables.linkedBmus,
      columns: [
        { key: 'bmu_id', label: 'BMU ID' },
        { key: 'national_grid_bmu_id', label: 'National Grid BMU' },
        { key: 'bm_unit_name', label: 'BM Unit Name' },
        { key: 'lead_party_name', label: 'Lead Party' },
        { key: 'allocation_factor', label: 'Allocation', type: 'number' },
        { key: 'confidence', label: 'Confidence', type: 'number' },
        { key: 'mapping_source', label: 'Source' },
      ],
    });
  }

  if (pack.tables?.peerComparison) {
    tableSections.push({
      title: 'Peer Comparison',
      rows: pack.tables.peerComparison,
      columns: [
        { key: 'generation_rank', label: 'Rank', type: 'number' },
        { key: 'name', label: 'Wind Farm' },
        { key: 'current_generation_mwh', label: 'Current MWh', type: 'number' },
        { key: 'delta_generation_pct', label: 'Delta %', type: 'number' },
        { key: 'capacity_factor_pct', label: 'Capacity Factor %', type: 'number' },
        { key: 'mapped_bmu_count', label: 'Mapped BMUs', type: 'number' },
      ],
    });
  }

  if (pack.tables?.topGeneratingFarms) {
    tableSections.push({
      title: 'Top Generating Farms',
      rows: pack.tables.topGeneratingFarms,
      columns: [
        { key: 'generation_rank', label: 'Rank', type: 'number' },
        { key: 'name', label: 'Wind Farm' },
        { key: 'current_generation_mwh', label: 'Current MWh', type: 'number' },
        { key: 'delta_generation_pct', label: 'Delta %', type: 'number' },
        { key: 'capacity_factor_pct', label: 'Capacity Factor %', type: 'number' },
        { key: 'mapped_bmu_count', label: 'Mapped BMUs', type: 'number' },
      ],
    });
  }

  if (pack.tables?.highestCapacityFactorFarms) {
    tableSections.push({
      title: 'Highest Capacity Factor Farms',
      rows: pack.tables.highestCapacityFactorFarms,
      columns: [
        { key: 'capacity_factor_rank', label: 'Rank', type: 'number' },
        { key: 'name', label: 'Wind Farm' },
        { key: 'capacity_factor_pct', label: 'Capacity Factor %', type: 'number' },
        { key: 'current_generation_mwh', label: 'Current MWh', type: 'number' },
        { key: 'power_mw', label: 'Capacity MW', type: 'number' },
      ],
    });
  }

  if (pack.tables?.biggestGains) {
    tableSections.push({
      title: 'Biggest Gains',
      rows: pack.tables.biggestGains,
      columns: [
        { key: 'name', label: 'Wind Farm' },
        { key: 'delta_generation_pct', label: 'Delta %', type: 'number' },
        { key: 'delta_generation_mwh', label: 'Delta MWh', type: 'number' },
        { key: 'current_generation_mwh', label: 'Current MWh', type: 'number' },
        { key: 'previous_generation_mwh', label: 'Previous MWh', type: 'number' },
      ],
    });
  }

  if (pack.tables?.biggestDrops) {
    tableSections.push({
      title: 'Biggest Drops',
      rows: pack.tables.biggestDrops,
      columns: [
        { key: 'name', label: 'Wind Farm' },
        { key: 'delta_generation_pct', label: 'Delta %', type: 'number' },
        { key: 'delta_generation_mwh', label: 'Delta MWh', type: 'number' },
        { key: 'current_generation_mwh', label: 'Current MWh', type: 'number' },
        { key: 'previous_generation_mwh', label: 'Previous MWh', type: 'number' },
      ],
    });
  }

  if (pack.tables?.unmappedOperationalFarms) {
    tableSections.push({
      title: 'Unmapped Operational Farms',
      rows: pack.tables.unmappedOperationalFarms,
      columns: [
        { key: 'name', label: 'Wind Farm' },
        { key: 'country', label: 'Country' },
        { key: 'power_mw', label: 'Capacity MW', type: 'number' },
        { key: 'status', label: 'Status' },
        { key: 'mapped_bmu_count', label: 'Mapped BMUs', type: 'number' },
      ],
    });
  }

  for (const section of tableSections) {
    lines.push('', `## ${section.title}`, renderRowsTable(section.rows, section.columns));
  }

  return `${lines.join('\n')}\n`;
}

export function renderQuestionFallbackMarkdown({ question, analyses, packs }) {
  const lines = [
    '# Database Answer',
    '',
    `Question: ${question}`,
    `Routed analyses: ${analyses.join(', ')}`,
    '',
    '## Answer',
    'AI synthesis is disabled, so this is a deterministic summary of the routed analysis packs.',
    '',
    '## Evidence',
  ];

  for (const pack of packs) {
    for (const highlight of buildAnalysisHighlights(pack)) {
      lines.push(`- [${pack.title}] ${highlight}`);
    }
  }

  lines.push('', '## Recommended Next Step');
  lines.push('- Enable `AI_PROVIDER=codex` or `AI_PROVIDER=openrouter` if you want a natural-language answer grounded in the same SQL output.');

  return `${lines.join('\n')}\n`;
}
