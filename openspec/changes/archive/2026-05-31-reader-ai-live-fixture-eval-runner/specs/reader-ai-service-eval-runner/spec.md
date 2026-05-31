## ADDED Requirements

### Requirement: Service eval runner supports explicit live streamer callers

The system SHALL allow an external local runner to explicitly pass the real Reader AI answer streamer into the service eval runner without weakening the service eval runner privacy boundary.

#### Scenario: Explicit real streamer injection uses existing service contract

- **WHEN** a local live fixture runner passes the real Reader AI answer streamer as the injected `streamAnswer` dependency
- **THEN** the service eval runner invokes it through the same controlled `StreamReaderAIAnswerOptions` contract used by fake streamers

#### Scenario: Service eval output remains metadata-only for live callers

- **WHEN** the service eval runner is used by a live fixture caller
- **THEN** it still returns only eval cases, eval results, and sanitized trace-like metadata without raw answer text, source text, prompts, book titles, author names, book hashes, local paths, URLs, API keys, or stable private identifiers
