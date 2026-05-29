import BookCover from '@/components/BookCover';
import { Book } from '@/types/book';
import { formatAuthors } from '@/utils/book';
import { useTranslation } from '@/hooks/useTranslation';
import ReadingProgress, { getProgressPercentage } from './ReadingProgress';

interface ContinueReadingCardProps {
  book: Book;
  onOpen: () => void;
  onOpenAIBookSearch?: () => void;
}

const ContinueReadingCard: React.FC<ContinueReadingCardProps> = ({
  book,
  onOpen,
  onOpenAIBookSearch,
}) => {
  const _ = useTranslation();
  const author = formatAuthors(book.author, book.primaryLanguage) || _('Unknown Author');
  const progressPercentage = getProgressPercentage(book) ?? 0;

  return (
    <section className='px-4 pb-3 pt-2 sm:px-6 sm:pt-4' aria-label={_('Continue Reading')}>
      <div className='from-base-100 to-base-300/60 border-base-300/70 text-base-content relative flex min-h-[9rem] items-center gap-4 rounded-3xl border bg-gradient-to-br p-3 pr-40 shadow-sm sm:min-h-[10rem] sm:gap-5 sm:p-4 sm:pr-44'>
        <div className='bg-base-200 h-24 w-16 shrink-0 overflow-hidden rounded-xl shadow-md sm:h-28 sm:w-20'>
          <BookCover book={book} coverFit='crop' imageClassName='rounded-xl' isPreview />
        </div>
        <div className='min-w-0 flex-1'>
          <div className='text-neutral-content mb-1 text-xs font-medium uppercase tracking-[0.18em]'>
            {_('Continue Reading')}
          </div>
          <h2 className='line-clamp-2 text-xl font-semibold leading-tight sm:text-2xl'>
            {book.title}
          </h2>
          <p className='text-neutral-content mt-1 line-clamp-1 text-sm'>{author}</p>
          <div className='mt-3 flex items-center gap-3'>
            <div className='bg-base-300 h-1.5 flex-1 overflow-hidden rounded-full'>
              <div
                className='bg-primary h-full rounded-full'
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <ReadingProgress book={book} />
          </div>
        </div>
        <button
          type='button'
          className='absolute inset-y-0 left-0 right-40 z-10 rounded-l-3xl border-0 bg-transparent p-0 text-left transition active:scale-[0.99] sm:right-44'
          aria-label={_('Continue reading {{title}}', { title: book.title })}
          onClick={onOpen}
        />
        {onOpenAIBookSearch && (
          <button
            type='button'
            className='btn btn-ghost bg-base-100/70 text-base-content/75 hover:bg-base-100/90 border-base-content/10 absolute right-3 top-3 z-20 min-h-11 rounded-full border px-4 text-sm font-medium backdrop-blur sm:right-4 sm:top-4'
            onClick={(event) => {
              event.stopPropagation();
              onOpenAIBookSearch();
            }}
            aria-label={_('寻书')}
          >
            {_('寻书')}
          </button>
        )}
      </div>
    </section>
  );
};

export default ContinueReadingCard;
