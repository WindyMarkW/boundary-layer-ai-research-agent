export const ANALYSIS_DEFINITIONS = [
  {
    name: 'portfolio-overview',
    title: 'Portfolio Overview',
    description: 'High-level mix, capacity, and status breakdowns for the active wind farm portfolio.',
  },
  {
    name: 'data-quality',
    title: 'Data Quality',
    description: 'Missing metadata, suspicious capacity mismatches, and turbine-link coverage gaps.',
  },
  {
    name: 'research-coverage',
    title: 'Research Coverage',
    description: 'Coverage of research reports, published-vs-draft spread, and high-value farms still missing reports.',
  },
  {
    name: 'priority-targets',
    title: 'Priority Targets',
    description: 'Combined queue of the most valuable next research and cleanup targets.',
  },
  {
    name: 'wind-farm-production',
    title: 'Wind Farm Production Report',
    description: 'Single-farm metered generation brief with UK ranking context, daily trend, and post-ready story angles.',
  },
  {
    name: 'uk-production-brief',
    title: 'UK Production Brief',
    description: 'UK-wide metered generation overview with leaders, movers, coverage gaps, and LinkedIn-friendly story hooks.',
  },
];

const ANALYSIS_BY_NAME = new Map(
  ANALYSIS_DEFINITIONS.map((definition) => [definition.name, definition]),
);

export function listAnalysisDefinitions() {
  return [...ANALYSIS_DEFINITIONS];
}

export function getAnalysisDefinition(name) {
  const definition = ANALYSIS_BY_NAME.get(name);

  if (!definition) {
    throw new Error(
      `Unsupported analysis "${name}". Use one of: ${ANALYSIS_DEFINITIONS.map((item) => item.name).join(', ')}.`,
    );
  }

  return definition;
}
