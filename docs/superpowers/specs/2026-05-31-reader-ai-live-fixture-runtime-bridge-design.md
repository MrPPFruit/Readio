---
comet_change: reader-ai-live-fixture-runtime-bridge
role: technical-design
canonical_spec: openspec
archived-with: 2026-05-31-reader-ai-live-fixture-runtime-bridge
status: final
---

# Reader AI Live Fixture Runtime Bridge Technical Design

## Design Approval Basis

This design follows the OpenSpec change `reader-ai-live-fixture-runtime-bridge` as the canonical source. It does not redefine capability requirements. It turns the accepted OpenSpec scope into a buildable technical plan for runtime-only provider configuration, runtime-only retrieval seeding, fail-closed preflight, and metadata-only artifacts.

## Recommended Approach

Use a narrow runtime bridge under the existing `reader-ai:live-fixture` command:

```text
fixture.json + --live
  -> parse metadata-only fixture
  -> parse runtime-only bridge inputs
  -> preflight provider config
  -> preflight/prepare retrieval seed
  -> load real streamReaderAIAnswer
  -> runReaderAIServiceEval
  -> build metadata-only report artifacts
```

This keeps safety gates centralized in the existing live fixture runner. It avoids a second runner, avoids loading full app settings, and avoids changing normal Reader AI product behavior.

## Alternatives Considered

### A. Environment-only bridge

Provider credentials and seed paths come only from environment variables.

- Pros: minimal CLI surface; no local secret file parser.
- Cons: awkward for retrieval seed configuration; harder to validate reproducibly; easy to lose the exact local run setup.

### B. Local runtime settings file only

The CLI accepts one ignored local JSON file containing provider credentials, optional custom base URL, and retrieval seed chunks.

- Pros: explicit and reproducible locally; one preflight object; good for tests.
- Cons: risk of accidental commit if documentation and git hygiene are weak; file can contain raw book text.

### C. Recommended hybrid

The CLI accepts runtime bridge inputs from environment variables and/or one explicit local runtime settings file. Fixture JSON still contains only eval metadata and provider/model labels. Runtime inputs are never copied into fixtures or generated artifacts.

- Pros: flexible for local use; testable; keeps secrets out of fixtures; supports retrieval seed without UI state.
- Cons: requires strict precedence and privacy tests.

Recommended precedence: explicit runtime settings file values override environment values only for bridge-owned runtime fields. Fixture values still own provider/model labels and output paths.

## Component Boundaries

### Runtime provider bridge

Purpose: construct safe `AISettings` for live fixture execution after both live gates pass.

Inputs:

- validated fixture settings: `provider`, `model`, `maxContextChunks`, `spoilerProtection`;
- runtime-only provider inputs:
  - API key for the selected provider;
  - optional custom base URL for `custom-openai-compatible`;
  - optional unsafe-local-proxy allow flag for local testing proxies.

Responsibilities:

- reject provider secret fields in fixture JSON;
- require API key unless the selected provider is `custom-openai-compatible` with an explicitly allowed unsafe local proxy already accepted by existing base URL safety rules;
- build `AISettings.providerApiKeys` only in memory;
- build `AISettings.providerModels` from fixture provider/model labels;
- validate custom base URL with existing `getCustomBaseUrlSafety` behavior instead of inventing a second policy;
- return deterministic safe issue strings such as `runtime provider API key is required` or `runtime custom provider base URL is invalid`.

Non-responsibilities:

- no provider health check in preflight;
- no full app settings import;
- no model catalog validation beyond existing provider support and non-empty model label.

### Runtime retrieval seed bridge

Purpose: prepare the minimal indexed context required by the real Reader AI retrieval path without depending on browser UI state.

Inputs:

- fixture runtime book handle required by the existing service path: `bookHash`, `bookTitle`, `authorName`, `currentPage`, `currentAIPage`;
- runtime-only retrieval seed data for that handle.

Recommended seed shape is local-only and implementation-owned, not a committed fixture contract:

