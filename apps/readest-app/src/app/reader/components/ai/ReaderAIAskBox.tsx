import clsx from 'clsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MdClose } from 'react-icons/md';

import type { Insets } from '@/types/misc';
import type { ReaderAIEntrySource } from '@/types/readerAI';
import {
  ReaderAIComposer,
  ReaderAISpoilerGuard,
  ReaderAISuggestionRail,
} from './ReaderAIPrimitives';

interface ReaderAIAskBoxProps {
  source: ReaderAIEntrySource;
  gridInsets?: Insets;
  initialQuestion?: string;
  suggestions?: string[];
  spoilerProtection?: boolean;
  onSpoilerProtectionChange?: (enabled: boolean) => void;
  onSubmit: (question: string) => void;
  onClose: () => void;
}

const selectionSuggestions = ['解释这段', '这句话是什么意思？', '和前文有什么关系？'];
const controlSuggestions = ['前面发生了什么？', '这个人物是谁？', '总结本章到这里'];

const ReaderAIAskBox: React.FC<ReaderAIAskBoxProps> = ({
  source,
  gridInsets,
  initialQuestion = '',
  suggestions: generatedSuggestions,
  spoilerProtection = true,
  onSpoilerProtectionChange,
  onSubmit,
  onClose,
}) => {
  const [question, setQuestion] = useState(initialQuestion);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const suggestions = useMemo(
    () =>
      generatedSuggestions?.length
        ? generatedSuggestions
        : source === 'selection'
          ? selectionSuggestions
          : controlSuggestions,
    [generatedSuggestions, source],
  );

  useEffect(() => {
    setQuestion(initialQuestion);
  }, [initialQuestion]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => previousFocus?.focus({ preventScroll: true });
  }, []);

  const handleSubmit = (value = question) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;

    const focusableElements = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) return;

    if (!dialogRef.current.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? lastElement : firstElement).focus();
    } else if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      className='bg-base-content/20 absolute inset-0 z-50 flex items-end backdrop-blur-[1px]'
      style={{
        paddingRight: 12 + (gridInsets?.right ?? 0),
        paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${8 + (gridInsets?.bottom ?? 0) * 0.33}px)`,
        paddingLeft: 12 + (gridInsets?.left ?? 0),
      }}
      onClick={handleBackdropClick}
    >
      <section
        ref={dialogRef}
        className={clsx(
          'border-base-content/10 bg-base-100/95 text-base-content w-full rounded-[1.5rem] border p-4 shadow-2xl backdrop-blur-md',
          'eink:border-base-content eink:bg-base-100 eink:shadow-none eink:backdrop-blur-0',
        )}
        role='dialog'
        aria-modal='true'
        aria-labelledby='reader-ai-ask-title'
        aria-describedby='reader-ai-ask-description'
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <div className='bg-base-content/20 mx-auto mb-3 h-1 w-10 rounded-full' aria-hidden='true' />
        <div className='mb-4 flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-primary/80 mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide'>
              Reader AI
            </p>
            <h2 id='reader-ai-ask-title' className='font-sans text-lg font-semibold leading-tight'>
              问问这本书
            </h2>
            <p
              id='reader-ai-ask-description'
              className='text-base-content/60 mt-1 font-sans text-xs leading-5'
            >
              默认只根据你读到的位置回答。
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type='button'
            onClick={onClose}
            className='btn btn-ghost btn-circle text-base-content/70 h-11 min-h-11 w-11 shrink-0'
            aria-label='关闭 AI 提问框'
          >
            <MdClose size={20} aria-hidden='true' />
          </button>
        </div>

        <div className='mb-4'>
          <ReaderAISpoilerGuard
            enabled={spoilerProtection}
            onChange={(enabled) => onSpoilerProtectionChange?.(enabled)}
            variant='row'
          />
        </div>

        <div className='mb-3'>
          <ReaderAISuggestionRail
            suggestions={suggestions}
            selectedValue={question}
            ariaLabel='建议问题'
            onSelect={setQuestion}
          />
        </div>

        <ReaderAIComposer
          value={question}
          onChange={setQuestion}
          onSubmit={handleSubmit}
          placeholder='问一个关于当前内容的问题'
          inputLabel='输入你的问题'
          submitLabel='提问'
        />
      </section>
    </div>
  );
};

export default ReaderAIAskBox;
