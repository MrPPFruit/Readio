import DOMPurify from 'dompurify';
import { marked } from 'marked';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MdClose } from 'react-icons/md';

import type { EmbeddingProgress } from '@/services/ai/types';
import type { Insets } from '@/types/misc';
import type {
  ReaderAIGenerationStatus as ReaderAIGenerationStatusValue,
  ReaderAIMessage,
  ReaderAISource,
} from '@/types/readerAI';
import {
  ReaderAIComposer,
  ReaderAIGenerationStatus,
  ReaderAISpoilerGuard,
  ReaderAISuggestionRail,
} from './ReaderAIPrimitives';

interface ReaderAIAnswerPanelProps {
  messages: ReaderAIMessage[];
  gridInsets?: Insets;
  loading?: boolean;
  error?: string;
  setupAction?: {
    label: string;
    onClick: () => void;
  };
  spoilerProtection?: boolean;
  suggestions?: string[];
  suggestionsLoading?: boolean;
  generationStatus?: ReaderAIGenerationStatusValue;
  indexingProgress?: EmbeddingProgress;
  onSourceClick?: (source: ReaderAISource) => void;
  onSpoilerProtectionChange?: (enabled: boolean) => void;
  onSubmit: (question: string) => void;
  onClose: () => void;
}

interface ReaderAIMessageContentProps {
  content: string;
  role: ReaderAIMessage['role'];
}

