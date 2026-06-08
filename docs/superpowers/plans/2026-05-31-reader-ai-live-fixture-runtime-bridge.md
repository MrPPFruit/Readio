---
change: reader-ai-live-fixture-runtime-bridge
design-doc: docs/superpowers/specs/2026-05-31-reader-ai-live-fixture-runtime-bridge-design.md
base-ref: b9b9f655ea67f2f8601b2727dbc17fac63bbfc71
archived-with: 2026-05-31-reader-ai-live-fixture-runtime-bridge
---

# Reader AI Live Fixture Runtime Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the guarded Reader AI live fixture runner runnable in a controlled local environment by adding runtime-only provider configuration, runtime-only retrieval seed preparation, fail-closed preflight, and privacy validation.

**Architecture:** Add one focused runtime bridge module beside the existing live fixture eval runner. The CLI parses `--runtime` and eval-specific environment fallbacks only after `--live` and fixture `live: true` pass; the runner builds in-memory `AISettings`, prepares retrieval context, and only then loads/calls the real Reader AI streamer.

**Tech Stack:** TypeScript, Vitest, existing `AISettings`/`TextChunk` types, existing `getCustomBaseUrlSafety`, existing `aiStore.saveChunks()`/`aiStore.saveBM25Index()`, existing `runReaderAIServiceEval`, existing `buildReaderAIEvalReportRun`, Node `fs/promises`, `tsx` CLI.

---

## File Structure

- Create: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts`
  - Owns runtime-only provider input types, runtime settings JSON parsing, environment conversion, `AISettings` construction, retrieval seed validation, and default retrieval context preparation.
  - Exports pure functions for tests and one default preparer that writes chunks/BM25 via `aiStore`.
  - Does not write reports, call providers, or load the real streamer.
- Modify: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`
  - Replaces private `toAISettings()` with runtime bridge output.
  - Adds `runtime` and `prepareRetrievalContext` dependencies.
  - Enforces provider/retrieval preflight after live gates and before `runReaderAIServiceEval()`.
- Modify: `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`
  - Adds `--runtime` parsing.
  - Reads runtime file / env only after `--live` and fixture validation.
  - Keeps default `streamReaderAIAnswer` dynamic import after runtime preflight succeeds.
- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
  - Adds provider bridge, retrieval seed, runner ordering, and privacy tests.
  - Updates existing live execution tests to pass runtime bridge inputs.
- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts`
  - Adds `--runtime` and env tests.
  - Proves runtime inputs are not read before live gates.
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
  - Documents local-only runtime bridge workflow and non-commit guidance.
- Modify: `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`
  - Check off tasks as implementation/verification completes.
- Modify: `HANDOFF.md`
  - Record current goal, changed files, validation evidence, and next actions for context recovery.

---

### Task 1: Provider bridge pure tests and implementation

**Files:**

- Create: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts`
- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`

- [ ] **Step 1: Add failing provider bridge tests**

Append these imports near the top of `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`:

```ts
import {
  buildReaderAILiveFixtureRuntimeBridge,
  parseReaderAILiveFixtureRuntimeSettings,
  runtimeBridgeInputFromEnv,
} from '@/services/ai/eval/readerAILiveFixtureRuntimeBridge';
```

Append this test block after the existing validation tests:

```ts
describe('Reader AI live fixture runtime provider bridge', () => {
  it('builds in-memory AI settings from a runtime API key without changing fixture metadata', () => {
    const parsed = parseReaderAILiveFixture(JSON.stringify(validFixture));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));

    const bridge = buildReaderAILiveFixtureRuntimeBridge(parsed.fixture, {
      provider: { apiKey: 'sk-runtime-provider-secret' },
    });

    expect(bridge.ok).toBe(true);
    if (!bridge.ok) throw new Error(bridge.issues.join('\n'));
    expect(bridge.settings).toMatchObject({
      enabled: true,
      showReaderAIEntrypoints: true,
      provider: 'openai',
      providerModels: { openai: 'gpt-test' },
      spoilerProtection: true,
      maxContextChunks: 6,
      indexingMode: 'on-demand',
    });
    expect(bridge.settings.providerApiKeys.openai).toBe('sk-runtime-provider-secret');
    expect(parsed.fixture.settings).toEqual({ provider: 'openai', model: 'gpt-test' });
  });

  it('fails closed when runtime provider credentials are missing', () => {
    const parsed = parseReaderAILiveFixture(JSON.stringify(validFixture));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));

    const bridge = buildReaderAILiveFixtureRuntimeBridge(parsed.fixture, {});

    expect(bridge.ok).toBe(false);
    if (bridge.ok) throw new Error('expected provider preflight failure');
    expect(bridge.issues).toEqual(['runtime provider API key is required']);
  });

  it('accepts an explicitly allowed custom local testing proxy without an API key', () => {
    const parsed = parseReaderAILiveFixture(
      JSON.stringify({
        ...validFixture,
        settings: { provider: 'custom-openai-compatible', model: 'local-model' },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));

    const bridge = buildReaderAILiveFixtureRuntimeBridge(parsed.fixture, {
      provider: {
        customProviderBaseUrl: 'http://127.0.0.1:11434/v1',
        allowUnsafeCustomProviderBaseUrl: true,
      },
    });

    expect(bridge.ok).toBe(true);
    if (!bridge.ok) throw new Error(bridge.issues.join('\n'));
    expect(bridge.settings.customProviderBaseUrl).toBe('http://127.0.0.1:11434/v1');
    expect(bridge.settings.allowUnsafeCustomProviderBaseUrl).toBe(true);
    expect(bridge.settings.providerApiKeys['custom-openai-compatible']).toBeUndefined();
  });

  it('rejects invalid custom provider base URLs with safe deterministic issues', () => {
    const parsed = parseReaderAILiveFixture(
      JSON.stringify({
        ...validFixture,
        settings: { provider: 'custom-openai-compatible', model: 'local-model' },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));

    const bridge = buildReaderAILiveFixtureRuntimeBridge(parsed.fixture, {
      provider: {
        customProviderBaseUrl: 'http://public.example.invalid/v1',
        allowUnsafeCustomProviderBaseUrl: true,
      },
    });

    expect(bridge.ok).toBe(false);
    if (bridge.ok) throw new Error('expected custom URL failure');
    expect(bridge.issues).toEqual(['runtime custom provider base URL is invalid']);
  });

  it('rejects provider secrets and base URLs persisted in fixture JSON', () => {
    const validation = validateReaderAILiveFixture({
      ...validFixture,
      settings: {
        ...validFixture.settings,
        apiKey: 'sk-fixture-secret',
        customProviderBaseUrl: 'https://private.example.test/v1',
      },
    });

    expect(validation.ok).toBe(false);
    if (validation.ok) throw new Error('expected fixture secret rejection');
    expect(validation.issues).toContain(
      'settings.apiKey is not allowed in Reader AI eval metadata',
    );
    expect(validation.issues).toContain(
      'settings.customProviderBaseUrl is not allowed in Reader AI eval metadata',
    );
  });

  it('parses runtime settings JSON and eval-specific environment variables', () => {
    const parsed = parseReaderAILiveFixtureRuntimeSettings(
      JSON.stringify({
        provider: {
          apiKey: 'sk-runtime-file-secret',
          customProviderBaseUrl: 'https://private.example.test/v1',
        },
      }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.issues.join('\n'));
    expect(parsed.runtime.provider?.apiKey).toBe('sk-runtime-file-secret');
    expect(parsed.runtime.provider?.customProviderBaseUrl).toBe('https://private.example.test/v1');

    expect(
      runtimeBridgeInputFromEnv({
        READER_AI_LIVE_FIXTURE_API_KEY: 'sk-runtime-env-secret',
        READER_AI_LIVE_FIXTURE_CUSTOM_BASE_URL: 'https://env.example.test/v1',
        READER_AI_LIVE_FIXTURE_ALLOW_UNSAFE_LOCAL_PROXY: 'true',
        READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED: 'tmp/reader-ai/live-fixture/seed.local.json',
      }),
    ).toEqual({
      provider: {
        apiKey: 'sk-runtime-env-secret',
        customProviderBaseUrl: 'https://env.example.test/v1',
        allowUnsafeCustomProviderBaseUrl: true,
      },
      retrievalSeedPath: 'tmp/reader-ai/live-fixture/seed.local.json',
    });
  });
});
```

- [ ] **Step 2: Run focused test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: FAIL because `readerAILiveFixtureRuntimeBridge` does not exist and fixture secret rejection does not include `settings.customProviderBaseUrl`.

- [ ] **Step 3: Implement runtime provider bridge module**

Create `apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts` with these exports and behavior:

```ts
import { getCustomBaseUrlSafety } from '@/services/ai/availability';
import type { ReaderAILiveFixture } from '@/services/ai/eval/readerAILiveFixtureEvalRunner';
import type { AIProviderName, AISettings, TextChunk } from '@/services/ai/types';

export type ReaderAILiveFixtureRuntimeProviderInput = {
  apiKey?: string;
  customProviderBaseUrl?: string;
  allowUnsafeCustomProviderBaseUrl?: boolean;
};

export type ReaderAILiveFixtureRuntimeRetrievalSeedChunk = {
  id: string;
  sectionIndex: number;
  chapterTitle: string;
  text: string;
  pageNumber: number;
  sortIndex?: number;
  endPageNumber?: number;
  chunkIndex?: number;
};

export type ReaderAILiveFixtureRuntimeRetrievalSeed = {
  bookHash: string;
  chunks: ReaderAILiveFixtureRuntimeRetrievalSeedChunk[];
};

export type ReaderAILiveFixtureRuntimeInput = {
  provider?: ReaderAILiveFixtureRuntimeProviderInput;
  retrievalSeed?: ReaderAILiveFixtureRuntimeRetrievalSeed;
  retrievalSeedPath?: string;
};

export type ReaderAILiveFixtureRuntimeBridgeResult =
  | {
      ok: true;
      settings: AISettings;
      retrievalSeed?: ReaderAILiveFixtureRuntimeRetrievalSeed;
    }
  | { ok: false; issues: string[] };

export type ReaderAILiveFixtureRuntimeSettingsParseResult =
  | { ok: true; runtime: ReaderAILiveFixtureRuntimeInput }
  | { ok: false; issues: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getOptionalTrimmedString = (
  value: Record<string, unknown>,
  key: string,
): string | undefined => {
  const field = value[key];
  if (field === undefined) return undefined;
  return typeof field === 'string' && field.trim().length > 0 ? field.trim() : undefined;
};

const getOptionalBoolean = (value: Record<string, unknown>, key: string): boolean | undefined => {
  const field = value[key];
  return typeof field === 'boolean' ? field : undefined;
};

const parseBooleanEnv = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  return value.trim().toLocaleLowerCase() === 'true';
};

const mergeProviderInputs = (
  envProvider: ReaderAILiveFixtureRuntimeProviderInput | undefined,
  fileProvider: ReaderAILiveFixtureRuntimeProviderInput | undefined,
): ReaderAILiveFixtureRuntimeProviderInput | undefined => {
  const merged = { ...(envProvider ?? {}), ...(fileProvider ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
};

export const mergeReaderAILiveFixtureRuntimeInputs = (
  envRuntime: ReaderAILiveFixtureRuntimeInput,
  fileRuntime: ReaderAILiveFixtureRuntimeInput,
): ReaderAILiveFixtureRuntimeInput => {
  const provider = mergeProviderInputs(envRuntime.provider, fileRuntime.provider);
  const merged: ReaderAILiveFixtureRuntimeInput = {};
  if (provider) merged.provider = provider;
  merged.retrievalSeed = fileRuntime.retrievalSeed ?? envRuntime.retrievalSeed;
  merged.retrievalSeedPath = fileRuntime.retrievalSeedPath ?? envRuntime.retrievalSeedPath;
  return merged;
};

export const runtimeBridgeInputFromEnv = (
  env: Record<string, string | undefined>,
): ReaderAILiveFixtureRuntimeInput => {
  const provider: ReaderAILiveFixtureRuntimeProviderInput = {};
  const apiKey = env['READER_AI_LIVE_FIXTURE_API_KEY']?.trim();
  if (apiKey) provider.apiKey = apiKey;
  const customProviderBaseUrl = env['READER_AI_LIVE_FIXTURE_CUSTOM_BASE_URL']?.trim();
  if (customProviderBaseUrl) provider.customProviderBaseUrl = customProviderBaseUrl;
  const allowUnsafeCustomProviderBaseUrl = parseBooleanEnv(
    env['READER_AI_LIVE_FIXTURE_ALLOW_UNSAFE_LOCAL_PROXY'],
  );
  if (allowUnsafeCustomProviderBaseUrl !== undefined) {
    provider.allowUnsafeCustomProviderBaseUrl = allowUnsafeCustomProviderBaseUrl;
  }

  const runtime: ReaderAILiveFixtureRuntimeInput = {};
  if (Object.keys(provider).length > 0) runtime.provider = provider;
  const retrievalSeedPath = env['READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED']?.trim();
  if (retrievalSeedPath) runtime.retrievalSeedPath = retrievalSeedPath;
  return runtime;
};
```

Continue the same file with parser and settings builder:

```ts
const parseSeedChunk = (value: unknown): ReaderAILiveFixtureRuntimeRetrievalSeedChunk | null => {
  if (!isRecord(value)) return null;
  const id = getOptionalTrimmedString(value, 'id');
  const chapterTitle = getOptionalTrimmedString(value, 'chapterTitle');
  const text = getOptionalTrimmedString(value, 'text');
  const sectionIndex = value['sectionIndex'];
  const pageNumber = value['pageNumber'];
  if (!id || !chapterTitle || !text) return null;
  if (typeof sectionIndex !== 'number' || !Number.isFinite(sectionIndex)) return null;
  if (typeof pageNumber !== 'number' || !Number.isFinite(pageNumber)) return null;

  const chunk: ReaderAILiveFixtureRuntimeRetrievalSeedChunk = {
    id,
    chapterTitle,
    text,
    sectionIndex,
    pageNumber,
  };
  const sortIndex = value['sortIndex'];
  if (typeof sortIndex === 'number' && Number.isFinite(sortIndex)) chunk.sortIndex = sortIndex;
  const endPageNumber = value['endPageNumber'];
  if (typeof endPageNumber === 'number' && Number.isFinite(endPageNumber)) {
    chunk.endPageNumber = endPageNumber;
  }
  const chunkIndex = value['chunkIndex'];
  if (typeof chunkIndex === 'number' && Number.isFinite(chunkIndex)) chunk.chunkIndex = chunkIndex;
  return chunk;
};

const parseRetrievalSeed = (
  value: unknown,
): ReaderAILiveFixtureRuntimeRetrievalSeed | undefined => {
  if (!isRecord(value)) return undefined;
  const bookHash = getOptionalTrimmedString(value, 'bookHash');
  const chunksInput = value['chunks'];
  if (!bookHash || !Array.isArray(chunksInput)) return undefined;
  const chunks = chunksInput.map(parseSeedChunk).filter((chunk) => chunk !== null);
  return { bookHash, chunks };
};

export function parseReaderAILiveFixtureRuntimeSettings(
  source: string,
): ReaderAILiveFixtureRuntimeSettingsParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return { ok: false, issues: ['runtime settings must be valid JSON'] };
  }
  if (!isRecord(parsed)) return { ok: false, issues: ['runtime settings must be an object'] };

  const runtime: ReaderAILiveFixtureRuntimeInput = {};
  const providerInput = parsed['provider'];
  if (isRecord(providerInput)) {
    const provider: ReaderAILiveFixtureRuntimeProviderInput = {};
    const apiKey = getOptionalTrimmedString(providerInput, 'apiKey');
    if (apiKey) provider.apiKey = apiKey;
    const customProviderBaseUrl = getOptionalTrimmedString(providerInput, 'customProviderBaseUrl');
    if (customProviderBaseUrl) provider.customProviderBaseUrl = customProviderBaseUrl;
    const allowUnsafeCustomProviderBaseUrl = getOptionalBoolean(
      providerInput,
      'allowUnsafeCustomProviderBaseUrl',
    );
    if (allowUnsafeCustomProviderBaseUrl !== undefined) {
      provider.allowUnsafeCustomProviderBaseUrl = allowUnsafeCustomProviderBaseUrl;
    }
    if (Object.keys(provider).length > 0) runtime.provider = provider;
  }

  const retrievalSeed = parseRetrievalSeed(parsed['retrievalSeed']);
  if (retrievalSeed) runtime.retrievalSeed = retrievalSeed;
  const retrievalSeedPath = getOptionalTrimmedString(parsed, 'retrievalSeedPath');
  if (retrievalSeedPath) runtime.retrievalSeedPath = retrievalSeedPath;

  return { ok: true, runtime };
}

const buildProviderApiKeys = (
  provider: AIProviderName,
  apiKey: string | undefined,
): Partial<Record<AIProviderName, string>> => (apiKey ? { [provider]: apiKey } : {});

const buildAISettings = (
  fixture: ReaderAILiveFixture,
  providerInput: ReaderAILiveFixtureRuntimeProviderInput,
): AISettings => ({
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: fixture.settings.provider,
  providerApiKeys: buildProviderApiKeys(fixture.settings.provider, providerInput.apiKey?.trim()),
  providerModels: { [fixture.settings.provider]: fixture.settings.model },
  providerEmbeddingModels: {},
  customProviderBaseUrl: providerInput.customProviderBaseUrl?.trim() ?? '',
  allowUnsafeCustomProviderBaseUrl: providerInput.allowUnsafeCustomProviderBaseUrl,
  spoilerProtection: fixture.settings.spoilerProtection ?? true,
  maxContextChunks: fixture.settings.maxContextChunks ?? 6,
  indexingMode: 'on-demand',
});

export function buildReaderAILiveFixtureRuntimeBridge(
  fixture: ReaderAILiveFixture,
  runtime: ReaderAILiveFixtureRuntimeInput,
): ReaderAILiveFixtureRuntimeBridgeResult {
  const providerInput = runtime.provider ?? {};
  const issues: string[] = [];
  const apiKey = providerInput.apiKey?.trim();

  if (fixture.settings.provider === 'custom-openai-compatible') {
    const customBaseUrl = providerInput.customProviderBaseUrl?.trim();
    if (!customBaseUrl) issues.push('runtime custom provider base URL is required');
    const safety = customBaseUrl
      ? getCustomBaseUrlSafety(customBaseUrl, providerInput.allowUnsafeCustomProviderBaseUrl)
      : 'invalid';
    if (customBaseUrl && safety !== 'safe' && safety !== 'unsafe-local-proxy') {
      issues.push('runtime custom provider base URL is invalid');
    }
    if (!apiKey && safety !== 'unsafe-local-proxy') {
      issues.push('runtime provider API key is required');
    }
  } else if (!apiKey) {
    issues.push('runtime provider API key is required');
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    settings: buildAISettings(fixture, providerInput),
    retrievalSeed: runtime.retrievalSeed,
  };
}

export const toTextChunks = (
  bookHash: string,
  seed: ReaderAILiveFixtureRuntimeRetrievalSeed,
): TextChunk[] =>
  seed.chunks.map((chunk, index) => ({
    id: chunk.id,
    bookHash,
    sectionIndex: chunk.sectionIndex,
    chapterTitle: chunk.chapterTitle,
    text: chunk.text,
    pageNumber: chunk.pageNumber,
    sortIndex: chunk.sortIndex ?? index,
    endPageNumber: chunk.endPageNumber,
    chunkIndex: chunk.chunkIndex ?? index,
  }));
```

- [ ] **Step 4: Reject provider runtime fields in fixture validation**

Modify `apps/readest-app/src/services/ai/eval/readerAIEval.ts` unsafe field names only if needed by current validator, or add explicit live fixture validation in `readerAILiveFixtureEvalRunner.ts`. The expected live fixture issues must be:

```ts
const liveFixtureUnsafeFieldNames = new Set([
  'apiKey',
  'customProviderBaseUrl',
  'baseUrl',
  'token',
  'authorization',
]);
```

The validation issue string must use the existing eval metadata wording:

```ts
`${path} is not allowed in Reader AI eval metadata`;
```

This makes the new test expectations exact and keeps generated artifacts metadata-only by construction.

- [ ] **Step 5: Run focused test to verify provider bridge passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: PASS for new provider bridge tests and existing runner tests that do not yet require runtime preflight changes.

- [ ] **Step 6: Check OpenSpec task 1.1 partial completion and commit**

Modify `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`:

```md
- [x] 1.1 Add failing tests for runtime-only provider configuration inputs and missing credential preflight failures.
```

Commit:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md
git commit -m "test(readio): cover live fixture provider runtime bridge"
```

---

### Task 2: Wire provider preflight into the live fixture runner

**Files:**

- Modify: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`
- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
- Modify: `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`

- [ ] **Step 1: Add failing runner tests for provider preflight ordering**

In `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`, update live success tests to pass runtime provider input:

```ts
const validRuntime = {
  provider: { apiKey: 'sk-runtime-provider-secret' },
};
```

In each `runReaderAILiveFixtureEval(..., { live: true, streamAnswer, writeFile, now })` success call, add:

```ts
runtime: validRuntime,
```

Append this test to `describe('runReaderAILiveFixtureEval guarded execution', () => { ... })`:

```ts
it('fails provider preflight before calling the streamer or writing artifacts', async () => {
  const memory = createWritableMemory();
  let called = false;
  const streamer: ReaderAIServiceEvalStreamer = async function* () {
    called = true;
    yield 'private answer must not be written';
  };

  const output = await runReaderAILiveFixtureEval(
    { ...validFixture, live: true },
    {
      live: true,
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: () => 1000,
    },
  );

  expect(output.ok).toBe(false);
  if (output.ok) throw new Error('expected provider preflight failure');
  expect(output.issues).toEqual(['runtime provider API key is required']);
  expect(called).toBe(false);
  expect(memory.writes.size).toBe(0);
});

it('passes runtime AI settings to the streamer after provider preflight succeeds', async () => {
  const memory = createWritableMemory();
  const calls: StreamReaderAIAnswerOptions[] = [];
  const streamer: ReaderAIServiceEvalStreamer = async function* (options) {
    calls.push(options);
    options.onSources?.([
      {
        id: 'source-a',
        chapterTitle: 'Chapter 1',
        previewText: 'private preview must not be written',
        href: 'readio://private-source',
        confidence: 'exact',
      },
    ]);
    yield 'private answer must not be written';
  };

  const output = await runReaderAILiveFixtureEval(
    { ...validFixture, live: true },
    {
      live: true,
      runtime: validRuntime,
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: (() => {
        const values = [1000, 1200, 1200];
        let index = 0;
        return () => values[Math.min(index++, values.length - 1)] ?? 0;
      })(),
    },
  );

  expect(output.ok).toBe(true);
  if (!output.ok) throw new Error(output.issues.join('\n'));
  expect(calls).toHaveLength(1);
  expect(calls[0].settings.providerApiKeys.openai).toBe('sk-runtime-provider-secret');
  expect(calls[0].settings.providerModels.openai).toBe('gpt-test');
});
```

- [ ] **Step 2: Run focused test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: FAIL because `ReaderAILiveFixtureEvalDeps` has no `runtime` dependency and the runner still calls `toAISettings(fixture)` with empty provider keys.

- [ ] **Step 3: Modify runner dependency type and settings construction**

In `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`, add imports:

```ts
import {
  buildReaderAILiveFixtureRuntimeBridge,
  type ReaderAILiveFixtureRuntimeInput,
} from '@/services/ai/eval/readerAILiveFixtureRuntimeBridge';
```

Update `ReaderAILiveFixtureEvalDeps`:

```ts
export type ReaderAILiveFixtureEvalDeps = {
  live: boolean;
  runtime?: ReaderAILiveFixtureRuntimeInput;
  streamAnswer: ReaderAIServiceEvalStreamer;
  writeFile: (path: string, content: string) => Promise<void>;
  now?: () => number;
};
```

Remove the private `toAISettings` helper. In `runReaderAILiveFixtureEval()`, after the `!deps.live || !fixture.live` guard and before creating the timeout controller, add:

```ts
const runtimeBridge = buildReaderAILiveFixtureRuntimeBridge(fixture, deps.runtime ?? {});
if (!runtimeBridge.ok) {
  return { ok: false, envelope: null, writtenPaths: [], issues: runtimeBridge.issues };
}
```

Then replace service eval context settings:

```ts
settings: runtimeBridge.settings,
```

- [ ] **Step 4: Run focused test to verify provider preflight passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check OpenSpec provider implementation tasks and commit**

Modify `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`:

```md
- [x] 1.2 Implement runtime provider bridge parsing without allowing API keys, base URLs, or secrets in fixture JSON or generated artifacts.
```

Commit:

```bash
git add apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md
git commit -m "feat(readio): wire live fixture provider runtime bridge"
```

---

### Task 3: Retrieval seed bridge tests and implementation

**Files:**

- Modify: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts`
- Modify: `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`
- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
- Modify: `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`

- [ ] **Step 1: Add failing retrieval seed tests**

Add this import to the existing runtime bridge import:

```ts
import type { TextChunk } from '@/services/ai/types';
```

Add this test helper near `validRuntime`:

```ts
const validRetrievalSeed = {
  bookHash: 'runtime-private-book-hash',
  chunks: [
    {
      id: 'runtime-seed-chunk-1',
      sectionIndex: 1,
      chapterTitle: 'Runtime Private Chapter',
      text: 'runtime seed text must never be written',
      pageNumber: 40,
      sortIndex: 1,
    },
  ],
};

const validRuntimeWithSeed = {
  provider: { apiKey: 'sk-runtime-provider-secret' },
  retrievalSeed: validRetrievalSeed,
};
```

Update all live success tests that use `validRuntime` to use `validRuntimeWithSeed` and add a fake preparer:

```ts
prepareRetrievalContext: async () => undefined,
```

Append tests:

```ts
it('fails retrieval preflight before calling the streamer when seed is missing', async () => {
  const memory = createWritableMemory();
  let called = false;
  const streamer: ReaderAIServiceEvalStreamer = async function* () {
    called = true;
    yield 'private answer must not be written';
  };

  const output = await runReaderAILiveFixtureEval(
    { ...validFixture, live: true },
    {
      live: true,
      runtime: validRuntime,
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: () => 1000,
    },
  );

  expect(output.ok).toBe(false);
  if (output.ok) throw new Error('expected retrieval preflight failure');
  expect(output.issues).toEqual(['runtime retrieval seed is required']);
  expect(called).toBe(false);
  expect(memory.writes.size).toBe(0);
});

it('prepares retrieval context before streamer execution', async () => {
  const memory = createWritableMemory();
  const prepared: TextChunk[][] = [];
  let called = false;
  const streamer: ReaderAIServiceEvalStreamer = async function* () {
    called = true;
    yield 'private answer must not be written';
  };

  const output = await runReaderAILiveFixtureEval(
    { ...validFixture, live: true },
    {
      live: true,
      runtime: validRuntimeWithSeed,
      prepareRetrievalContext: async ({ chunks }) => {
        prepared.push(chunks);
      },
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: (() => {
        const values = [1000, 1100, 1100];
        let index = 0;
        return () => values[Math.min(index++, values.length - 1)] ?? 0;
      })(),
    },
  );

  expect(output.ok).toBe(true);
  if (!output.ok) throw new Error(output.issues.join('\n'));
  expect(prepared).toHaveLength(1);
  expect(prepared[0][0]).toMatchObject({
    id: 'runtime-seed-chunk-1',
    bookHash: 'runtime-private-book-hash',
    text: 'runtime seed text must never be written',
  });
  expect(called).toBe(true);
});

it('fails retrieval preflight when the seed book handle does not match the fixture', async () => {
  const memory = createWritableMemory();
  let called = false;
  const streamer: ReaderAIServiceEvalStreamer = async function* () {
    called = true;
    yield 'private answer must not be written';
  };

  const output = await runReaderAILiveFixtureEval(
    { ...validFixture, live: true },
    {
      live: true,
      runtime: {
        provider: { apiKey: 'sk-runtime-provider-secret' },
        retrievalSeed: { ...validRetrievalSeed, bookHash: 'different-private-book-hash' },
      },
      prepareRetrievalContext: async () => undefined,
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: () => 1000,
    },
  );

  expect(output.ok).toBe(false);
  if (output.ok) throw new Error('expected seed mismatch failure');
  expect(output.issues).toEqual(['runtime retrieval seed book handle does not match fixture']);
  expect(called).toBe(false);
  expect(memory.writes.size).toBe(0);
});

it('skips streamer execution when retrieval preparation throws', async () => {
  const memory = createWritableMemory();
  let called = false;
  const streamer: ReaderAIServiceEvalStreamer = async function* () {
    called = true;
    yield 'private answer must not be written';
  };

  const output = await runReaderAILiveFixtureEval(
    { ...validFixture, live: true },
    {
      live: true,
      runtime: validRuntimeWithSeed,
      prepareRetrievalContext: async () => {
        throw new Error('raw seed failure with runtime seed text must never be written');
      },
      streamAnswer: streamer,
      writeFile: memory.writeFile,
      now: () => 1000,
    },
  );

  expect(output.ok).toBe(false);
  if (output.ok) throw new Error('expected retrieval preparation failure');
  expect(output.issues).toEqual(['runtime retrieval context could not be prepared']);
  expect(called).toBe(false);
  expect(memory.writes.size).toBe(0);
});
```

- [ ] **Step 2: Run focused test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: FAIL because `prepareRetrievalContext` is not supported and seed preflight is not implemented.

- [ ] **Step 3: Implement retrieval seed preparation functions**

In `apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts`, add imports:

```ts
import { aiStore } from '@/services/ai/storage/aiStore';
```

Add exported types and functions:

```ts
export type ReaderAILiveFixtureRetrievalContextInput = {
  bookHash: string;
  chunks: TextChunk[];
};

export type ReaderAILiveFixtureRetrievalContextPreparer = (
  input: ReaderAILiveFixtureRetrievalContextInput,
) => Promise<void>;

export type ReaderAILiveFixtureRetrievalSeedResult =
  | { ok: true; input: ReaderAILiveFixtureRetrievalContextInput }
  | { ok: false; issues: string[] };

export function prepareReaderAILiveFixtureRetrievalSeed(
  fixture: ReaderAILiveFixture,
  runtime: ReaderAILiveFixtureRuntimeInput,
): ReaderAILiveFixtureRetrievalSeedResult {
  const seed = runtime.retrievalSeed;
  if (!seed) return { ok: false, issues: ['runtime retrieval seed is required'] };
  if (seed.bookHash !== fixture.runtimeBook.bookHash) {
    return { ok: false, issues: ['runtime retrieval seed book handle does not match fixture'] };
  }
  if (seed.chunks.length === 0) {
    return { ok: false, issues: ['runtime retrieval seed must include at least one chunk'] };
  }

  const chunks = toTextChunks(fixture.runtimeBook.bookHash, seed);
  if (chunks.length === 0 || chunks.every((chunk) => chunk.text.trim().length === 0)) {
    return { ok: false, issues: ['runtime retrieval seed must include at least one chunk'] };
  }

  return { ok: true, input: { bookHash: fixture.runtimeBook.bookHash, chunks } };
}

export const prepareDefaultReaderAILiveFixtureRetrievalContext: ReaderAILiveFixtureRetrievalContextPreparer =
  async ({ bookHash, chunks }) => {
    await aiStore.saveChunks(chunks);
    await aiStore.saveBM25Index(bookHash, chunks);
  };
```

- [ ] **Step 4: Wire retrieval preflight into runner**

In `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`, extend imports:

```ts
import {
  buildReaderAILiveFixtureRuntimeBridge,
  prepareDefaultReaderAILiveFixtureRetrievalContext,
  prepareReaderAILiveFixtureRetrievalSeed,
  type ReaderAILiveFixtureRetrievalContextPreparer,
  type ReaderAILiveFixtureRuntimeInput,
} from '@/services/ai/eval/readerAILiveFixtureRuntimeBridge';
```

Update `ReaderAILiveFixtureEvalDeps`:

```ts
export type ReaderAILiveFixtureEvalDeps = {
  live: boolean;
  runtime?: ReaderAILiveFixtureRuntimeInput;
  prepareRetrievalContext?: ReaderAILiveFixtureRetrievalContextPreparer;
  streamAnswer: ReaderAIServiceEvalStreamer;
  writeFile: (path: string, content: string) => Promise<void>;
  now?: () => number;
};
```

After provider bridge preflight in `runReaderAILiveFixtureEval()`, add:

```ts
const retrievalSeed = prepareReaderAILiveFixtureRetrievalSeed(fixture, deps.runtime ?? {});
if (!retrievalSeed.ok) {
  return { ok: false, envelope: null, writtenPaths: [], issues: retrievalSeed.issues };
}

try {
  await (deps.prepareRetrievalContext ?? prepareDefaultReaderAILiveFixtureRetrievalContext)(
    retrievalSeed.input,
  );
} catch {
  return {
    ok: false,
    envelope: null,
    writtenPaths: [],
    issues: ['runtime retrieval context could not be prepared'],
  };
}
```

Keep this code before `runReaderAIServiceEval()` and before any output write.

- [ ] **Step 5: Run focused test to verify retrieval bridge passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts
```

Expected: PASS.

- [ ] **Step 6: Check OpenSpec retrieval tasks and commit**

Modify `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`:

```md
- [x] 2.1 Add failing tests for valid retrieval seed preparation and missing retrieval context preflight failures.
- [x] 2.2 Implement minimal retrieval seed preparation for bounded local fixture runs without depending on normal app UI state.
- [x] 2.3 Ensure provider execution is skipped when retrieval context cannot be prepared.
```

Commit:

```bash
git add apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md
git commit -m "feat(readio): prepare live fixture retrieval seed context"
```

---

### Task 4: CLI runtime input parsing and execution ordering

**Files:**

- Modify: `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`
- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts`
- Modify: `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`

- [ ] **Step 1: Add failing CLI runtime tests**

In `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts`, add seed/runtime files to `validFixture` helpers:

```ts
const validRuntimeSettings = {
  provider: {
    apiKey: 'sk-live-fixture-secret',
    customProviderBaseUrl: 'https://private.example.test/v1/chat',
  },
  retrievalSeed: {
    bookHash: 'private-book-hash-cli',
    chunks: [
      {
        id: 'private-seed-chunk-cli',
        sectionIndex: 1,
        chapterTitle: 'Private Seed Chapter',
        text: 'raw seed text should never be written',
        pageNumber: 10,
      },
    ],
  },
};
```

Add `'raw seed text should never be written'` and `'private-seed-chunk-cli'` to `privateTokens`.

Update the success CLI test argv to include runtime file:

```ts
const memory = createMemoryIO({
  'fixture.json': JSON.stringify(validFixture),
  'runtime.local.json': JSON.stringify(validRuntimeSettings),
});

const exitCode = await runReaderAILiveFixtureEvalCli(
  ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json', '--live'],
  toCliIO(memory),
  {
    streamAnswer,
    prepareRetrievalContext: async () => undefined,
    now: (() => {
      const values = [1000, 1125, 1125];
      let index = 0;
      return () => values[Math.min(index++, values.length - 1)] ?? 0;
    })(),
  },
);
```

Append CLI ordering tests:

```ts
it('does not read runtime settings before --live succeeds', async () => {
  const memory = createMemoryIO({ 'fixture.json': JSON.stringify(validFixture) });
  const exitCode = await runReaderAILiveFixtureEvalCli(
    ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json'],
    toCliIO(memory),
  );

  expect(exitCode).toBe(1);
  expect(memory.errors).toEqual(['Live fixture execution requires --live']);
  expect(memory.writes).toEqual([]);
  expect(memory.files.has('runtime.local.json')).toBe(false);
});

it('does not read runtime settings when fixture validation fails', async () => {
  const memory = createMemoryIO({ 'fixture.json': '{ not-json' });
  const exitCode = await runReaderAILiveFixtureEvalCli(
    ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json', '--live'],
    toCliIO(memory),
  );

  expect(exitCode).toBe(1);
  expect(memory.errors).toEqual(['fixture must be valid JSON']);
  expect(memory.writes).toEqual([]);
  expect(memory.files.has('runtime.local.json')).toBe(false);
});

it('fails closed with safe issues when runtime settings are missing provider or retrieval inputs', async () => {
  const memory = createMemoryIO({
    'fixture.json': JSON.stringify(validFixture),
    'runtime.local.json': JSON.stringify({ provider: {} }),
  });
  let called = false;
  const streamAnswer: ReaderAIServiceEvalStreamer = async function* () {
    called = true;
    yield 'raw answer secret should never be written';
  };

  const exitCode = await runReaderAILiveFixtureEvalCli(
    ['--fixture', 'fixture.json', '--runtime', 'runtime.local.json', '--live'],
    toCliIO(memory),
    { streamAnswer, prepareRetrievalContext: async () => undefined },
  );

  expect(exitCode).toBe(1);
  expect(memory.errors).toEqual(['runtime provider API key is required']);
  expect(memory.writes).toEqual([]);
  expect(called).toBe(false);
  expectNoPrivateTokens(memory.errors.join('\n'));
});
```

- [ ] **Step 2: Run CLI focused test to verify it fails**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts
```

Expected: FAIL because `--runtime`, `prepareRetrievalContext`, and runtime parsing are not wired into the CLI.

- [ ] **Step 3: Update CLI argument and dependency types**

In `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`, update imports:

```ts
import {
  mergeReaderAILiveFixtureRuntimeInputs,
  parseReaderAILiveFixtureRuntimeSettings,
  runtimeBridgeInputFromEnv,
  type ReaderAILiveFixtureRuntimeInput,
} from '@/services/ai/eval/readerAILiveFixtureRuntimeBridge';
```

Update types:

```ts
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
```

Add argument parsing branch:

```ts
if (token === '--runtime') {
  if (value === undefined || value.startsWith('--')) {
    issues.push('Missing value for argument: --runtime');
  } else {
    args.runtime = value;
    index += 1;
  }
  continue;
}
```

- [ ] **Step 4: Add runtime settings loading after fixture validation**

In the CLI file, add helper:

```ts
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
  if (runtimePath === undefined) return { ok: true, runtime: envRuntime };

  let runtimeContent: string;
  try {
    runtimeContent = await io.readFile(runtimePath);
  } catch {
    return { ok: false, issues: ['Unable to read runtime bridge settings'] };
  }

  const parsedRuntime = parseReaderAILiveFixtureRuntimeSettings(runtimeContent);
  if (!parsedRuntime.ok) return { ok: false, issues: parsedRuntime.issues };
  return {
    ok: true,
    runtime: mergeReaderAILiveFixtureRuntimeInputs(envRuntime, parsedRuntime.runtime),
  };
};
```

In `runReaderAILiveFixtureEvalCli()`, after fixture parse succeeds and before loading `streamAnswer`, add:

```ts
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
```

Pass runtime and retrieval preparer into runner:

```ts
const output = await runReaderAILiveFixtureEval(parsedFixture.fixture, {
  live,
  runtime: runtimeInput.runtime,
  prepareRetrievalContext: deps.prepareRetrievalContext,
  streamAnswer,
  writeFile: io.writeFile,
  now: deps.now,
});
```

- [ ] **Step 5: Keep streamer loading after runtime preflight**

Move this line so it remains after `loadRuntimeInput()` and after the fixture `live` check:

```ts
const streamAnswer = deps.streamAnswer ?? (await loadDefaultStreamAnswer());
```

This preserves the current test guarantee that default streamer import does not happen before live gates and runtime bridge preflight.

- [ ] **Step 6: Run CLI focused test to verify it passes**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts
```

