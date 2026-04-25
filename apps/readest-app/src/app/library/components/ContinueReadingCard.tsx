import BookCover from '@/components/BookCover';
import { Book } from '@/types/book';
import { formatAuthors } from '@/utils/book';
import { useTranslation } from '@/hooks/useTranslation';
import ReadingProgress, { getProgressPercentage } from './ReadingProgress';

interface ContinueReadingCardProps {
  book: Book;
  onOpen: () => void;
}

const ContinueReadingCard: React.FC<ContinueReadingCardProps> = ({ book, onOpen }) => {
  const _ = useTranslation();
  const author = formatAuthors(book.author, book.primaryLanguage) || _('Unknown Author');
  const progressPercentage = getProgressPercentage(book) ?? 0;

  return (
    <section className='px-4 pb-3 pt-2 sm:px-6 sm:pt-4' aria-label={_('Continue Reading')}>
      <button
        type='button'
        className='from-base-100 to-base-300/60 border-base-300/70 text-base-content flex w-full items-center gap-4 rounded-3xl border bg-gradient-to-br p-3 text-left shadow-sm transition active:scale-[0.99] sm:gap-5 sm:p-4'
        aria-label={_('Continue reading {{title}}', { title: book.title })}
        onClick={onOpen}
      >
        <div className='bg-base-200 h-24 w-16 shrink-0 overflow-hidden rounded-xl shadow-md sm:h-28 sm:w-20'>
          <BookCover book={book} coverFit='crop' imageClassName='rounded-xl' />
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
      </button>
    </section>
  );
};

export default ContinueReadingCard;
