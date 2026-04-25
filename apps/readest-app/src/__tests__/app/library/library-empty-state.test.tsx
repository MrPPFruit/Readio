import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LibraryEmptyState from '@/app/library/components/LibraryEmptyState';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

afterEach(cleanup);

describe('LibraryEmptyState', () => {
  it('guides first-time readers to import local books', () => {
    const onImportBooks = vi.fn();

    render(<LibraryEmptyState onImportBooks={onImportBooks} />);

    expect(screen.getByRole('heading', { name: 'Start with a local book' })).toBeTruthy();
    expect(
      screen.getByText(
        'Import EPUB, PDF, TXT, MOBI, AZW3, FB2, CBZ, or CBR files from this device.',
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'EPUB is recommended for the best reading experience. PDF support is basic and may keep the original fixed layout.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Import Local Books' }));

    expect(onImportBooks).toHaveBeenCalledTimes(1);
  });
});
