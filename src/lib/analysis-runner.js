import { getAnalysisDefinition } from './analysis-definitions.js';
import {
  annotateProductionRanks,
  buildProductionSupportState,
  buildUkProductionTables,
  buildUkStoryAngles,
  buildWindFarmPeerRows,
  buildWindFarmStoryAngles,
  summarizeUkProduction,
  summarizeWindFarmProduction,
} from './production-insights.js';
import {
  buildProductionUniverseFilters,
  fetchProductionRankingRows,
  fetchWindFarmBmuMappings,
  fetchWindFarmDailyGeneration,
  resolveProductionWindow,
} from './production-queries.js';
import {
  fetchCapacityMismatchCandidates,
  fetchCountryBreakdown,
  fetchFactConflicts,
  fetchHighValueResearchTargets,
  fetchMissingMetadata,
  fetchPortfolioSummary,
  fetchRecentReportActivity,
  fetchResearchCoverageSummary,
  fetchStatusBreakdown,
  fetchUnlinkedOperationalFarms,
  getSchemaCapabilities,
} from './queries.js';

function buildTargetProductionFilters(filters = {}) {
  const universeFilters = buildProductionUniverseFilters(filters);

  return {
    ...universeFilters,
    ids: Array.isArray(filters.ids) && filters.ids.length > 0 ? [...filters.ids] : null,
    windFarmName: typeof filters.windFarmName === 'string' && filters.windFarmName.trim()
      ? filters.windFarmName.trim()
      : null,
  };
}

function requireWindFarmTarget(filters = {}) {
  if (Array.isArray(filters.ids) && filters.ids.length > 0) {
    return;
  }

  if (typeof filters.windFarmName === 'string' && filters.windFarmName.trim()) {
    return;
  }

  throw new Error('wind-farm-production requires --ids or --wind-farm-name so the agent knows which farm to profile.');
}

function requireSingleWindFarm(rows, filters = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const targetLabel =
      (Array.isArray(filters.ids) && filters.ids.length > 0 && `ids=${filters.ids.join(',')}`) ||
      (filters.windFarmName && `windFarmName=${filters.windFarmName}`) ||
      'the supplied filters';
    throw new Error(`No active wind farm matched ${targetLabel}.`);
  }

  if (rows.length > 1) {
    throw new Error(
      `wind-farm-production matched ${rows.length} farms. Narrow the selection with a single id or an exact wind-farm name.`,
    );
  }

  return rows[0];
}