Expected: PASS.

- [ ] **Step 7: Check OpenSpec CLI provider wiring task and commit**

Modify `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`:

```md
- [x] 1.3 Wire the live fixture CLI to construct AI settings from runtime bridge inputs only after `--live` and fixture `live: true` pass.
```

Commit:

```bash
git add apps/readest-app/scripts/reader-ai-live-fixture-eval.ts apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md
git commit -m "feat(readio): load live fixture runtime inputs after gates"
```

---

### Task 5: Privacy validation and README workflow

**Files:**

- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
- Modify: `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts`
- Modify: `apps/readest-app/src/services/ai/eval/README.md`
- Modify: `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`

- [ ] **Step 1: Add focused privacy assertions for runtime secrets and seed text**

In runner test `expectMetadataOnlyOutput`, add tokens:

```ts
expect(content).not.toContain('sk-runtime-provider-secret');
expect(content).not.toContain('runtime seed text must never be written');
expect(content).not.toContain('runtime-seed-chunk-1');
expect(content).not.toContain('http://127.0.0.1:11434/v1');
```

In CLI test `privateTokens`, include:

```ts
'raw seed text should never be written',
'private-seed-chunk-cli',
'runtime.local.json',
```

Add this CLI assertion after successful run logs:

```ts
expect(memory.logs.join('\n')).not.toContain('runtime.local.json');
```

