import { getAnalysisDefinition } from './analysis-definitions.js';
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

  throw new Error(`Unsupported analysis: ${analysis}`);
}
