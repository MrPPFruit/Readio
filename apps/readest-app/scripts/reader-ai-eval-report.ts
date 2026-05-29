import { buildReaderAIEvalReportRun } from '@/services/ai/eval/readerAIEvalReportRunner';

export type ReaderAIEvalReportCliIO = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  stderr(message: string): void;
};

type ReaderAIEvalReportCliArgs = {
  input?: string;
  jsonOut?: string;
  markdownOut?: string;
};

const requiredArgs: Array<[keyof ReaderAIEvalReportCliArgs, string]> = [
  ['input', '--input'],
  ['jsonOut', '--json-out'],
  ['markdownOut', '--markdown-out'],
];

const parseArgs = (
  argv: string[],
): { ok: true; args: ReaderAIEvalReportCliArgs } | { ok: false; issues: string[] } => {
  const args: ReaderAIEvalReportCliArgs = {};
  const issues: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (index === 0 && token === '--') continue;

    if (token === '--input') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --input');
      } else {
        args.input = value;
        index += 1;
      }
      continue;
    }

    if (token === '--json-out') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --json-out');
      } else {
        args.jsonOut = value;
        index += 1;
      }
      continue;
    }

    if (token === '--markdown-out') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --markdown-out');
      } else {
        args.markdownOut = value;
        index += 1;
      }
      continue;
    }

    issues.push(`Unknown argument: ${token}`);
  }

  if (issues.length === 0) {
    requiredArgs.forEach(([key, flag]) => {
      if (args[key] === undefined) issues.push(`Missing required argument: ${flag}`);
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, args };
};

const parseJsonInput = (content: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(content) as unknown };
  } catch {
    return { ok: false };
  }
};

export async function runReaderAIEvalReportCli(
  argv: string[],
  io: ReaderAIEvalReportCliIO,
): Promise<number> {
  const parsedArgs = parseArgs(argv);
  if (!parsedArgs.ok) {
    parsedArgs.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  const { input, jsonOut, markdownOut } = parsedArgs.args;
  if (input === undefined || jsonOut === undefined || markdownOut === undefined) {
    io.stderr('Missing required report file paths');
    return 1;
  }

  let inputContent: string;
  try {
    inputContent = await io.readFile(input);
  } catch {
    io.stderr(`Unable to read input: ${input}`);
    return 1;
  }

  const parsedJson = parseJsonInput(inputContent);
  if (!parsedJson.ok) {
    io.stderr(`Invalid JSON input: ${input}`);
    return 1;
  }

  const output = buildReaderAIEvalReportRun(parsedJson.value);
  if (!output.ok) {
    output.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  await io.writeFile(jsonOut, `${JSON.stringify(output.report, null, 2)}\n`);
  await io.writeFile(markdownOut, output.markdown);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const nodeIO: ReaderAIEvalReportCliIO = {
    readFile: (path: string): Promise<string> => readFile(path, 'utf8'),
    writeFile,
    stderr: (message: string): void => {
      console.error(message);
    },
  };

  process.exitCode = await runReaderAIEvalReportCli(process.argv.slice(2), nodeIO);
}