- [ ] **Step 2: Run focused tests to verify privacy assertions pass**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts
```

Expected: PASS. If a generated artifact contains runtime seed text, fix the eval boundary that serialized it before continuing.

- [ ] **Step 3: Update README with runtime bridge workflow**

In `apps/readest-app/src/services/ai/eval/README.md`, update the local live fixture section to include:

````md
### Runtime bridge inputs

The live fixture runner stays metadata-only. Provider credentials, custom base URLs, and retrieval seed chunks must come from runtime-only local inputs and must not be committed.

Example local run:

```bash
pnpm --dir apps/readest-app reader-ai:live-fixture -- \
  --fixture tmp/reader-ai/live-fixture/fixture.json \
  --runtime tmp/reader-ai/live-fixture/runtime.local.json \
  --live
```
````

`runtime.local.json` is local developer evidence. Keep it under `tmp/` or another ignored location. It may contain an API key and raw seed chunks, so do not commit it, paste it into issues, or copy it into generated reports.

Minimal runtime file shape:

```json
{
  "provider": {
    "apiKey": "local-only-api-key"
  },
  "retrievalSeed": {
    "bookHash": "local-only-book-handle-matching-fixture",
    "chunks": [
      {
        "id": "local-only-chunk-id",
        "sectionIndex": 1,
        "chapterTitle": "Local-only chapter label",
        "text": "Local-only seed text",
        "pageNumber": 1
      }
    ]
  }
}
```

Environment fallbacks are also supported for provider settings:

```bash
READER_AI_LIVE_FIXTURE_API_KEY=... \
READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED=tmp/reader-ai/live-fixture/seed.local.json \
pnpm --dir apps/readest-app reader-ai:live-fixture -- --fixture tmp/reader-ai/live-fixture/fixture.json --live
```

The generated envelope/report artifacts remain metadata-only and must exclude API keys, custom base URLs, raw seed text, source previews, local paths, URLs, book hashes, and stable private identifiers.

````

If the implemented CLI does not support reading `READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED` as a separate seed file, omit that environment example and document only `--runtime`. Keep the provider env variables documented if implemented.

- [ ] **Step 4: Check OpenSpec privacy/docs tasks and commit**

Modify `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`:

```md
- [x] 3.1 Add tests proving generated envelope/report artifacts exclude runtime API keys, base URLs, seed text, source previews, local paths, URLs, book hashes, and stable private identifiers.
- [x] 3.2 Update eval README with the local runtime bridge workflow and explicit non-commit guidance for runtime seed files.
````

