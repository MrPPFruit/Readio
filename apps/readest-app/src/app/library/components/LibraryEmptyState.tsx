import { useTranslation } from '@/hooks/useTranslation';

interface LibraryEmptyStateProps {
  onImportBooks: () => void;
}

const LibraryEmptyState: React.FC<LibraryEmptyStateProps> = ({ onImportBooks }) => {
  const _ = useTranslation();

  return (
    <div className='hero-content text-base-content w-full px-6 text-center'>
      <div className='bg-base-100/80 border-base-300/70 w-full max-w-md rounded-[2rem] border p-6 shadow-sm backdrop-blur sm:p-8'>
        <div className='text-neutral-content mb-3 text-xs font-medium uppercase tracking-[0.24em]'>
          {_('Readio Library')}
        </div>
        <h1 className='mb-4 text-4xl font-semibold tracking-tight'>
          {_('Start with a local book')}
        </h1>
        <p className='text-neutral-content mb-2 text-sm leading-6'>
          {_('Import EPUB, PDF, TXT, MOBI, AZW3, FB2, CBZ, or CBR files from this device.')}
        </p>
        <p className='text-neutral-content/80 mb-6 text-xs leading-5'>
          {_(
            'EPUB is recommended for the best reading experience. PDF support is basic and may keep the original fixed layout.',
          )}
        </p>
        <button className='btn btn-primary min-h-12 rounded-2xl px-7' onClick={onImportBooks}>
          {_('Import Local Books')}
        </button>
      </div>
    </div>
  );
};

export default LibraryEmptyState;
