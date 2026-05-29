# Reader AI eval foundation

This directory contains the local schema foundation for Reader AI ordinary-reader QA evals.

Case categories:

- `person_recall`
- `object_recall`
- `event_recap`
- `relationship_recall`
- `current_recap`
- `citation_grounding`
- `spoiler_safety`

Committed eval cases must avoid raw copyrighted book text, raw prompts, answer text, API keys, local paths, book hashes, and stable private book identifiers. Store only metadata, the user-style question, expected behavior, spoiler mode, optional tags, and label-style notes.

NotebookLM benchmark usage is manual only: compare Readio answers against NotebookLM full-book mode for the same ordinary-reader question set, then record objective metadata in `ReaderAIEvalResult.manualBenchmark`. Do not treat NotebookLM output as a CI oracle and do not copy NotebookLM or Readio answer text into eval records. Manual observations must be short labels such as `more_complete`, `missed_citation`, or `spoiler_boundary_diff`.

For spoiler-protected Readio runs, evaluate only read-so-far evidence. For whole-book manual checks, record `manualBenchmark.mode: 'whole_book'` separately so results are not mixed with deterministic pass/fail.

## Local report runner

The report runner accepts a parsed local JSON-style envelope:

```ts
{
  cases: ReaderAIEvalCase[];
  results: ReaderAIEvalResult[];
  traces?: ReaderAITraceLike[];
}
```

It validates cases and results, aggregates trace-like metadata by opaque `runId`, and returns a deterministic metadata-only JSON report plus Markdown. Invalid case/result input fails closed and does not produce a partial report.

The runner is intentionally pure: it does not read files, write files, call model providers, load books, run indexing, automate NotebookLM, or change Reader AI UI/runtime behavior. A CLI wrapper can be added later after this data contract stabilizes.

Manual benchmark observations remain non-authoritative metadata. They can help compare Readio against NotebookLM during manual analysis, but they do not affect deterministic pass/fail scoring and are not rendered into the Markdown report.