```ts
type RuntimeRetrievalSeed = {
  bookHash: string;
  chunks: Array<{
    id: string;
    sectionIndex: number;
    chapterTitle: string;
    text: string;
    pageNumber: number;
    sortIndex?: number;
    endPageNumber?: number;
    chunkIndex?: number;
  }>;
};
```

Responsibilities:

- verify seed `bookHash` matches the fixture runtime book handle before seeding;
- verify at least one valid text chunk exists;
- normalize chunks into existing `TextChunk` shape in memory;
- save chunks and BM25 index through existing AI storage APIs where possible: `aiStore.saveChunks()` and `aiStore.saveBM25Index()`;
- avoid embeddings for this slice so the path remains storage-light and deterministic;
- fail before streamer invocation if retrieval context cannot be prepared.

Non-responsibilities:

- no EPUB parsing;
- no app library scan;
- no browser IndexedDB import/export workflow;
- no retrieval ranking or prompt tuning.

### Live fixture runner orchestration

Purpose: enforce live gates and bridge preflight order before real provider execution.

Required ordering:

1. parse CLI args;
2. reject missing `--live` before reading runtime bridge secrets or loading the real streamer;
3. read and validate fixture JSON;
4. reject fixture `live !== true`;
5. parse runtime bridge inputs;
6. preflight provider config;
7. preflight/prepare retrieval context;
8. only then load `streamReaderAIAnswer` and call `runReaderAILiveFixtureEval` / `runReaderAIServiceEval`.

This ordering preserves the current safety property that the default streamer module is not loaded before live execution is explicitly authorized.

### Artifact privacy boundary

Generated envelope/report artifacts may include existing safe eval metadata: case IDs, categories, languages, expected behavior labels, provider/model labels, source counts, pass/fail labels, latency, and sanitized trace metadata.

Generated artifacts must not include:

- API keys or auth tokens;
- custom base URLs;
- raw seed chunk text;
- source previews or source context text;
- raw prompt/system prompt/model messages;
- raw answer text;
- local file paths;
- URLs;
- raw exception messages;
- book hashes;
- stable private book identifiers.

Implementation should keep the existing service eval/report metadata contract, but add focused privacy assertions for runtime bridge inputs. If generated artifacts currently serialize any newly prohibited runtime bridge token, treat that as a build blocker and sanitize at the closest eval boundary rather than post-processing files after writing.

## Data Flow

```text
CLI argv
  --fixture <metadata fixture>
  --live
  --runtime <ignored local runtime file>       optional
  env READER_AI_LIVE_FIXTURE_*                optional

metadata fixture
  provider/model labels
  case metadata
  runtime book handle
  output paths

runtime bridge
  provider credentials/base URL
  retrieval seed chunks

preflight result
  ok -> in-memory AISettings + prepared retrieval context
  fail -> safe issues, no streamer call, no artifacts

service eval
  real streamReaderAIAnswer
  existing retrieval path
  existing provider path
  metadata-only envelope/report
```

## CLI Surface

Keep the existing command and add one explicit optional argument:

```bash
pnpm --dir apps/readest-app reader-ai:live-fixture -- \
  --fixture tmp/reader-ai/live-fixture/fixture.json \
  --runtime tmp/reader-ai/live-fixture/runtime.local.json \
  --live
```

Environment fallback names should be specific to this local eval path, for example:

```text
READER_AI_LIVE_FIXTURE_API_KEY
READER_AI_LIVE_FIXTURE_CUSTOM_BASE_URL
READER_AI_LIVE_FIXTURE_ALLOW_UNSAFE_LOCAL_PROXY
READER_AI_LIVE_FIXTURE_RETRIEVAL_SEED
```

The runtime file path and retrieval seed file path are local-only operational inputs. They must not be written into output artifacts.

## Failure Semantics

Preflight failures return exit code `1`, write deterministic safe stderr issues, write no output artifacts, and do not call the real streamer.

Safe issue examples:

