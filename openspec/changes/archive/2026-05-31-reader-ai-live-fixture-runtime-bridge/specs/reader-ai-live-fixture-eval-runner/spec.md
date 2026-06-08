## MODIFIED Requirements

### Requirement: Live fixture runner requires explicit provider execution opt-in

The system SHALL prevent accidental live model/provider execution by default and SHALL require runtime bridge preflight checks before calling a real provider.

#### Scenario: Missing live opt-in blocks provider execution

- **WHEN** the runner is invoked without the explicit live execution flag
- **THEN** it refuses to call the real Reader AI answer streamer and exits with a deterministic safety message

#### Scenario: Live opt-in executes bounded cases

- **WHEN** the runner is invoked with explicit live execution enabled, a valid fixture, and valid runtime bridge inputs
- **THEN** it executes no more than the configured case limit through the real Reader AI service path and records provider/model labels, source counts, first-output latency, pass/fail labels, and safe trace metadata

#### Scenario: Runtime bridge preflight blocks unsafe live execution

- **WHEN** the runner is invoked with live execution enabled but required runtime provider or retrieval inputs are unavailable
- **THEN** it fails before calling the real Reader AI answer streamer and writes no partial output artifacts
