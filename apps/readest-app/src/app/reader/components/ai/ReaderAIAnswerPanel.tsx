import React, { useEffect, useRef, useState } from 'react';
import { MdClose } from 'react-icons/md';

import type { Insets } from '@/types/misc';
import type { ReaderAIMessage } from '@/types/readerAI';
import {
  ReaderAIComposer,
  ReaderAISpoilerGuard,
  ReaderAISuggestionRail,
} from './ReaderAIPrimitives';

interface ReaderAIAnswerPanelProps {
  messages: ReaderAIMessage[];
  gridInsets?: Insets;
  loading?: boolean;
  error?: string;
  spoilerProtection?: boolean;
  onSpoilerProtectionChange?: (enabled: boolean) => void;
  onSubmit: (question: string) => void;
  onClose: () => void;
}

const followUpSuggestions = ['再解释简单一点', '和前文有什么关系？', '总结到这里'];

const ReaderAIAnswerPanel: React.FC<ReaderAIAnswerPanelProps> = ({
  messages,
  gridInsets,
  loading = false,
  error,
  spoilerProtection = true,
  onSpoilerProtectionChange,
  onSubmit,
  onClose,
}) => {
  const [question, setQuestion] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => previousFocus?.focus({ preventScroll: true });
  }, []);

  const handleSubmit = (value = question) => {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setQuestion('');
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

  const latestQuestion = [...messages].reverse().find((message) => message.role === 'user');
  const assistantMessages = messages.filter((message) => message.role === 'assistant');

  return (
    <section
      ref={dialogRef}
      className='bg-base-100 text-base-content absolute inset-0 z-50 flex flex-col font-sans'
      role='dialog'
      aria-modal='true'
      aria-labelledby='reader-ai-answer-title'
      aria-describedby='reader-ai-answer-description'
      tabIndex={-1}
      onKeyDown={handleDialogKeyDown}
    >
      <header
        className='border-base-content/10 bg-base-100/95 eink:bg-base-100 eink:backdrop-blur-0 border-b p-4 pb-3 backdrop-blur-md'
        style={{
          paddingTop: 16 + (gridInsets?.top ?? 0),
          paddingRight: 16 + (gridInsets?.right ?? 0),
          paddingLeft: 16 + (gridInsets?.left ?? 0),
        }}
      >
        <div className='bg-base-content/20 mx-auto mb-3 h-1 w-10 rounded-full' aria-hidden='true' />
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <p className='text-primary/80 mb-1 text-[11px] font-semibold uppercase tracking-wide'>
              Reader AI
            </p>
            <h2 id='reader-ai-answer-title' className='text-lg font-semibold leading-tight'>
              AI 阅读助手
            </h2>
            <p
              id='reader-ai-answer-description'
              className='text-base-content/60 mt-1 text-xs leading-5'
            >
              围绕当前位置解释、总结和追问。
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type='button'
            onClick={onClose}
            className='btn btn-ghost btn-circle text-base-content/70 h-11 min-h-11 w-11 shrink-0'
            aria-label='关闭 AI 阅读助手'
          >
            <MdClose size={20} aria-hidden='true' />
          </button>
        </div>
        <div className='mt-3'>
          <ReaderAISpoilerGuard
            enabled={spoilerProtection}
            onChange={(enabled) => onSpoilerProtectionChange?.(enabled)}
            variant='badge'
          />
        </div>
      </header>

      <div
        className='bg-base-200/30 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-5'
        style={{
          paddingRight: 16 + (gridInsets?.right ?? 0),
          paddingLeft: 16 + (gridInsets?.left ?? 0),
        }}
      >
        {latestQuestion && (
          <section className='border-primary/20 bg-primary/10 text-base-content rounded-2xl border px-4 py-3'>
            <div className='text-primary/80 mb-1 text-[11px] font-semibold uppercase tracking-wide'>
              你的问题
            </div>
            <p className='text-sm leading-6'>{latestQuestion.content}</p>
          </section>
        )}

        <div className='space-y-3'>
          {assistantMessages.map((message) => (
            <article
              key={message.id}
              className='border-base-content/10 bg-base-100 text-base-content eink:shadow-none rounded-[1.25rem] border px-4 py-4 shadow-sm'
            >
              <div className='text-base-content/55 mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide'>
                <span className='bg-primary h-2 w-2 rounded-full' aria-hidden='true' />
                AI 回答
              </div>
              <div className='whitespace-pre-wrap text-sm leading-7'>{message.content}</div>
            </article>
          ))}
        </div>

        {loading && (
          <div
            className='border-base-content/10 bg-base-100 text-base-content/60 rounded-2xl border px-4 py-3 text-sm'
            role='status'
          >
            正在基于当前位置生成回答…
          </div>
        )}
        {error && (
          <div
            className='border-error/30 bg-base-100 text-error rounded-2xl border px-4 py-3 text-sm'
            role='alert'
          >
            {error}
          </div>
        )}

        {!loading && (
          <ReaderAISuggestionRail
            suggestions={followUpSuggestions}
            selectedValue={question}
            ariaLabel='追问建议'
            onSelect={setQuestion}
          />
        )}
      </div>

      <footer
        className='border-base-content/10 bg-base-100/95 eink:bg-base-100 eink:backdrop-blur-0 border-t px-3 py-3 backdrop-blur-md'
        style={{
          paddingRight: 12 + (gridInsets?.right ?? 0),
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${12 + (gridInsets?.bottom ?? 0) * 0.33}px)`,
          paddingLeft: 12 + (gridInsets?.left ?? 0),
        }}
      >
        <ReaderAIComposer
          value={question}
          onChange={setQuestion}
          onSubmit={handleSubmit}
          placeholder={loading ? '正在生成回答…' : '继续追问'}
          inputLabel='继续追问'
          submitLabel='发送'
          disabled={loading}
          loading={loading}
        />
      </footer>
    </section>
  );
};

export default ReaderAIAnswerPanel;
