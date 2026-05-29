import React, { useEffect, useMemo, useState } from 'react';

import Dialog from '@/components/Dialog';
import type { ReaderAIEntrySource } from '@/types/readerAI';
import {
  ReaderAIComposer,
  ReaderAISpoilerGuard,
  ReaderAISuggestionRail,
} from './ReaderAIPrimitives';

interface ReaderAIAskBoxProps {
  source: ReaderAIEntrySource;
  initialQuestion?: string;
  suggestions?: string[];
  suggestionsLoading?: boolean;
  spoilerProtection?: boolean;
  onSpoilerProtectionChange?: (enabled: boolean) => void;
  onSubmit: (question: string) => void;
  onClose: () => void;
}

const selectionSuggestions = ['解释这段', '这句话是什么意思？', '和前文有什么关系？'];
const controlSuggestions = ['前面发生了什么？', '这个人物是谁？', '总结本章到这里'];

const ReaderAIAskBox: React.FC<ReaderAIAskBoxProps> = ({
  source,
  initialQuestion = '',
  suggestions: generatedSuggestions,
  suggestionsLoading = false,
  spoilerProtection = true,
  onSpoilerProtectionChange,
  onSubmit,
  onClose,
}) => {
  const [question, setQuestion] = useState(initialQuestion);
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

  const handleSubmit = (value = question) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog
      isOpen={true}
      title='问问这本书'
      snapHeight={0.52}
      ariaDescribedBy='reader-ai-ask-description'
      dragHandleLabel='下拉关闭 AI 提问框'
      header={<div className='sr-only'>问问这本书</div>}
      className='modal-open absolute inset-0 z-50'
      bgClassName='bg-base-content/20 backdrop-blur-[1px]'
      boxClassName='border-base-content/10 bg-base-100/95 shadow-2xl backdrop-blur-md eink:border-base-content eink:bg-base-100 eink:shadow-none eink:backdrop-blur-0 sm:max-w-md'
      contentClassName='!my-0 !px-2 !pb-2 !pt-0'
      onClose={onClose}
    >
      <section
        className='text-base-content flex min-h-full flex-col p-2'
        aria-labelledby='reader-ai-ask-title'
        aria-describedby='reader-ai-ask-description'
      >
        <div className='mb-1.5 flex items-start justify-between gap-2'>
          <div className='min-w-0 flex-1'>
            <p className='text-primary/80 mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide'>
              Reader AI
            </p>
            <h2 id='reader-ai-ask-title' className='font-sans text-lg font-semibold leading-tight'>
              问问这本书
            </h2>
          </div>
          <div className='flex shrink-0 items-center gap-1'>
            <ReaderAISpoilerGuard
              enabled={spoilerProtection}
              onChange={(enabled) => onSpoilerProtectionChange?.(enabled)}
              variant='badge'
            />
          </div>
        </div>
        <p
          id='reader-ai-ask-description'
          className='text-base-content/60 mb-2 w-full font-sans text-xs leading-5'
        >
          防剧透开启时，只根据你已读到的位置回答；关闭后可能包含未读内容。
        </p>

        <div className='mb-2'>
          {suggestionsLoading && (
            <div
              className='text-base-content/55 mb-2 flex items-center gap-2 px-1 text-xs leading-5'
              role='status'
              aria-live='polite'
            >
              <span>正在猜你想问什么</span>
              <span className='flex gap-1' aria-hidden='true'>
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    data-testid='reader-ai-suggestion-loading-dot'
                    className='bg-primary/60 h-1.5 w-1.5 animate-pulse rounded-full motion-reduce:animate-none'
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                ))}
              </span>
            </div>
          )}
          <ReaderAISuggestionRail
            suggestions={suggestions}
            selectedValue={question}
            ariaLabel='建议问题'
            layout='stack'
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
          className='mt-auto'
        />
      </section>
    </Dialog>
  );
};

export default ReaderAIAskBox;
