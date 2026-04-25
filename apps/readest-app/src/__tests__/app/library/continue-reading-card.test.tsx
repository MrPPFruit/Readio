import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ContinueReadingCard from '@/app/library/components/ContinueReadingCard';
import { Book } from '@/types/book';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/components/BookCover', () => ({
  default: ({ book }: { book: Book }) => <div data-testid='book-cover'>{book.title}</div>,
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
    progress: [23, 100],
    readingStatus: 'reading',
    ...overrides,
  }) as Book;

describe('ContinueReadingCard', () => {
  it('opens the highlighted book when clicked', () => {
    const onOpen = vi.fn();

    render(<ContinueReadingCard book={makeBook()} onOpen={onOpen} />);

    expect(screen.getByText('Continue Reading')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Lord of Mysteries' })).toBeTruthy();
    expect(screen.getByText('Cuttlefish')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Continue reading/i }));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows a visible progress bar once a book has started but is not finished', () => {
    const { container } = render(
      <ContinueReadingCard book={makeBook({ progress: [4, 10397] })} onOpen={vi.fn()} />,
    );

    const progressBar = container.querySelector('.bg-primary') as HTMLElement;

    expect(progressBar.style.width).toBe('1%');
  });
});