Commit:

```bash
git add apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts apps/readest-app/src/services/ai/eval/README.md openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md
git commit -m "docs(readio): document live fixture runtime bridge workflow"
```

---

### Task 6: Final verification, handoff, and build guard

**Files:**

- Modify: `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`
- Modify: `HANDOFF.md`
- May modify: files from earlier tasks if verification finds a deterministic failure.

- [ ] **Step 1: Run focused eval tests**

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run app lint**

Run:

```bash
pnpm --dir apps/readest-app lint
```

Expected: PASS.

- [ ] **Step 3: Run full app test suite**

Run in background if it is slow:

```bash
pnpm --dir apps/readest-app test
```

Expected: PASS.

- [ ] **Step 4: Run OpenSpec strict validation**

Run:

```bash
openspec validate --all --strict
```

Expected: PASS.

- [ ] **Step 5: Mark verification task complete**

Modify `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`:

```md
- [x] 3.3 Run focused eval tests, lint, full test suite, and `openspec validate --all --strict`.
```

- [ ] **Step 6: Update HANDOFF.md**

Update `HANDOFF.md` with:

```md
# Handoff

## Current goal and progress

Implemented `reader-ai-live-fixture-runtime-bridge`: runtime-only provider configuration, runtime-only retrieval seed preparation, live runner preflight ordering, CLI `--runtime` loading, privacy tests, and README workflow.

## Validated commands

- `pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts`
- `pnpm --dir apps/readest-app lint`
- `pnpm --dir apps/readest-app test`
- `openspec validate --all --strict`

## Key files

- `apps/readest-app/src/services/ai/eval/readerAILiveFixtureRuntimeBridge.ts`
- `apps/readest-app/src/services/ai/eval/readerAILiveFixtureEvalRunner.ts`
- `apps/readest-app/scripts/reader-ai-live-fixture-eval.ts`
- `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts`
- `apps/readest-app/src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts`
- `apps/readest-app/src/services/ai/eval/README.md`
- `openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md`

## Next action

Proceed to Comet verify for `reader-ai-live-fixture-runtime-bridge`.
```

