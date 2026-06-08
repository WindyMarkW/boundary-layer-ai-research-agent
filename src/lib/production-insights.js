function toNumber(value) {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function roundNumber(value, digits = 2) {
  const numeric = toNumber(value);
  if (numeric == null) {
    return null;
  }

  return Number(numeric.toFixed(digits));
}

function compareDescending(left, right, selector) {
  const leftValue = toNumber(selector(left));
  const rightValue = toNumber(selector(right));

  if (leftValue == null && rightValue == null) {
    return 0;
  }

  if (leftValue == null) {
    return 1;
  }

  if (rightValue == null) {
    return -1;
  }

  return rightValue - leftValue;
}

function compareAscending(left, right, selector) {
  return compareDescending(right, left, selector);
}

function withRank(rows, selector, rankKey) {
  const sorted = [...rows].sort((left, right) => compareDescending(left, right, selector));
  const ranks = new Map();

  let previousValue = null;
  let currentRank = 0;

  sorted.forEach((row, index) => {
    const value = toNumber(selector(row));
    if (value == null) {
      ranks.set(row.id, null);
      return;
    }

    if (previousValue == null || value !== previousValue) {
      currentRank = index + 1;
      previousValue = value;
    }

    ranks.set(row.id, currentRank);
  });

  return rows.map((row) => ({
    ...row,
    [rankKey]: ranks.get(row.id) ?? null,
  }));
}

export function annotateProductionRanks(rows = []) {
  const withGenerationRank = withRank(rows, (row) => row.current_generation_mwh, 'generation_rank');
  return withRank(withGenerationRank, (row) => row.capacity_factor_pct, 'capacity_factor_rank');
}

export function buildProductionSupportState(capabilities = {}, productionWindow = {}) {
  const productionTablesReady =
    capabilities.hasGenerationOutturn === true && capabilities.hasWindFarmBmuLinks === true;

  return {
    supported: productionTablesReady && productionWindow.supported === true,
    productionTablesReady,
    reason:
      productionTablesReady && productionWindow.supported === true
        ? null
        : !productionTablesReady
          ? 'The Elexon generation outturn or wind-farm BMU mapping tables are missing in this database.'
          : 'No production window could be resolved from the available generation data.',
  };
}

export function summarizeWindFarmProduction(row, productionWindow, peerCount, coverage = null) {
  const currentGeneration = toNumber(row?.current_generation_mwh) || 0;
  const previousGeneration = toNumber(row?.previous_generation_mwh) || 0;
  const currentDayCount = toNumber(row?.current_day_count) || 0;

  return {
    totalGenerationMwh: roundNumber(currentGeneration, 3) ?? 0,
    previousGenerationMwh: roundNumber(previousGeneration, 3) ?? 0,
    deltaGenerationMwh: roundNumber(row?.delta_generation_mwh, 3) ?? 0,
    deltaGenerationPct: roundNumber(row?.delta_generation_pct, 2),
    averageDailyGenerationMwh: roundNumber(row?.average_daily_generation_mwh, 3) ?? 0,
    capacityFactorPct: roundNumber(row?.capacity_factor_pct, 2),
    currentDayCount,
    previousDayCount: toNumber(row?.previous_day_count) || 0,
    currentIntervalCount: toNumber(row?.current_interval_count) || 0,
    latestSettlementDate: row?.latest_settlement_date || null,
    latestPublishedAt: row?.latest_published_at || null,
    mappedBmuCount: toNumber(row?.mapped_bmu_count) || 0,
    averageMappingConfidence: roundNumber(row?.average_mapping_confidence, 3),
    totalAllocationFactor: roundNumber(row?.total_allocation_factor, 3),
    generationRank: toNumber(row?.generation_rank),
    capacityFactorRank: toNumber(row?.capacity_factor_rank),
    peerCount,
    coverage,
    windowLabel: productionWindow.label,
  };
}

export function summarizeUkProduction(rows = [], productionWindow) {
  const activeRows = rows.filter((row) => (toNumber(row.current_generation_mwh) || 0) > 0);
  const totalGeneration = rows.reduce((sum, row) => sum + (toNumber(row.current_generation_mwh) || 0), 0);
  const totalPreviousGeneration = rows.reduce((sum, row) => sum + (toNumber(row.previous_generation_mwh) || 0), 0);
  const mappedCapacity = rows.reduce((sum, row) => {
    if ((toNumber(row.mapped_bmu_count) || 0) <= 0) {
      return sum;
    }

    return sum + (toNumber(row.power_mw) || 0);
  }, 0);
  const unmappedOperationalRows = rows.filter((row) => (toNumber(row.mapped_bmu_count) || 0) <= 0);
  const totalCapacity = rows.reduce((sum, row) => sum + (toNumber(row.power_mw) || 0), 0);
  const dayCount = productionWindow.dayCount || 0;

  return {
    totalGenerationMwh: roundNumber(totalGeneration, 3) ?? 0,
    previousGenerationMwh: roundNumber(totalPreviousGeneration, 3) ?? 0,
    deltaGenerationMwh: roundNumber(totalGeneration - totalPreviousGeneration, 3) ?? 0,
    deltaGenerationPct:
      totalPreviousGeneration > 0
        ? roundNumber(((totalGeneration - totalPreviousGeneration) / totalPreviousGeneration) * 100, 2)
        : null,
    averageDailyGenerationMwh: dayCount > 0 ? roundNumber(totalGeneration / dayCount, 3) : null,
    mappedCapacityMw: roundNumber(mappedCapacity, 2) ?? 0,
    unmappedCapacityMw: roundNumber(totalCapacity - mappedCapacity, 2) ?? 0,
    windFarmCountWithGeneration: activeRows.length,
    windFarmCountWithoutMappings: unmappedOperationalRows.length,
    capacityFactorPct:
      totalCapacity > 0 && dayCount > 0
        ? roundNumber((totalGeneration / (totalCapacity * dayCount * 24)) * 100, 2)
        : null,
    latestSettlementDate:
      rows
        .map((row) => row.latest_settlement_date)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
    windowLabel: productionWindow.label,
  };
}

function buildStoryAngle(angle, evidence, caveat = null) {
  return { angle, evidence, caveat };
}

export function buildWindFarmStoryAngles(row, productionWindow) {
  if (!row) {
    return [];
  }

  const dayCount = productionWindow.dayCount || 0;
  const currentGeneration = roundNumber(row.current_generation_mwh, 1) ?? 0;
  const capacityFactor = roundNumber(row.capacity_factor_pct, 2);
  const generationRank = toNumber(row.generation_rank);
  const rankLabel = generationRank ? `ranked #${generationRank}` : 'is unranked';
  const peerCount = toNumber(row.peer_count);
  const angles = [
    buildStoryAngle(
      `${row.name} generated ${currentGeneration} MWh over the last ${dayCount} days and ${rankLabel} by metered output in the selected UK slice.`,
      `Current-window generation: ${currentGeneration} MWh. Generation rank: ${generationRank || 'n/a'} of ${peerCount || 'n/a'}.`,
      row.mapped_bmu_count > 0 ? null : 'This farm currently has no BMU mapping, so the outturn feed may be incomplete.',
    ),
  ];

  if (capacityFactor != null) {
    angles.push(
      buildStoryAngle(
        `${row.name} posted an estimated ${capacityFactor}% metered capacity factor across the latest reporting window.`,
        `Estimated capacity factor: ${capacityFactor}% from ${roundNumber(row.current_generation_mwh, 1)} MWh over ${dayCount} covered days.`,
        (toNumber(row.current_day_count) || 0) < productionWindow.dayCount
          ? `Only ${row.current_day_count} of ${productionWindow.dayCount} days had generation rows in the window.`
          : null,
      ),
    );
  }

  if (toNumber(row.delta_generation_pct) != null) {
    const delta = roundNumber(row.delta_generation_pct, 2);
    const direction = delta >= 0 ? 'up' : 'down';
    angles.push(
      buildStoryAngle(
        `${row.name} is ${direction} ${Math.abs(delta)}% versus the previous ${dayCount}-day window.`,
        `Current window: ${roundNumber(row.current_generation_mwh, 1)} MWh. Previous window: ${roundNumber(row.previous_generation_mwh, 1)} MWh.`,
        row.previous_generation_mwh > 0 ? null : 'The previous comparison window had little or no metered generation, so percentage moves may be noisy.',
      ),
    );
  }

  if ((toNumber(row.mapped_bmu_count) || 0) <= 0) {
    angles.push(
      buildStoryAngle(
        `${row.name} is a data-story candidate because it has portfolio metadata but no BMU mapping into the Elexon outturn feed.`,
        'No active generation mappings were found for this farm in core_wind_farm_bmu_links.',
        'This is a data availability issue rather than a confirmed production issue.',
      ),
    );
  }

  return angles.slice(0, 4);
}

export function buildUkStoryAngles(rows = [], productionWindow) {
  if (rows.length === 0) {
    return [];
  }

  const sortedByGeneration = [...rows].sort((left, right) => compareDescending(left, right, (row) => row.current_generation_mwh));
  const sortedByCapacityFactor = [...rows]
    .filter((row) => toNumber(row.capacity_factor_pct) != null)
    .sort((left, right) => compareDescending(left, right, (row) => row.capacity_factor_pct));
  const biggestGain = [...rows]
    .filter(
      (row) =>
        (toNumber(row.previous_generation_mwh) || 0) >= 250 &&
        (toNumber(row.delta_generation_pct) || 0) > 0,
    )
    .sort((left, right) => compareDescending(left, right, (row) => row.delta_generation_pct))[0];
  const biggestDrop = [...rows]
    .filter(
      (row) =>
        (toNumber(row.previous_generation_mwh) || 0) >= 250 &&
        (toNumber(row.delta_generation_pct) || 0) < 0,
    )
    .sort((left, right) => compareAscending(left, right, (row) => row.delta_generation_pct))[0];
  const unmappedLargeFarm = [...rows]
    .filter((row) => (toNumber(row.mapped_bmu_count) || 0) <= 0)
    .sort((left, right) => compareDescending(left, right, (row) => row.power_mw))[0];
  const angles = [];

  if (sortedByGeneration[0]) {
    const leader = sortedByGeneration[0];
    angles.push(
      buildStoryAngle(
        `${leader.name} led the selected UK slice with ${roundNumber(leader.current_generation_mwh, 1)} MWh over the last ${productionWindow.dayCount} days.`,
        `Top metered output in window ${productionWindow.label}. Estimated capacity factor: ${roundNumber(leader.capacity_factor_pct, 2) ?? 'n/a'}%.`,
        leader.current_day_count < productionWindow.dayCount
          ? `Only ${leader.current_day_count} covered days were returned for this farm in the current window.`
          : null,
      ),
    );
  }

  if (sortedByCapacityFactor[0]) {
    const leader = sortedByCapacityFactor[0];
    angles.push(
      buildStoryAngle(
        `${leader.name} delivered the strongest estimated metered capacity factor in the slice at ${roundNumber(leader.capacity_factor_pct, 2)}%.`,
        `Current-window generation: ${roundNumber(leader.current_generation_mwh, 1)} MWh from a recorded ${roundNumber(leader.power_mw, 1)} MW asset.`,
        leader.power_mw == null ? 'Capacity factor is unavailable when recorded farm capacity is missing.' : null,
      ),
    );
  }

  if (biggestGain) {
    angles.push(
      buildStoryAngle(
        `${biggestGain.name} had the sharpest week-on-week gain in metered output at ${roundNumber(biggestGain.delta_generation_pct, 2)}%.`,
        `Current window: ${roundNumber(biggestGain.current_generation_mwh, 1)} MWh. Previous window: ${roundNumber(biggestGain.previous_generation_mwh, 1)} MWh.`,
        null,
      ),
    );
  }

  if (biggestDrop) {
    angles.push(
      buildStoryAngle(
        `${biggestDrop.name} saw the steepest week-on-week pullback at ${Math.abs(roundNumber(biggestDrop.delta_generation_pct, 2) ?? 0)}%.`,
        `Current window: ${roundNumber(biggestDrop.current_generation_mwh, 1)} MWh. Previous window: ${roundNumber(biggestDrop.previous_generation_mwh, 1)} MWh.`,
        null,
      ),
    );
  }

  if (unmappedLargeFarm) {
    angles.push(
      buildStoryAngle(
        `${unmappedLargeFarm.name} is a follow-up data story because it is a ${roundNumber(unmappedLargeFarm.power_mw, 1)} MW asset without an active BMU mapping into the metered output feed.`,
        'No active generation mappings were found for this operational wind farm in core_wind_farm_bmu_links.',
        'The missing mapping limits how confidently you can compare this farm against the rest of the UK slice.',
      ),
    );
  }

  return angles.slice(0, 5);
}

export function buildWindFarmPeerRows(rows = [], targetId, radius = 2) {
  const sorted = [...rows].sort((left, right) => compareDescending(left, right, (row) => row.current_generation_mwh));
  const targetIndex = sorted.findIndex((row) => row.id === targetId);

  if (targetIndex === -1) {
    return [];
  }

  const start = Math.max(0, targetIndex - radius);
  const end = Math.min(sorted.length, targetIndex + radius + 1);
  return sorted.slice(start, end);
}

export function buildUkProductionTables(rows = []) {
  const sortableRows = [...rows];
  const topGeneratingFarms = sortableRows
    .sort((left, right) => compareDescending(left, right, (row) => row.current_generation_mwh))
    .slice(0, 10);
  const highestCapacityFactorFarms = [...rows]
    .filter((row) => toNumber(row.capacity_factor_pct) != null)
    .sort((left, right) => compareDescending(left, right, (row) => row.capacity_factor_pct))
    .slice(0, 10);
  const biggestGains = [...rows]
    .filter(
      (row) =>
        (toNumber(row.previous_generation_mwh) || 0) >= 250 &&
        (toNumber(row.delta_generation_pct) || 0) > 0,
    )
    .sort((left, right) => compareDescending(left, right, (row) => row.delta_generation_pct))
    .slice(0, 10);
  const biggestDrops = [...rows]
    .filter(
      (row) =>
        (toNumber(row.previous_generation_mwh) || 0) >= 250 &&
        (toNumber(row.delta_generation_pct) || 0) < 0,
    )
    .sort((left, right) => compareAscending(left, right, (row) => row.delta_generation_pct))
    .slice(0, 10);
  const unmappedOperationalFarms = [...rows]
    .filter((row) => (toNumber(row.mapped_bmu_count) || 0) <= 0)
    .sort((left, right) => compareDescending(left, right, (row) => row.power_mw))
    .slice(0, 10);

  return {
    topGeneratingFarms,
    highestCapacityFactorFarms,
    biggestGains,
    biggestDrops,
    unmappedOperationalFarms,
  };
}
