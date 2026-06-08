## ADDED Requirements

### Requirement: Runtime bridge supplies provider configuration without fixture secrets

The system SHALL provide a runtime-only local bridge that can supply provider credentials and optional custom base URL data to live fixture execution without requiring secrets in fixture JSON.

#### Scenario: Runtime provider configuration is supplied from local inputs

- **WHEN** the live fixture CLI is invoked with explicit live execution and valid runtime provider inputs
- **THEN** the bridge constructs the AI settings needed for the real Reader AI streamer without persisting API keys, base URLs, or secret values into the fixture or generated eval artifacts

#### Scenario: Missing runtime provider configuration fails closed

- **WHEN** the live fixture CLI is invoked for a provider that requires credentials but no runtime credential is available
- **THEN** the bridge refuses to execute the real streamer, reports deterministic safe issues, and writes no partial output artifacts

### Requirement: Runtime bridge prepares retrieval context for bounded local fixture runs

The system SHALL allow a local live fixture run to prepare the minimal retrieval context needed by the Reader AI service path from runtime-only seed data.

#### Scenario: Runtime retrieval seed enables a bounded run

- **WHEN** the live fixture run provides valid runtime-only retrieval seed data for the selected fixture book handle
- **THEN** the bridge prepares retrieval context for the service eval run without requiring the normal app UI or browser IndexedDB state

#### Scenario: Missing retrieval context fails before provider execution

- **WHEN** neither existing retrieval context nor valid runtime retrieval seed data is available for the fixture
- **THEN** the bridge fails before provider execution with deterministic safe issues and writes no partial output artifacts

### Requirement: Runtime bridge keeps generated artifacts metadata-only

The system MUST keep all generated live fixture outputs metadata-only even when runtime provider credentials and retrieval seed data are used locally.

#### Scenario: Runtime secrets and seed text are excluded from artifacts

- **WHEN** a live fixture run completes, fails, or is aborted after using runtime provider inputs or retrieval seed data
- **THEN** generated envelope and report artifacts do not include API keys, raw seed text, prompt text, raw answer text, source previews, local paths, URLs, book hashes, or stable private identifiers