const ReaderAIMessageContent: React.FC<ReaderAIMessageContentProps> = ({ content, role }) => {
  const html = useMemo(() => {
    const parsed = marked.parse(content, { breaks: true, async: false });
    return DOMPurify.sanitize(parsed);
  }, [content]);

  return (
    <div
      className={
        role === 'assistant'
          ? 'prose prose-sm prose-headings:text-base-content prose-p:text-base-content prose-strong:text-base-content prose-li:text-base-content prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-p:my-2 max-w-none text-sm leading-7 [&_*:first-child]:mt-0 [&_*:last-child]:mb-0'
          : 'whitespace-pre-wrap text-sm leading-7'
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const ReaderAIAnswerPanel: React.FC<ReaderAIAnswerPanelProps> = ({
  messages,
  gridInsets,
  loading = false,
  error,
  setupAction,
  spoilerProtection = true,
  suggestions = [],
  suggestionsLoading = false,
  generationStatus = 'idle',
  indexingProgress,
  onSourceClick,
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

  const formatSourceLabel = (source: ReaderAISource) => {
    const pageLabel = source.pageNumber
      ? `${source.confidence === 'approximate' ? '约第' : '第'} ${source.pageNumber} 页`
      : source.confidence === 'approximate'
        ? '约略位置'
        : '原文位置';
    return `${pageLabel} · ${source.chapterTitle}`;
  };

  const initialQuestion = messages.find((message) => message.role === 'user');
  const conversationMessages = initialQuestion
    ? messages.filter((message) => message.id !== initialQuestion.id)
    : messages;
  const indexingPercent = indexingProgress?.total
    ? Math.min(100, Math.round((indexingProgress.current / indexingProgress.total) * 100))
    : undefined;

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
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0 flex-1'>
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
          <div className='flex shrink-0 items-center gap-1'>
            <ReaderAISpoilerGuard
              enabled={spoilerProtection}
              onChange={(enabled) => onSpoilerProtectionChange?.(enabled)}
              variant='badge'
            />
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
        </div>
      </header>

      <div
        className='bg-base-200/30 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-5'
        style={{
          paddingRight: 16 + (gridInsets?.right ?? 0),
          paddingLeft: 16 + (gridInsets?.left ?? 0),
        }}
      >
        {initialQuestion && (
          <section
            className='border-primary/20 bg-primary/10 text-base-content rounded-2xl border px-4 py-3'
            aria-label='原始问题'
          >
            {initialQuestion.quotedText && (
              <div className='mb-3'>
                <div className='text-base-content/55 mb-1 text-[11px] font-semibold tracking-wide'>
                  选中的原文
                </div>
                <blockquote className='border-base-content/15 text-base-content/65 border-l-2 pl-3 text-xs leading-5'>
                  「{initialQuestion.quotedText}」
                </blockquote>
              </div>
            )}
            <div className='text-primary/80 mb-1 text-[11px] font-semibold uppercase tracking-wide'>
              你的问题
            </div>
            <p className='text-sm leading-6'>{initialQuestion.content}</p>
          </section>
        )}

        {indexingProgress && (
          <div
            className='border-base-content/10 bg-base-100 text-base-content rounded-2xl border px-4 py-3 text-sm'
            role='status'
            aria-live='polite'
          >
            <div className='mb-2 flex items-center justify-between gap-3'>
              <span>正在结构化本书内容，完成后会继续回答…</span>
              {indexingPercent !== undefined && (
                <span className='text-base-content/60 text-xs'>{indexingPercent}%</span>
              )}
            </div>
            <div
              className='bg-base-content/10 h-2 overflow-hidden rounded-full'
              role='progressbar'
              aria-label='结构化进度'
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={indexingPercent}
            >
              <div
                className='bg-primary h-full rounded-full transition-[width]'
                style={{ width: `${indexingPercent ?? 20}%` }}
              />
            </div>
          </div>
        )}

        <section className='space-y-3' aria-label='AI 对话历史'>
          {conversationMessages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === 'user'
                  ? 'border-primary/15 bg-primary/5 text-base-content rounded-[1.25rem] border px-4 py-3'
                  : 'border-base-content/10 bg-base-100 text-base-content eink:shadow-none rounded-[1.25rem] border px-4 py-4 shadow-sm'
              }
            >
              <div className='text-base-content/55 mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide'>
                <span className='bg-primary h-2 w-2 rounded-full' aria-hidden='true' />
                {message.role === 'user' ? '追问' : 'AI 回答'}
              </div>
              {message.role === 'assistant' && loading && !message.content ? (
                <ReaderAIGenerationStatus status={generationStatus} />
              ) : (
                <ReaderAIMessageContent content={message.content} role={message.role} />
              )}
              {message.role === 'assistant' && message.sources?.length ? (
                <section
                  className='border-base-content/10 mt-3 space-y-2 border-t pt-3'
                  aria-label='参考来源'
                >
                  {message.sources.map((source) => {
                    const label = formatSourceLabel(source);
                    return (
                      <button
                        key={source.id}
                        type='button'
                        className='border-base-content/10 bg-base-200/60 text-base-content/75 w-full rounded-2xl border px-3 py-2 text-left text-xs leading-5'
                        onClick={() => onSourceClick?.(source)}
                        aria-label={`跳转到来源：${label}`}
                      >
                        <span className='block font-medium'>{label}</span>
                        {source.snippet && (
                          <span className='text-base-content/55 mt-1 block'>
                            「{source.snippet}」
                          </span>
                        )}
                      </button>
                    );
                  })}
                </section>
              ) : null}
            </article>
          ))}
        </section>

        {loading &&
          !conversationMessages.some(
            (message) => message.role === 'assistant' && !message.content,
          ) && (
            <div className='border-base-content/10 bg-base-100 rounded-2xl border px-4 py-3'>
              <ReaderAIGenerationStatus status={generationStatus} />
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
        {setupAction && !loading && (
          <button
            type='button'
            className='btn btn-outline border-base-content/15 text-base-content hover:border-primary/40 hover:bg-base-200 h-11 min-h-11 rounded-2xl px-4'
            onClick={setupAction.onClick}
          >
            {setupAction.label}
          </button>
        )}

        {!loading && suggestionsLoading && (
          <div className='text-base-content/55 text-xs leading-5' role='status' aria-live='polite'>
            正在生成追问建议…
          </div>
        )}
        {!loading && !suggestionsLoading && suggestions.length > 0 && (
          <ReaderAISuggestionRail
            suggestions={suggestions}
            selectedValue={question}
            ariaLabel='追问建议'
            layout='stack'
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
