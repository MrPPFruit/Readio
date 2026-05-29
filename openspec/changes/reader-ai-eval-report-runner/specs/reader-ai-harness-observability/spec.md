## ADDED Requirements

### Requirement: Exported Reader AI traces support local report generation

The system SHALL allow exported Reader AI trace diagnostics to be consumed by the local eval report runner as metadata-only trace-like events.

#### Scenario: Exported trace events are summarized by run id

- **WHEN** local report generation receives exported Reader AI trace diagnostics containing run identifiers, stages, actions, statuses, counts, durations, issue counts, latency budgets, and normalized outcomes
- **THEN** the runner summarizes them by opaque run id without requiring raw user questions, answers, source text, book identity, local paths, URLs, prompts, or credentials

#### Scenario: Trace privacy boundary is preserved in report output

- **WHEN** exported diagnostics contain unknown or unsafe content-bearing trace fields
- **THEN** local report generation omits those fields from trace summaries, JSON reports, and Markdown reports
