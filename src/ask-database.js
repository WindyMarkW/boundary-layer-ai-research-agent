import process from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabaseClient } from './lib/database.js';
import { buildAnalysisPack } from './lib/analysis-runner.js';
import { requestMarkdownWithProvider } from './lib/ai-provider.js';
import { renderQuestionFallbackMarkdown } from './lib/markdown.js';
import { loadPromptTemplate, buildQuestionPrompt } from './lib/prompt.js';
import { routeQuestionToAnalyses } from './lib/question-router.js';
import { buildTimestampSlug, getOutputDirectory, saveJsonFile, saveTextFile, slugifyFileSegment } from './lib/report-output.js';
import {
  DEFAULT_AI_PROVIDER,
  getAiProvider,
  getApiKeyForProvider,
  getModelForProvider,
} from './lib/runtime-config.js';
import { parseIdsValue } from './lib/queries.js';

export function parseAskArgs(argv) {
  const args = {
    question: null,
    filters: {},
    provider: null,
    saveArtifacts: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--question' && argv[i + 1]) {
      args.question = argv[i + 1].trim();
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

    if (argv[i] === '--provider' && argv[i + 1]) {
      args.provider = argv[i + 1].trim();
      i += 1;
      continue;
    }

    if (argv[i] === '--no-save') {
      args.saveArtifacts = false;
      continue;
    }

    if (!argv[i].startsWith('--') && !args.question) {
      args.question = argv[i].trim();
    }
  }

  if (!args.question) {
    throw new Error('Missing question. Use --question "..." or pass the question as a positional argument.');
  }

  return args;
}

export async function runAskWorkflow({
  question,
  filters = {},
  provider = null,
  saveArtifacts = true,
  createClient = createDatabaseClient,
} = {}) {
  const routedAnalyses = routeQuestionToAnalyses(question);
  const client = createClient();
  await client.connect();

  try {
    const packs = [];

    for (const analysis of routedAnalyses) {
      packs.push(await buildAnalysisPack(client, { analysis, filters }));
    }

    let markdown = renderQuestionFallbackMarkdown({
      question,
      analyses: routedAnalyses,
      packs,
    });
    let providerUsed = getAiProvider(provider || DEFAULT_AI_PROVIDER, 'provider');
    let modelUsed = null;

    if (providerUsed !== 'none') {
      const promptTemplate = await loadPromptTemplate('prompt-question.md');
      const systemPrompt = promptTemplate.trim();
      const userPrompt = buildQuestionPrompt(promptTemplate, {
        question,
        routedAnalyses,
        packs,
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

    const artifactPaths = {
      json: null,
      markdown: null,
    };

    if (saveArtifacts) {
      const outputDirectory = getOutputDirectory();
      const timestamp = buildTimestampSlug();
      const stem = `${timestamp}-${slugifyFileSegment(question)}`;
      const jsonPath = path.join(outputDirectory, 'questions', `${stem}.json`);
      const markdownPath = path.join(outputDirectory, 'questions', `${stem}.md`);

      await saveJsonFile(jsonPath, {
        question,
        routedAnalyses,
        filters,
        packs,
      });
      await saveTextFile(markdownPath, markdown);

      artifactPaths.json = jsonPath;
      artifactPaths.markdown = markdownPath;
    }

    return {
      question,
      routedAnalyses,
      packs,
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
  const args = parseAskArgs(process.argv.slice(2));
  const result = await runAskWorkflow(args);

  if (result.artifactPaths.json || result.artifactPaths.markdown) {
    console.error(`Saved question pack: ${result.artifactPaths.json}`);
    console.error(`Saved markdown answer: ${result.artifactPaths.markdown}`);
  }

  console.log(result.markdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
