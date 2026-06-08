import process from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabaseClient } from './lib/database.js';
import { buildAnalysisPack } from './lib/analysis-runner.js';
import { listAnalysisDefinitions } from './lib/analysis-definitions.js';
import { requestMarkdownWithProvider } from './lib/ai-provider.js';
import { renderAnalysisMarkdown } from './lib/markdown.js';
import { loadPromptTemplate, buildAnalysisPrompt } from './lib/prompt.js';
import { buildTimestampSlug, getOutputDirectory, saveJsonFile, saveTextFile, slugifyFileSegment } from './lib/report-output.js';
import { parseDateOnlyValue, parsePositiveIntegerValue } from './lib/production-queries.js';
import {
  DEFAULT_AI_PROVIDER,
  DEFAULT_ANALYSIS,
  getAiProvider,
  getApiKeyForProvider,
  getModelForProvider,
} from './lib/runtime-config.js';
import { parseIdsValue } from './lib/queries.js';

function buildFilterLabel(filters = {}) {
  const segments = [
    filters.country || 'all-countries',
    filters.windFarmType || 'all-types',
    filters.status || 'all-statuses',
  ];

  if (filters.windFarmName) {
    segments.push(filters.windFarmName);
  }

  if (Array.isArray(filters.ids) && filters.ids.length > 0) {
    segments.push(`ids-${filters.ids.join('-')}`);
  }

  if (filters.startDate && filters.endDate) {
    segments.push(`${filters.startDate}-to-${filters.endDate}`);
  } else if (filters.lookbackDays) {
    segments.push(`${filters.lookbackDays}d`);
  }

  return slugifyFileSegment(segments.join('-'));
}

export function parseRunInsightsArgs(argv) {
  const args = {
    analysis: DEFAULT_ANALYSIS,
    filters: {},
    aiSummary: false,
    provider: null,
    saveArtifacts: true,
    listAnalyses: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--analysis' && argv[i + 1]) {
      args.analysis = argv[i + 1].trim();
      i += 1;
      continue;
    }

    if (argv[i] === '--country' && argv[i + 1]) {
      args.filters.country = argv[i + 1].trim();
      i += 1;
      continue;
    }

    if (argv[i] === '--wind-farm-type' && argv[i + 1]) {
      args.filters.windFarmType = argv[i + 1].trim();
      i += 1;
      continue;
    }

    if (argv[i] === '--status' && argv[i + 1]) {
      args.filters.status = argv[i + 1].trim();
      i += 1;
      continue;
    }

    if (argv[i] === '--ids' && argv[i + 1]) {
      args.filters.ids = parseIdsValue(argv[i + 1]);
      i += 1;
      continue;
    }

    if (argv[i] === '--wind-farm-name' && argv[i + 1]) {
      args.filters.windFarmName = argv[i + 1].trim();
      i += 1;
      continue;
    }

    if (argv[i] === '--start-date' && argv[i + 1]) {
      args.filters.startDate = parseDateOnlyValue(argv[i + 1], 'start date');
      i += 1;
      continue;
    }

    if (argv[i] === '--end-date' && argv[i + 1]) {
      args.filters.endDate = parseDateOnlyValue(argv[i + 1], 'end date');
      i += 1;
      continue;
    }

    if (argv[i] === '--lookback-days' && argv[i + 1]) {
      args.filters.lookbackDays = parsePositiveIntegerValue(argv[i + 1], 'lookback days');
      i += 1;
      continue;
    }

    if (argv[i] === '--provider' && argv[i + 1]) {
      args.provider = argv[i + 1].trim();
      i += 1;
      continue;
    }

    if (argv[i] === '--ai-summary') {
      args.aiSummary = true;
      continue;
    }

    if (argv[i] === '--no-save') {
      args.saveArtifacts = false;
      continue;
    }

    if (argv[i] === '--list-analyses') {
      args.listAnalyses = true;
    }
  }

  return args;
}

export async function runInsightsWorkflow({
  analysis = DEFAULT_ANALYSIS,
  filters = {},
  aiSummary = false,
  provider = null,
  saveArtifacts = true,
  createClient = createDatabaseClient,
} = {}) {
  const client = createClient();
  await client.connect();

  try {
    const pack = await buildAnalysisPack(client, {
      analysis,
      filters,
    });

    const deterministicMarkdown = renderAnalysisMarkdown(pack);
    let markdown = deterministicMarkdown;
    let providerUsed = 'none';
    let modelUsed = null;

    if (aiSummary) {
      providerUsed = getAiProvider(provider || DEFAULT_AI_PROVIDER, 'provider');

      if (providerUsed !== 'none') {
        const promptTemplate = await loadPromptTemplate('prompt.md');
        const systemPrompt = promptTemplate.trim();
        const userPrompt = buildAnalysisPrompt(promptTemplate, {
          analysisTitle: pack.title,
          pack,
        });
        modelUsed = getModelForProvider(providerUsed);
        markdown = await requestMarkdownWithProvider({
          provider: providerUsed,
          apiKey: getApiKeyForProvider(providerUsed),
          model: modelUsed,
          systemPrompt,
          userPrompt,
        });
      }
    }

    const artifactPaths = {
      json: null,
      markdown: null,
    };

    if (saveArtifacts) {
      const outputDirectory = getOutputDirectory();
      const timestamp = buildTimestampSlug();
      const filterLabel = buildFilterLabel(filters);
      const stem = `${timestamp}-${slugifyFileSegment(analysis)}-${filterLabel}`;
      const jsonPath = path.join(outputDirectory, 'analysis', `${stem}.json`);
      const markdownPath = path.join(outputDirectory, 'analysis', `${stem}.md`);

      await saveJsonFile(jsonPath, pack);
      await saveTextFile(markdownPath, markdown);

      artifactPaths.json = jsonPath;
      artifactPaths.markdown = markdownPath;
    }

    return {
      analysis,
      pack,
      markdown,
      providerUsed,
      modelUsed,
      artifactPaths,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const args = parseRunInsightsArgs(process.argv.slice(2));

  if (args.listAnalyses) {
    for (const definition of listAnalysisDefinitions()) {
      console.log(`${definition.name} - ${definition.description}`);
    }
    return;
  }

  const result = await runInsightsWorkflow(args);

  if (result.artifactPaths.json || result.artifactPaths.markdown) {
    console.error(`Saved analysis pack: ${result.artifactPaths.json}`);
    console.error(`Saved markdown summary: ${result.artifactPaths.markdown}`);
  }

  console.log(result.markdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
