import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ContinueReadingCard from '@/app/library/components/ContinueReadingCard';
import { Book } from '@/types/book';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/components/BookCover', () => ({
  default: ({ book, isPreview }: { book: Book; isPreview?: boolean }) => (
    <div data-testid='book-cover' data-preview={isPreview ? 'true' : 'false'}>
      {book.title}
    </div>
  ),
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
  it('opens the highlighted book from a left-side hit area while keeping the card in layout flow', () => {
    const onOpen = vi.fn();

    const { container } = render(<ContinueReadingCard book={makeBook()} onOpen={onOpen} />);

    expect(screen.getByText('Continue Reading')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Lord of Mysteries' })).toBeTruthy();
    expect(screen.getByText('Cuttlefish')).toBeTruthy();
    expect(container.querySelector('.rounded-3xl.relative')).toBeTruthy();

    const openButton = screen.getByRole('button', { name: /Continue reading/i });
    expect(openButton.className).toContain('absolute');
    expect(openButton.className).toContain('right-40');

    fireEvent.click(openButton);

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('opens global book search from the card without opening the highlighted book', () => {
    const onOpen = vi.fn();
    const onOpenAIBookSearch = vi.fn();

    render(
      <ContinueReadingCard
        book={makeBook()}
        onOpen={onOpen}
        onOpenAIBookSearch={onOpenAIBookSearch}
      />,
    );

    const continueButton = screen.getByRole('button', { name: /Continue reading/i });
    const searchButton = screen.getByRole('button', { name: '寻书' });

    expect(continueButton.className).toContain('right-40');
    expect(searchButton.className).toContain('z-20');

    fireEvent.click(searchButton);

    expect(onOpenAIBookSearch).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('shows a visible progress bar once a book has started but is not finished', () => {
    const { container } = render(
      <ContinueReadingCard book={makeBook({ progress: [4, 10397] })} onOpen={vi.fn()} />,
    );

    const progressBar = container.querySelector('.bg-primary') as HTMLElement;

    expect(progressBar.style.width).toBe('1%');
  });

  it('renders the small cover as a preview to prevent fallback title overflow', () => {
    render(<ContinueReadingCard book={makeBook({ coverImageUrl: '' })} onOpen={vi.fn()} />);

    expect(screen.getByTestId('book-cover').dataset['preview']).toBe('true');
  });
});
