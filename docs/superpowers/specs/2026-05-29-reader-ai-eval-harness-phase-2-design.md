---
comet_change: reader-ai-eval-harness-phase-2
role: technical-design
canonical_spec: openspec
---

# Reader AI Eval Harness Phase 2 Design

## Summary

Build the Phase 2 eval harness as a pure, metadata-only utility layer inside `apps/readest-app/src/services/ai/eval/`. This slice does not invoke real models, load real books, change Reader AI UI, alter prompts, change retrieval ranking, or modify citation preview behavior.

The goal is to turn Phase 1 `reader_ai.trace` events and eval case/result records into deterministic QA evidence: validated fixtures, per-run trace summaries, category-level eval summaries, and report-friendly metadata.

## Architecture

```text
ReaderAIEvalCase[]        ReaderAIEvalResult[]        ReaderAITraceLike[]
        │                         │                          │
        ▼                         ▼                          ▼
 validate cases            validate results           sanitize + group by runId
        │                         │                          │
        └──────────────┬──────────┴──────────────┬───────────┘
                       ▼                         ▼
              build run summaries        build eval report summary
                       │                         │
                       └──────────────┬──────────┘
                                      ▼
                          metadata-only report object
```

### Module boundaries

- `readerAIEval.ts`
  - Keep existing case/result category types.
  - Extend safe metadata types.
  - Export validators and pure summary helpers.
- Optional split if file gets too large:
  - `traceAggregation.ts` for `reader_ai.trace` grouping.
  - `reporting.ts` for category and latency summaries.
- Tests stay under `apps/readest-app/src/__tests__/ai/reader-ai-eval.test.ts` unless the file becomes unwieldy.

No app runtime code should import the new summary/report helpers yet. This is a local harness foundation for tests, manual eval records, and future tooling.

## Data contracts

### Eval case

Existing fields remain valid:

- `id`
- `category`
- `language`
- `question`
- `expectedBehavior`
- `spoilerMode`

Phase 2 may add safe optional fields:

- `tags?: string[]`
- `benchmarkMode?: 'readio' | 'notebooklm_manual' | 'human_manual'`
- `notes?: string[]`

`question` and `expectedBehavior` are allowed because OpenSpec already defines user-style questions and expected behavior as committed metadata. They must not contain quoted source passages or private book content.

### Eval result

Existing fields remain valid:

- `caseId`
- `runId`
- `classificationIntent`
- `sourceCount`
- `citationValid`
- `insufficientAnswer`
- `firstOutputMs`
- `passed`
- `reasons`

Phase 2 may add safe optional fields:

- `provider?: string`
- `model?: string`
- `spoilerMode?: ReaderAIEvalSpoilerMode`
- `overBudgetStage?: ReaderAIOverBudgetStage | 'none'`
- `manualBenchmark?: { source: 'notebooklm' | 'human'; mode: 'whole_book' | 'read_so_far'; observations: string[] }`

Manual benchmark observations must be labels like `more_complete`, `missed_citation`, or `spoiler_boundary_diff`, not copied answer text.

### Trace-like input

Trace aggregation consumes plain metadata records, not diagnostics log files. Required/safe fields:

- `runId`
- `stage`
- `action`
- `status`
- `durationMs`
- `candidateCount`
- `selectedCount`
- `sourceCount`
- `issueCount`
- `issueTypeCounts`
- `firstOutputMs`
- `overBudgetStage`
- `recoveryHint`

Unknown fields are ignored. Content-bearing fields are not copied into summaries.

## Privacy rules

Validators and aggregators must reject or drop these field names recursively:

- raw answer/source/book content: `answer`, `answerText`, `sourceText`, `rawBookText`, `snippet`, `quote`, `previewText`, `chunkText`
- prompts/messages: `prompt`, `rawPrompt`, `messages`, `rawMessages`
- private identity/path/secret fields: `bookTitle`, `authorName`, `bookHash`, `localPath`, `url`, `apiKey`, `token`, `authorization`

The eval helpers should fail closed for persisted case/result validation and drop unsafe fields for trace aggregation summaries.

## Reporting design

The primary report output is a JSON-friendly object:

```ts
type ReaderAIEvalReport = {
  totalCases: number;
  totalResults: number;
  passed: number;
  failed: number;
  byCategory: Record<
    string,
    {
      total: number;
      passed: number;
      insufficientAnswers: number;
      citationValid: number;
      firstOutputMs: {
        min: number | null;
        max: number | null;
        average: number | null;
      };
      overBudgetStages: Record<string, number>;
    }
  >;
  runSummaries: ReaderAITraceRunSummary[];
};
```

Markdown rendering can be added later. For Phase 2, a structured object is easier to test and safer for privacy review.

## Testing strategy

Use TDD around pure functions:

1. Case/result validators accept valid synthetic ordinary-reader records.
2. Validators reject unsafe content-bearing fields recursively.
3. Trace aggregation groups events by `runId` and summarizes allowed fields.
4. Trace aggregation ignores unknown and unsafe content-bearing fields.
5. Report summary calculates category pass/fail, citation validity, insufficient-answer counts, first-output latency, and over-budget stage breakdown.
6. Manual NotebookLM benchmark notes remain optional metadata and do not affect deterministic pass/fail.

Focused validation command:

```bash
pnpm --dir apps/readest-app test src/__tests__/ai/reader-ai-eval.test.ts src/__tests__/services/diagnostics/reader-ai-trace.test.ts
```

Full validation remains:

```bash
pnpm --dir apps/readest-app lint
pnpm --dir apps/readest-app test
```

## Implementation sequence

1. Extend eval types and privacy-field detection.
2. Add validator hardening tests and implementation.
3. Add trace aggregation tests and implementation.
4. Add report summary tests and implementation.
5. Update eval README with manual benchmark guidance.
6. Update `HANDOFF.md` after validation.

## Risks and mitigations

- Report output may be too shallow for semantic answer quality. Mitigation: Phase 2 measures objective blockers first; semantic completeness belongs in a later eval/judge change.
- Privacy validation can miss a new content field. Mitigation: use recursive field-name detection and tests for common aliases.
- Trace taxonomy may evolve. Mitigation: aggregators ignore unknown fields and only summarize known safe fields.
- Manual benchmark notes could drift into copied answer text. Mitigation: validators reject content-like keys and documentation requires label-style observations only.

## Deferred work

- A CLI command that reads local exported diagnostics and writes a report file.
- Real service-level eval runner around `streamReaderAIAnswer`.
- LLM-as-judge for completeness/style after deterministic grounding checks stabilize.
- NotebookLM automation, if ever useful, as a separate change.
- Latency-aware streaming or citation-repair deferral if reports prove first output is blocked by post-generation work.