- `runtime provider API key is required`
- `runtime custom provider base URL is invalid`
- `runtime retrieval seed is required`
- `runtime retrieval seed book handle does not match fixture`
- `runtime retrieval seed must include at least one chunk`
- `runtime retrieval context could not be prepared`

Runtime streaming failures after successful preflight continue to use the existing service eval behavior: record safe failed/cancelled metadata, avoid raw exception persistence, and still write metadata-only artifacts when report validation succeeds.

## Testing Strategy

### Provider bridge tests

Add failing tests first for:

- valid runtime API key creates in-memory `AISettings.providerApiKeys` and passes the selected model label;
- missing API key fails before streamer call and before writes;
- custom base URL is accepted only when existing base URL safety rules accept it;
- fixture JSON containing provider secret/base URL fields is rejected before execution;
- API key and base URL tokens never appear in envelope/report artifacts or stderr.

### Retrieval seed bridge tests

Add failing tests first for:

- valid seed prepares chunks and BM25 index via injected storage/preparer dependency;
- missing seed/retrieval context fails before streamer call;
- seed with mismatched book handle fails before streamer call;
- raw seed text, paths, URLs, and book hashes do not appear in generated artifacts;
- provider execution is skipped when seed preparation throws.

### CLI ordering tests

Extend current CLI tests to prove:

- missing `--live` does not load `streamReaderAIAnswer` and does not read runtime secrets;
- invalid fixture does not read runtime secrets;
- missing runtime provider or retrieval inputs do not load/call the real streamer;
- success path logs only output paths, not runtime secret paths or values.

### Regression verification

Run:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-live-fixture-eval-runner.test.ts src/__tests__/ai/reader-ai-live-fixture-eval-cli.test.ts
pnpm --dir apps/readest-app test
pnpm --dir apps/readest-app lint
openspec validate --all --strict
```

## Technical Risks

### IndexedDB in Node

`aiStore` opens IndexedDB directly. If the Node test/runtime environment does not provide IndexedDB, the bridge may need an injectable retrieval preparer boundary so unit tests can verify ordering without a real DB. The local live CLI can then either use the app's existing polyfill if available or fail closed with a safe retrieval issue. Do not add broad storage shims unless the minimal live fixture path requires it.

### Privacy conflict from eval case text

The existing eval envelope includes eval case metadata, including `question` and `expectedBehavior`. The OpenSpec privacy rule forbids raw prompt text and raw seed/answer/source text. Treat eval case questions as declared eval metadata, not generated prompt text. Do not include system prompts, provider messages, seed chunks, or raw answer text. If future policy forbids storing questions too, that should be an OpenSpec patch because it changes the existing eval metadata contract.

### Custom local proxy safety

The existing provider path already allows a custom local testing proxy only when `allowUnsafeCustomProviderBaseUrl === true` and `getCustomBaseUrlSafety(..., true)` returns `unsafe-local-proxy`. Reuse that policy exactly. Do not broaden accepted HTTP URLs.

### Partial output writes

Preflight must complete before any output write. During post-stream reporting, write artifacts only after `buildReaderAIEvalReportRun(envelope)` succeeds. This preserves the existing no-partial-output behavior for validation/preflight failures.

## Build Notes

- Keep runtime bridge code close to the eval runner, likely under `apps/readest-app/src/services/ai/eval/`, so tests can import pure parsing/preflight functions without invoking the CLI.
- Extend `ReaderAILiveFixtureEvalDeps` with injectable bridge dependencies rather than importing storage/provider helpers deep inside tests.
- Keep `toAISettings` private or replace it with a provider-bridge function that accepts validated runtime provider config.
- Avoid `any`; use `unknown`, discriminated unions, and explicit runtime validation helpers.
- Update the eval README with local-only workflow and explicit non-commit guidance for runtime files.

## Out of Scope

- No Reader AI answer quality tuning.
- No UI changes.
- No NotebookLM automation.
- No batch benchmark discovery.
- No real book fixture committed to git.
- No LLM-as-judge.
