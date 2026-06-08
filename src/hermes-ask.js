import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { requestInternalQuestion } from './lib/internal-api.js';
import { parseAskArgs } from './ask-database.js';

export function parseHermesAskArgs(argv) {
  const parsed = parseAskArgs(argv);
  const saveArtifacts = argv.includes('--save') ? true : false;

  return {
    ...parsed,
    saveArtifacts,
    outputJson: argv.includes('--json'),
  };
}

async function main() {
  const args = parseHermesAskArgs(process.argv.slice(2));
  const result = await requestInternalQuestion({
    question: args.question,
    filters: args.filters,
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
