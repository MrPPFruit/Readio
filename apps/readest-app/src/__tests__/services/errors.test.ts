import { describe, expect, it } from 'vitest';

import { BookFileNotFoundError, getReaderOpenErrorMessage } from '@/services/errors';

describe('getReaderOpenErrorMessage', () => {
  it('asks readers to import the local book again when the source file is missing', () => {
    expect(getReaderOpenErrorMessage(new BookFileNotFoundError())).toBe(
      'The local book file is missing. Import this book again to continue reading.',
    );
  });

  it('keeps a generic message for unknown reader errors', () => {
    expect(getReaderOpenErrorMessage(new Error('parser failed'))).toBe('Unable to open book');
  });
});
