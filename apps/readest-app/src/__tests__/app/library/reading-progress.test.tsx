import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ReadingProgress, { getProgressPercentage } from '@/app/library/components/ReadingProgress';
import { Book } from '@/types/book';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/services/constants', () => ({
  SHOW_UNREAD_STATUS_BADGE: false,
}));

vi.mock('@/app/library/components/StatusBadge', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

afterEach(cleanup);

const makeBook = (overrides?: Partial<Book>): Book =>
  ({
    hash: 'book-1',
    title: 'Lord of Mysteries',
    author: 'Cuttlefish',
    format: 'EPUB',
    createdAt: 1000,
    updatedAt: 2000,
    readingStatus: 'reading',
    ...overrides,
  }) as Book;

describe('ReadingProgress', () => {
  it('shows at least 1% once a book has started but is not finished', () => {
    render(<ReadingProgress book={makeBook({ progress: [4, 10397] })} />);

    expect(screen.getByText('1%')).toBeTruthy();
  });

  it('returns null when progress is missing', () => {
    expect(getProgressPercentage(makeBook())).toBeNull();
  });

  it('returns null when total progress is zero', () => {
    expect(getProgressPercentage(makeBook({ progress: [0, 0] }))).toBeNull();
  });

  it('keeps not-started progress at 0%', () => {
    expect(getProgressPercentage(makeBook({ progress: [0, 10397] }))).toBe(0);
  });

  it('clamps started-but-unfinished progress below 100%', () => {
    expect(getProgressPercentage(makeBook({ progress: [9999, 10000] }))).toBe(99);
  });

  it('returns 100% when current progress reaches total', () => {
    expect(getProgressPercentage(makeBook({ progress: [10000, 10000] }))).toBe(100);
  });

  it('returns 100% for single-page progress', () => {
    expect(getProgressPercentage(makeBook({ progress: [0, 1] }))).toBe(100);
  });
});
