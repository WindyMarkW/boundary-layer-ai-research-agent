export function routeQuestionToAnalyses(question) {
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

  if (analyses.size === 0) {
    analyses.add('portfolio-overview');
    analyses.add('data-quality');
    analyses.add('research-coverage');
  }

  return [...analyses];
}
