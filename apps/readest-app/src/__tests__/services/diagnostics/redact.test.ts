import { describe, expect, it } from 'vitest';

import {
  redactDiagnosticError,
  redactDiagnosticMetadata,
  redactDiagnosticString,
} from '@/services/diagnostics/redact';

describe('diagnostics redaction', () => {
  it('redacts secrets from diagnostic strings', () => {
    const value = redactDiagnosticString(
      'Authorization: Bearer abc.def.ghi apiKey=sk-test_1234567890abcdefghij password="hunter2" token: supersecretvalue1234567890',
    );

    expect(value).not.toContain('abc.def.ghi');
    expect(value).not.toContain('sk-test_1234567890abcdefghij');
    expect(value).not.toContain('hunter2');
    expect(value).not.toContain('supersecretvalue1234567890');
    expect(value).toContain('[REDACTED]');
  });

  it('truncates long user content with a marker', () => {
    const value = redactDiagnosticString('a'.repeat(240), 48);

    expect(value).toHaveLength(60);
    expect(value).toBe(`${'a'.repeat(48)}…[truncated]`);
  });

  it('redacts sensitive metadata keys regardless of value shape', () => {
    const metadata = redactDiagnosticMetadata({
      apiKey: 'abc123',
      token: 'short-lived',
      password: 'hunter2',
      authorization: 'Basic dXNlcjpwYXNz',
      nested: {
        refresh_token: 'tiny',
        clientSecret: 'small',
        safe: 'kept',
      },
    });

    expect(metadata).toEqual({
      apiKey: '[REDACTED]',
      token: '[REDACTED]',
      password: '[REDACTED]',
      authorization: '[REDACTED]',
      nested: {
        refresh_token: '[REDACTED]',
        clientSecret: '[REDACTED]',
        safe: 'kept',
      },
    });
  });

  it('drops content-bearing metadata keys recursively and bounds arrays', () => {
    const metadata = redactDiagnosticMetadata({
      eventId: 'reader-ai-answer',
      question: 'What happens in this chapter?',
      selectedText: 'Selected private passage',
      userPrompt: 'User private prompt',
      rawPrompt: 'Raw private prompt',
      rawMessages: [{ role: 'user', content: 'Private chat' }],
      bookContent: 'Full private book content',
      chapterContent: 'Private chapter content',
      nested: {
        prompt: 'Answer from this private book passage',
        page: 42,
        items: [
          { quote: 'Private quote', safe: 'kept' },
          { text: 'Private text', count: 2 },
          'safe string',
          'another safe string',
          'extra safe string',
          'overflow string',
        ],
      },
    });

    expect(metadata).toEqual({
      eventId: 'reader-ai-answer',
      nested: {
        page: 42,
        items: [
          { safe: 'kept' },
          { count: 2 },
          'safe string',
          'another safe string',
          'extra safe string',
        ],
      },
    });
  });

  it('redacts Windows local paths from diagnostic strings', () => {
    const value = redactDiagnosticString('Failed opening C:\\Users\\Alice\\Books\\private.epub');

    expect(value).not.toContain('Alice');
    expect(value).not.toContain('private.epub');
    expect(value).toContain('[LOCAL_PATH]');
  });

  it('redacts URLs and standalone book filenames from diagnostic strings', () => {
    const value = redactDiagnosticString(
      'Download failed from https://example.test/private/book.epub?token=secret for private-book.epub',
    );

    expect(value).not.toContain('https://example.test/private/book.epub?token=secret');
    expect(value).not.toContain('private-book.epub');
    expect(value).toContain('[URL]');
    expect(value).toContain('[FILENAME]');
  });

  it('redacts Error name, message, and stack with local paths removed', () => {
    const error = new Error(
      'Failed opening /Users/ppg/Books/private.epub with secret=abcdef1234567890abcdef1234567890',
    );
    error.name = 'ReadError sk-live_abcdef1234567890abcdef';
    error.stack =
      'Error: Failed opening /Users/ppg/Books/private.epub\n    at read (/private/var/app/source.ts:10:5)\n    at load (/data/user/0/app/cache/book.txt:2:1)';

    const redacted = redactDiagnosticError(error);

    expect(redacted.name).not.toContain('sk-live_abcdef1234567890abcdef');
    expect(redacted.message).not.toContain('/Users/ppg/Books/private.epub');
    expect(redacted.message).not.toContain('abcdef1234567890abcdef1234567890');
    expect(redacted.stack).not.toContain('/private/var/app/source.ts');
    expect(redacted.stack).not.toContain('/data/user/0/app/cache/book.txt');
    expect(redacted.name).toContain('[REDACTED]');
    expect(redacted.message).toContain('[LOCAL_PATH]');
    expect(redacted.stack).toContain('[LOCAL_PATH]');
  });

  it('never throws for unknown metadata and errors', () => {
    const circular: Record<string, unknown> = { ok: true };
    circular['self'] = circular;

    expect(() => redactDiagnosticMetadata(circular)).not.toThrow();
    expect(() => redactDiagnosticError({ message: circular })).not.toThrow();
  });
});
