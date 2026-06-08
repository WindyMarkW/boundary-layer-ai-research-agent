import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { listAnalysisDefinitions } from './lib/analysis-definitions.js';
import { requestInternalAnalysis } from './lib/internal-api.js';
import { parseRunInsightsArgs } from './run-insights.js';

export function parseHermesAnalysisArgs(argv) {
  const parsed = parseRunInsightsArgs(argv);
  const saveArtifacts = argv.includes('--save') ? true : false;

  return {
    ...parsed,
    saveArtifacts,
    outputJson: argv.includes('--json'),
  };
}

async function main() {
  const args = parseHermesAnalysisArgs(process.argv.slice(2));

  if (args.listAnalyses) {
    for (const definition of listAnalysisDefinitions()) {
      console.log(`${definition.name} - ${definition.description}`);
    }
    return;
  }

  const result = await requestInternalAnalysis({
    analysis: args.analysis,
    filters: args.filters,
    aiSummary: args.aiSummary,
    provider: args.provider,
    saveArtifacts: args.saveArtifacts,
  });

  if (args.outputJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(result.markdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