export async function buildAnalysisPack(client, { analysis, filters = {} }) {
  const definition = getAnalysisDefinition(analysis);
  const capabilities = await getSchemaCapabilities(client);
  const generatedAt = new Date().toISOString();

  if (definition.name === 'portfolio-overview') {
    const summary = await fetchPortfolioSummary(client, filters);
    const countryBreakdown = await fetchCountryBreakdown(client, filters);
    const statusBreakdown = await fetchStatusBreakdown(client, filters);
    const missingMetadata = await fetchMissingMetadata(client, filters);

    return {
      analysis: definition.name,
      title: definition.title,
      description: definition.description,
      generatedAt,
      filters,
      capabilities,
      summary,
      tables: {
        countryBreakdown,
        statusBreakdown,
        missingMetadata,
      },
    };
  }

  if (definition.name === 'data-quality') {
    const summary = await fetchPortfolioSummary(client, filters);
    const missingMetadata = await fetchMissingMetadata(client, filters);
    const capacityMismatchCandidates = await fetchCapacityMismatchCandidates(client, filters);
    const unlinkedOperationalFarms = await fetchUnlinkedOperationalFarms(client, filters);
    const factConflicts = await fetchFactConflicts(client, filters, capabilities);

    return {
      analysis: definition.name,
      title: definition.title,
      description: definition.description,
      generatedAt,
      filters,
      capabilities,
      summary,
      tables: {
        missingMetadata,
        capacityMismatchCandidates,
        unlinkedOperationalFarms,
        factConflicts,
      },
    };
  }

  if (definition.name === 'research-coverage') {
    const summary = await fetchPortfolioSummary(client, filters);
    const researchCoverage = await fetchResearchCoverageSummary(client, filters, capabilities);
    const highValueResearchTargets = await fetchHighValueResearchTargets(client, filters, capabilities);
    const recentReportActivity = await fetchRecentReportActivity(client, filters, capabilities);
    const factConflicts = await fetchFactConflicts(client, filters, capabilities);

    return {
      analysis: definition.name,
      title: definition.title,
      description: definition.description,
      generatedAt,
      filters,
      capabilities,
      summary,
      researchCoverage,
      tables: {
        highValueResearchTargets,
        recentReportActivity,
        factConflicts,
      },
    };
  }

  if (definition.name === 'priority-targets') {
    const summary = await fetchPortfolioSummary(client, filters);
    const researchCoverage = await fetchResearchCoverageSummary(client, filters, capabilities);
    const highValueResearchTargets = await fetchHighValueResearchTargets(client, filters, capabilities);
    const factConflicts = await fetchFactConflicts(client, filters, capabilities);
    const capacityMismatchCandidates = await fetchCapacityMismatchCandidates(client, filters);
    const missingMetadata = await fetchMissingMetadata(client, filters);

    return {
      analysis: definition.name,
      title: definition.title,
      description: definition.description,
      generatedAt,
      filters,
      capabilities,
      summary,
      researchCoverage,
      prioritySummary: {
        highValueResearchTargetCount: highValueResearchTargets.length,
        factConflictCount: factConflicts.length,
        capacityMismatchCount: capacityMismatchCandidates.length,
        missingMetadataCount: missingMetadata.length,
      },
      tables: {
        highValueResearchTargets,
        factConflicts,
        capacityMismatchCandidates,
        missingMetadata,
      },
    };
  }

  if (definition.name === 'wind-farm-production') {
    requireWindFarmTarget(filters);

    const productionUniverseFilters = buildProductionUniverseFilters(filters);
    const targetFilters = buildTargetProductionFilters(filters);
    const summary = await fetchPortfolioSummary(client, targetFilters);
    const researchCoverage = await fetchResearchCoverageSummary(client, targetFilters, capabilities);
    const productionWindow = await resolveProductionWindow(client, productionUniverseFilters);
    const productionSupport = buildProductionSupportState(capabilities, productionWindow);

    if (!productionSupport.supported) {
      return {
        analysis: definition.name,
        title: definition.title,
        description: definition.description,
        generatedAt,
        filters: targetFilters,
        capabilities,
        summary,
        researchCoverage,
        productionWindow,
        productionSummary: productionSupport,
        storyAngles: [],
        tables: {},
      };
    }

    const productionUniverseRows = annotateProductionRanks(
      await fetchProductionRankingRows(client, productionUniverseFilters, productionWindow),
    );
    const selectedRows = await fetchProductionRankingRows(client, targetFilters, productionWindow);
    const selectedRow = requireSingleWindFarm(selectedRows, targetFilters);
    const rankedRow = productionUniverseRows.find((row) => row.id === selectedRow.id) || selectedRow;
    const focusedFilters = { ...productionUniverseFilters, ids: [rankedRow.id], windFarmName: null };

    const [dailyGeneration, linkedBmus, factConflicts, capacityMismatchCandidates] = await Promise.all([
      fetchWindFarmDailyGeneration(client, focusedFilters, productionWindow),
      fetchWindFarmBmuMappings(client, focusedFilters, productionWindow),
      fetchFactConflicts(client, focusedFilters, capabilities),
      fetchCapacityMismatchCandidates(client, focusedFilters),
    ]);

    const enrichedRow = {
      ...rankedRow,
      peer_count: productionUniverseRows.length,
    };

    return {
      analysis: definition.name,
      title: definition.title,
      description: definition.description,
      generatedAt,
      filters: targetFilters,
      capabilities,
      summary,
      researchCoverage,
      productionWindow,
      windFarm: {
        id: rankedRow.id,
        name: rankedRow.name,
        country: rankedRow.country,
        type: rankedRow.type,
        status: rankedRow.status,
        power_mw: rankedRow.power_mw,
        turbine_count: rankedRow.turbine_count,
        start_year: rankedRow.start_year,
      },
      productionSummary: {
        ...productionSupport,
        ...summarizeWindFarmProduction(enrichedRow, productionWindow, productionUniverseRows.length, researchCoverage),
      },
      storyAngles: buildWindFarmStoryAngles(enrichedRow, productionWindow),
      tables: {
        dailyGeneration,
        linkedBmus,
        peerComparison: buildWindFarmPeerRows(productionUniverseRows, rankedRow.id),
        factConflicts,
        capacityMismatchCandidates,
      },
    };
  }

  if (definition.name === 'uk-production-brief') {
    const productionFilters = buildProductionUniverseFilters(filters);
    const summary = await fetchPortfolioSummary(client, productionFilters);
    const productionWindow = await resolveProductionWindow(client, productionFilters);
    const productionSupport = buildProductionSupportState(capabilities, productionWindow);

    if (!productionSupport.supported) {
      return {
        analysis: definition.name,
        title: definition.title,
        description: definition.description,
        generatedAt,
        filters: productionFilters,
        capabilities,
        summary,
        productionWindow,
        productionSummary: productionSupport,
        storyAngles: [],
        tables: {},
      };
    }

    const productionRows = annotateProductionRanks(
      await fetchProductionRankingRows(client, productionFilters, productionWindow),
    );
    const productionTables = buildUkProductionTables(productionRows);

    return {
      analysis: definition.name,
      title: definition.title,
      description: definition.description,
      generatedAt,
      filters: productionFilters,
      capabilities,
      summary,
      productionWindow,
      productionSummary: {
        ...productionSupport,
        ...summarizeUkProduction(productionRows, productionWindow),
      },
      storyAngles: buildUkStoryAngles(productionRows, productionWindow),
      tables: productionTables,
    };
  }

  throw new Error(`Unsupported analysis: ${analysis}`);
}
