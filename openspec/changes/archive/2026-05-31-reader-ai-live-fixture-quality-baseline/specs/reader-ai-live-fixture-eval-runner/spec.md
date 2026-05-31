## ADDED Requirements

### Requirement: Live fixture artifacts can feed quality baseline workflows

The system SHALL keep live fixture eval outputs compatible with local quality baseline workflows while preserving guarded execution and metadata-only artifacts.

#### Scenario: Successful live fixture output is baseline-compatible

- **WHEN** a guarded live fixture run completes and writes a sanitized eval envelope or report
- **THEN** the output contains the case/result/trace metadata needed by the local quality baseline workflow without requiring raw answer text, source text, prompts, provider secrets, runtime file paths, book hashes, or stable private identifiers

#### Scenario: Failed live fixture output remains safe for baseline validation

- **WHEN** a guarded live fixture run fails before or during provider execution
- **THEN** any reported failure metadata uses safe deterministic labels that the quality baseline workflow can validate or reject without exposing raw exception messages, raw answers, source previews, runtime paths, API keys, URLs, book hashes, or stable private identifiers
