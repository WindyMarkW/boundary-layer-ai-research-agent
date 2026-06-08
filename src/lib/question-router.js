export function routeQuestionToAnalyses(question, filters = {}) {
  const normalized = String(question || '').trim().toLowerCase();

  if (!normalized) {
    return ['portfolio-overview', 'data-quality', 'research-coverage'];
  }

  const analyses = new Set();

  if (/(portfolio|overview|summary|capacity|country|status)/.test(normalized)) {
    analyses.add('portfolio-overview');
  }

  if (/(data quality|quality|mismatch|missing|suspect|wrong|conflict|gap|anomal)/.test(normalized)) {
    analyses.add('data-quality');
  }

  if (/(research|report|draft|published|coverage|moderation)/.test(normalized)) {
    analyses.add('research-coverage');
  }

  if (/(next|priority|priorit|should we|where should|what should we research)/.test(normalized)) {
    analyses.add('priority-targets');
  }

  const hasProductionIntent = /(production|generate|generation|output|load factor|capacity factor|metered|mwh)/.test(normalized);
  const hasWindFarmTarget = Boolean(
    (Array.isArray(filters.ids) && filters.ids.length > 0) ||
    (typeof filters.windFarmName === 'string' && filters.windFarmName.trim()),
  );

  if (hasProductionIntent) {
    analyses.add('uk-production-brief');

    if (hasWindFarmTarget || /(this farm|that farm|site profile|single farm|specific farm)/.test(normalized)) {
      analyses.add('wind-farm-production');
    }
  }

  if (analyses.size === 0) {
    analyses.add('portfolio-overview');
    analyses.add('data-quality');
    analyses.add('research-coverage');
  }

  return [...analyses];
}