- [ ] **Step 7: Commit final verification updates**

Commit:

```bash
git add openspec/changes/reader-ai-live-fixture-runtime-bridge/tasks.md HANDOFF.md
git commit -m "chore(comet): mark live fixture runtime bridge build ready"
```

- [ ] **Step 8: Run Comet build guard**

Run:

```bash
COMET_SEARCH_ROOTS=("." "$HOME/.claude/skills" "$HOME/.codex/skills" "$HOME/.cursor/skills"); COMET_GUARD="${COMET_GUARD:-$(find "${COMET_SEARCH_ROOTS[@]}" -path '*/comet/scripts/comet-guard.sh' -type f -print -quit 2>/dev/null)}"; bash "$COMET_GUARD" reader-ai-live-fixture-runtime-bridge build --apply
```

Expected: PASS and `.comet.yaml` transitions to `phase: verify`.

---

## Self-Review

- Spec coverage: provider runtime inputs are covered in Tasks 1-2; retrieval seed preparation and provider-skip behavior are covered in Task 3; privacy/reporting validation and README workflow are covered in Task 5; full verification and OpenSpec validation are covered in Task 6.
- Placeholder scan: no placeholders remain; each task names exact files, commands, expected results, and code shapes.
- Type consistency: runtime provider/retrieval types are defined in `readerAILiveFixtureRuntimeBridge.ts`, imported by runner/CLI tests, and passed through `ReaderAILiveFixtureEvalDeps.runtime` consistently.
