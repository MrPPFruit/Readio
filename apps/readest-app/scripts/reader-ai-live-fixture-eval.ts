import {
  parseReaderAILiveFixture,
  runReaderAILiveFixtureEval,
  type ReaderAILiveFixtureEvalDeps,
} from '@/services/ai/eval/readerAILiveFixtureEvalRunner';
import {
  mergeReaderAILiveFixtureRuntimeInputs,
  parseReaderAILiveFixtureRuntimeSettings,
  runtimeBridgeInputFromEnv,
  type ReaderAILiveFixtureRuntimeInput,
} from '@/services/ai/eval/readerAILiveFixtureRuntimeBridge';

export type ReaderAILiveFixtureEvalCliIO = {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  stderr(message: string): void;
  stdout(message: string): void;
};

type ReaderAILiveFixtureEvalCliArgs = {
  fixture?: string;
  runtime?: string;
  live: boolean;
};

type ReaderAILiveFixtureEvalCliDeps = Pick<
  ReaderAILiveFixtureEvalDeps,
  'streamAnswer' | 'prepareRetrievalContext' | 'now'
> & {
  env?: Record<string, string | undefined>;
};

const loadDefaultStreamAnswer = async (): Promise<ReaderAILiveFixtureEvalDeps['streamAnswer']> => {
  const { streamReaderAIAnswer } = await import('@/services/ai/readerChatService');
  return streamReaderAIAnswer;
};

const loadRuntimeSeedFile = async ({
  seedPath,
  io,
}: {
  seedPath: string;
  io: ReaderAILiveFixtureEvalCliIO;
}): Promise<
  | { ok: true; runtime: Pick<ReaderAILiveFixtureRuntimeInput, 'retrievalSeed'> }
  | { ok: false; issues: string[] }
> => {
  let seedContent: string;
  try {
    seedContent = await io.readFile(seedPath);
  } catch {
    return { ok: false, issues: ['Unable to read runtime retrieval seed'] };
  }

  const parsedSeed = parseReaderAILiveFixtureRuntimeSettings(`{"retrievalSeed":${seedContent}}`);
  if (!parsedSeed.ok) return { ok: false, issues: ['runtime retrieval seed must be valid JSON'] };
  if (!parsedSeed.runtime.retrievalSeed) {
    return { ok: false, issues: ['runtime retrieval seed is required'] };
  }
  return { ok: true, runtime: { retrievalSeed: parsedSeed.runtime.retrievalSeed } };
};

const loadRuntimeInput = async ({
  runtimePath,
  io,
  env,
}: {
  runtimePath?: string;
  io: ReaderAILiveFixtureEvalCliIO;
  env: Record<string, string | undefined>;
}): Promise<
  { ok: true; runtime: ReaderAILiveFixtureRuntimeInput } | { ok: false; issues: string[] }
> => {
  const envRuntime = runtimeBridgeInputFromEnv(env);
  let runtime: ReaderAILiveFixtureRuntimeInput = envRuntime;

  if (runtimePath !== undefined) {
    let runtimeContent: string;
    try {
      runtimeContent = await io.readFile(runtimePath);
    } catch {
      return { ok: false, issues: ['Unable to read runtime bridge settings'] };
    }

    const parsedRuntime = parseReaderAILiveFixtureRuntimeSettings(runtimeContent);
    if (!parsedRuntime.ok) return { ok: false, issues: parsedRuntime.issues };
    runtime = mergeReaderAILiveFixtureRuntimeInputs(envRuntime, parsedRuntime.runtime);
  }

  if (!runtime.retrievalSeed && runtime.retrievalSeedPath) {
    const seedRuntime = await loadRuntimeSeedFile({ seedPath: runtime.retrievalSeedPath, io });
    if (!seedRuntime.ok) return seedRuntime;
    runtime = mergeReaderAILiveFixtureRuntimeInputs(runtime, seedRuntime.runtime);
  }

  return { ok: true, runtime };
};

const parseArgs = (
  argv: string[],
): { ok: true; args: ReaderAILiveFixtureEvalCliArgs } | { ok: false; issues: string[] } => {
  const args: ReaderAILiveFixtureEvalCliArgs = { live: false };
  const issues: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    if (index === 0 && token === '--') continue;

    if (token === '--fixture') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --fixture');
      } else {
        args.fixture = value;
        index += 1;
      }
      continue;
    }

    if (token === '--runtime') {
      if (value === undefined || value.startsWith('--')) {
        issues.push('Missing value for argument: --runtime');
      } else {
        args.runtime = value;
        index += 1;
      }
      continue;
    }

    if (token === '--live') {
      args.live = true;
      continue;
    }

    issues.push(`Unknown argument: ${token}`);
  }

  if (issues.length === 0 && args.fixture === undefined) {
    issues.push('Missing required argument: --fixture');
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, args };
};

export async function runReaderAILiveFixtureEvalCli(
  argv: string[],
  io: ReaderAILiveFixtureEvalCliIO,
  deps: Partial<ReaderAILiveFixtureEvalCliDeps> = {},
): Promise<number> {
  const parsedArgs = parseArgs(argv);
  if (!parsedArgs.ok) {
    parsedArgs.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  const { fixture: fixturePath, live } = parsedArgs.args;
  if (fixturePath === undefined) {
    io.stderr('Missing required argument: --fixture');
    return 1;
  }

  if (!live) {
    io.stderr('Live fixture execution requires --live');
    return 1;
  }

  let fixtureContent: string;
  try {
    fixtureContent = await io.readFile(fixturePath);
  } catch {
    io.stderr('Unable to read fixture');
    return 1;
  }

  const parsedFixture = parseReaderAILiveFixture(fixtureContent);
  if (!parsedFixture.ok) {
    parsedFixture.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  if (!parsedFixture.fixture.live) {
    io.stderr('Live fixture execution requires --live');
    return 1;
  }

  const runtimeInput = await loadRuntimeInput({
    runtimePath: parsedArgs.args.runtime,
    io,
    env: deps.env ?? process.env,
  });
  if (!runtimeInput.ok) {
    runtimeInput.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  const output = await runReaderAILiveFixtureEval(parsedFixture.fixture, {
    live,
    runtime: runtimeInput.runtime,
    prepareRetrievalContext: deps.prepareRetrievalContext,
    streamAnswer: deps.streamAnswer,
    loadStreamAnswer: loadDefaultStreamAnswer,
    writeFile: io.writeFile,
    now: deps.now,
  });

  if (!output.ok) {
    output.issues.forEach((issue) => io.stderr(issue));
    return 1;
  }

  output.writtenPaths.forEach((path) => io.stdout(`Wrote ${path}`));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const nodeIO: ReaderAILiveFixtureEvalCliIO = {
    readFile: (path: string): Promise<string> => readFile(path, 'utf8'),
    writeFile,
    stderr: (message: string): void => {
      console.error(message);
    },
    stdout: (message: string): void => {
      console.log(message);
    },
  };

  process.exitCode = await runReaderAILiveFixtureEvalCli(process.argv.slice(2), nodeIO);
}
