import DOMPurify from 'dompurify';
import { marked } from 'marked';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MdClose } from 'react-icons/md';

import Dialog from '@/components/Dialog';
import { useEnv } from '@/context/EnvContext';
import type { EmbeddingProgress } from '@/services/ai/types';
import { useThemeStore } from '@/store/themeStore';
import type { Insets } from '@/types/misc';
import type {
  ReaderAIGenerationStatus as ReaderAIGenerationStatusValue,
  ReaderAIMessage,
  ReaderAISource,
  ReaderAISourceHighlightSpan,
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
  onSpoilerProtectionChange?: (enabled: boolean) => void;
  onSubmit: (question: string) => void;
  onClose: () => void;
}

interface ReaderAIMessageContentProps {
  content: string;
  role: ReaderAIMessage['role'];
  sources?: ReaderAISource[];
  citationMap?: Map<number, number>;
  onCitationClick?: (index: number, trigger?: HTMLElement) => void;
}

const getOrderedSources = (sources: ReaderAISource[] = []) => sources;

const getCitedSourceIndexes = (content: string, sourceCount: number): number[] => {
  const indexes: number[] = [];
  const seen = new Set<number>();
  for (const match of content.matchAll(/\[(\d+)\]/g)) {
    const citationIndex = Number(match[1]);
    const sourceIndex = citationIndex - 1;
    if (sourceIndex < 0 || sourceIndex >= sourceCount || seen.has(sourceIndex)) continue;
    seen.add(sourceIndex);
    indexes.push(sourceIndex);
  }
  return indexes;
};

const getSourcePreviewText = (source: ReaderAISource) =>
  (source.previewText || source.contextText || source.snippet || '').trim();

const getSourcePreviewRange = (
  source: ReaderAISource,
): { start: number; end: number } | undefined => {
  const previewText = getSourcePreviewText(source);
  if (!previewText || source.previewStartOffset === undefined) return undefined;
  return { start: source.previewStartOffset, end: source.previewStartOffset + previewText.length };
};

const areSameSectionSources = (left: ReaderAISource, right: ReaderAISource) =>
  left.sectionIndex === right.sectionIndex && left.chapterTitle === right.chapterTitle;

const doSourcePreviewRangesOverlapWithMatchingText = (
  leftText: string,
  leftRange: { start: number; end: number },
  rightText: string,
  rightRange: { start: number; end: number },
) => {
  const overlapStart = Math.max(leftRange.start, rightRange.start);
  const overlapEnd = Math.min(leftRange.end, rightRange.end);
  if (overlapStart >= overlapEnd) return false;

  const leftOverlap = leftText.slice(overlapStart - leftRange.start, overlapEnd - leftRange.start);
  const rightOverlap = rightText.slice(
    overlapStart - rightRange.start,
    overlapEnd - rightRange.start,
  );
  return leftOverlap === rightOverlap;
};

const areContinuousSourcePreviews = (left: ReaderAISource, right: ReaderAISource) => {
  if (!areSameSectionSources(left, right)) return false;
  const leftText = getSourcePreviewText(left);
  const rightText = getSourcePreviewText(right);
  if (leftText === rightText) return true;
  const leftRange = getSourcePreviewRange(left);
  const rightRange = getSourcePreviewRange(right);
  if (!leftRange || !rightRange) return false;
  return doSourcePreviewRangesOverlapWithMatchingText(leftText, leftRange, rightText, rightRange);
};

const buildCitationDisplayMap = (
  content: string,
  sources: ReaderAISource[] = [],
): Map<number, number> => {
  const citationMap = new Map<number, number>();
  let displayCount = 0;
  let previousSourceIndex: number | undefined;
  let previousCitationEnd = 0;

  for (const match of content.matchAll(/\[(\d+)\]/g)) {
    if (match.index === undefined) continue;
    const sourceIndex = Number(match[1]) - 1;
    const source = sources[sourceIndex];
    if (sourceIndex < 0 || sourceIndex >= sources.length || !source) continue;

    if (citationMap.has(sourceIndex)) {
      previousSourceIndex = sourceIndex;
      previousCitationEnd = match.index + match[0].length;
      continue;
    }

    const previousSource =
      previousSourceIndex === undefined ? undefined : sources[previousSourceIndex];
    const adjacentToPreviousCitation = !/\S/.test(content.slice(previousCitationEnd, match.index));
    const previousDisplayIndex =
      previousSourceIndex === undefined ? undefined : citationMap.get(previousSourceIndex);

    if (
      previousSource &&
      adjacentToPreviousCitation &&
      previousDisplayIndex !== undefined &&
      areContinuousSourcePreviews(previousSource, source)
    ) {
      citationMap.set(sourceIndex, previousDisplayIndex);
    } else {
      citationMap.set(sourceIndex, displayCount);
      displayCount += 1;
    }

    previousSourceIndex = sourceIndex;
    previousCitationEnd = match.index + match[0].length;
  }
  return citationMap;
};

const mergeHighlightSpans = (sources: ReaderAISource[], mergedStartOffset?: number) =>
  sources
    .flatMap((source) => {
      const sourcePreviewStartOffset = source.previewStartOffset;
      const offset =
        mergedStartOffset !== undefined && sourcePreviewStartOffset !== undefined
          ? sourcePreviewStartOffset - mergedStartOffset
          : 0;
      return (source.highlightSpans ?? []).map((span) => ({
        ...span,
        start: span.start + offset,
        end: span.end + offset,
      }));
    })
    .filter(
      (span, index, spans) =>
        spans.findIndex(
          (candidate) =>
            candidate.start === span.start &&
            candidate.end === span.end &&
            candidate.quote === span.quote &&
            candidate.source === span.source,
        ) === index,
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);

const mergeOffsetAwareSourcePreviews = (sources: ReaderAISource[]) => {
  const previewParts = sources
    .map((source) => {
      const text = getSourcePreviewText(source);
      const range = getSourcePreviewRange(source);
      return text && range ? { source, text, range } : undefined;
    })
    .filter(
      (
        part,
      ): part is { source: ReaderAISource; text: string; range: { start: number; end: number } } =>
        Boolean(part),
    )
    .sort(
      (left, right) => left.range.start - right.range.start || left.range.end - right.range.end,
    );

  const [firstPart] = previewParts;
  if (!firstPart || previewParts.length !== sources.length) return undefined;

  let mergedText = firstPart.text;
  let mergedStart = firstPart.range.start;
  let mergedEnd = firstPart.range.end;

  for (const part of previewParts.slice(1)) {
    if (part.range.start > mergedEnd) return undefined;
    const overlapLength = Math.max(0, mergedEnd - part.range.start);
    if (overlapLength < part.text.length) mergedText += part.text.slice(overlapLength);
    mergedStart = Math.min(mergedStart, part.range.start);
    mergedEnd = Math.max(mergedEnd, part.range.end);
  }

  const highlightSpans = mergeHighlightSpans(sources, mergedStart).filter(
    (span) =>
      span.start >= 0 &&
      span.end > span.start &&
      span.end <= mergedText.length &&
      mergedText.slice(span.start, span.end) === span.quote,
  );

  return {
    text: mergedText,
    previewStartOffset: mergedStart,
    highlightSpans,
  };
};

const mergeSourceGroup = (sources: ReaderAISource[]): ReaderAISource => {
  const [firstSource] = sources;
  if (!firstSource || sources.length === 1) return firstSource!;

  const mergedPreview = mergeOffsetAwareSourcePreviews(sources);
  const highlightSpans = mergedPreview?.highlightSpans ?? mergeHighlightSpans(sources);

  return {
    ...firstSource,
    id: sources.map((source) => source.id).join('|'),
    ...(mergedPreview
      ? {
          contextText: mergedPreview.text,
          previewText: mergedPreview.text,
          previewStartOffset: mergedPreview.previewStartOffset,
        }
      : {}),
    ...(highlightSpans.length ? { highlightSpans } : {}),
    ...(sources.some((source) => source.atSpoilerBoundary) ? { atSpoilerBoundary: true } : {}),
  };
};

const getDisplaySources = (
  content: string,
  sources: ReaderAISource[] = [],
  citationMap = buildCitationDisplayMap(content, sources),
) => {
  const groups: Array<{
    source: ReaderAISource;
    sourceIndexes: number[];
    displayIndex: number;
  }> = [];

  getCitedSourceIndexes(content, sources.length).forEach((sourceIndex) => {
    const displayIndex = citationMap.get(sourceIndex);
    const source = sources[sourceIndex];
    if (displayIndex === undefined || !source) return;
    const existingGroup = groups.find((group) => group.displayIndex === displayIndex);
    if (existingGroup) {
      existingGroup.sourceIndexes.push(sourceIndex);
      existingGroup.source = mergeSourceGroup(
        existingGroup.sourceIndexes.map((index) => sources[index]!),
      );
      return;
    }
    groups.push({ source, sourceIndexes: [sourceIndex], displayIndex });
  });

  return groups;
};

const splitPreviewParagraphs = (text: string) =>
  text
    .split(/\n{1,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

const normalizePreviewText = (text: string) => text.replace(/\s+/g, ' ').trim();

const getSourceHighlightTerms = (source: ReaderAISource) =>
  splitPreviewParagraphs(source.snippet || '')
    .map(normalizePreviewText)
    .filter(Boolean);

const isSourcePreviewParagraphHighlighted = (paragraph: string, source: ReaderAISource) => {
  const normalizedParagraph = normalizePreviewText(paragraph);
  if (!normalizedParagraph) return false;
  return getSourceHighlightTerms(source).some(
    (term) => normalizedParagraph.includes(term) || term.includes(normalizedParagraph),
  );
};

const getValidHighlightSpans = (
  text: string,
  spans: ReaderAISourceHighlightSpan[] | undefined,
): ReaderAISourceHighlightSpan[] =>
  (spans ?? [])
    .filter(
      (span) =>
        Number.isInteger(span.start) &&
        Number.isInteger(span.end) &&
        span.start >= 0 &&
        span.end > span.start &&
        span.end <= text.length &&
        text.slice(span.start, span.end) === span.quote,
    )
    .sort((a, b) => a.start - b.start);

const citationButtonClassName =
  'border-primary/25 bg-primary/10 text-primary mx-0.5 inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border px-2 align-baseline text-xs font-semibold leading-none';

const voidHtmlTags = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function renderTextWithCitations(
  text: string,
  keyPrefix: string,
  sourceCount: number,
  citationMap?: Map<number, number>,
  onCitationClick?: (index: number, trigger?: HTMLElement) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let lastRenderedDisplayIndex: number | undefined;
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    if (match.index === undefined) continue;
    const textBeforeCitation = text.slice(lastIndex, match.index);
    if (/\S/.test(textBeforeCitation)) lastRenderedDisplayIndex = undefined;
    const citationIndex = Number(match[1]);
    const sourceIndex = citationIndex - 1;
    const displayIndex = citationMap?.get(sourceIndex);
    if (citationIndex >= 1 && citationIndex <= sourceCount && displayIndex !== undefined) {
      if (displayIndex !== lastRenderedDisplayIndex) {
        if (textBeforeCitation) nodes.push(textBeforeCitation);
        nodes.push(
          <button
            key={`${keyPrefix}-citation-${match.index}`}
            type='button'
            className={citationButtonClassName}
            onClick={(event) => onCitationClick?.(sourceIndex, event.currentTarget)}
            aria-label={`查看引用 ${displayIndex + 1}`}
          >
            [{displayIndex + 1}]
          </button>,
        );
        lastRenderedDisplayIndex = displayIndex;
      }
    } else {
      if (textBeforeCitation) nodes.push(textBeforeCitation);
      nodes.push(match[0]);
      lastRenderedDisplayIndex = undefined;
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderHtmlNode(
  node: ChildNode,
  key: string,
  sourceCount: number,
  citationsDisabled: boolean,
  citationMap?: Map<number, number>,
  onCitationClick?: (index: number, trigger?: HTMLElement) => void,
): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    return citationsDisabled
      ? text
      : renderTextWithCitations(text, key, sourceCount, citationMap, onCitationClick);
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();
  const nextCitationsDisabled =
    citationsDisabled || ['a', 'code', 'kbd', 'pre', 'samp'].includes(tagName);
  const props: Record<string, string> = { key };
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.startsWith('on') || attribute.name === 'style') continue;
    props[attribute.name === 'class' ? 'className' : attribute.name] = attribute.value;
  }
  if (voidHtmlTags.has(tagName)) return React.createElement(tagName, props);

  const children = Array.from(element.childNodes).map((child, index) =>
    renderHtmlNode(
      child,
      `${key}-${index}`,
      sourceCount,
      nextCitationsDisabled,
      citationMap,
      onCitationClick,
    ),
  );
  return React.createElement(tagName, props, children);
}

function renderHtmlWithCitations(
  html: string,
  sourceCount: number,
  citationMap?: Map<number, number>,
  onCitationClick?: (index: number, trigger?: HTMLElement) => void,
): React.ReactNode[] {
  const template = document.createElement('template');
  template.innerHTML = html;
  return Array.from(template.content.childNodes).map((node, index) =>
    renderHtmlNode(node, `html-${index}`, sourceCount, false, citationMap, onCitationClick),
  );
}

const ReaderAIMessageContent: React.FC<ReaderAIMessageContentProps> = ({
  content,
  role,
  sources = [],
  citationMap,
  onCitationClick,
}) => {
  const html = useMemo(() => {
    const parsed = marked.parse(content, { breaks: true, async: false });
    return DOMPurify.sanitize(parsed);
  }, [content]);

  const sourceCount = sources.length;
  const contentNodes = useMemo(() => {
    if (role !== 'assistant' || sourceCount === 0) return null;
    return renderHtmlWithCitations(html, sourceCount, citationMap, onCitationClick);
  }, [html, role, sourceCount, citationMap, onCitationClick]);
  const className =
    role === 'assistant'
      ? 'prose prose-sm prose-headings:text-base-content prose-p:text-base-content prose-strong:text-base-content prose-li:text-base-content prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-p:my-2 max-w-none text-sm leading-7 [&_*:first-child]:mt-0 [&_*:last-child]:mb-0'
      : 'whitespace-pre-wrap text-sm leading-7';

  if (!contentNodes) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }

  return <div className={className}>{contentNodes}</div>;
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
  onSpoilerProtectionChange,
  onSubmit,
  onClose,
}) => {
  const { appService } = useEnv();
  const { systemUIVisible, statusBarHeight } = useThemeStore();
  const [question, setQuestion] = useState('');
  const [activeSource, setActiveSource] = useState<{
    source: ReaderAISource;
    displayIndex: number;
  }>();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sourceTriggerRef = useRef<HTMLElement | null>(null);
  const firstHighlightRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!activeSource || typeof firstHighlightRef.current?.scrollIntoView !== 'function') return;
    firstHighlightRef.current.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [activeSource]);

  const closeSourcePreview = () => {
    setActiveSource(undefined);
    sourceTriggerRef.current?.focus({ preventScroll: true });
    sourceTriggerRef.current = null;
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      if (activeSource) {
        closeSourcePreview();
      } else {
        onClose();
      }
      return;
    }
    const focusRoot = dialogRef.current;
    if (event.key !== 'Tab' || !focusRoot) return;

    const sourcePreviewSelector = '#reader-ai-source-preview';
    const focusableElements = Array.from(
      focusRoot.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) =>
      activeSource
        ? !!element.closest(sourcePreviewSelector)
        : !element.closest(sourcePreviewSelector),
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) return;

    const activeElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const isActiveInsideFocusScope = activeSource
      ? !!activeElement?.closest(sourcePreviewSelector)
      : !!activeElement && focusRoot.contains(activeElement);

    if (!isActiveInsideFocusScope) {
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

  const openSource = (source: ReaderAISource, displayIndex: number, trigger?: HTMLElement) => {
    sourceTriggerRef.current = trigger ?? null;
    setActiveSource({ source, displayIndex });
  };

  const initialQuestion = messages.find((message) => message.role === 'user');
  const conversationMessages = initialQuestion
    ? messages.filter((message) => message.id !== initialQuestion.id)
    : messages;
  const topSystemInset = appService?.hasSafeAreaInset
    ? Math.max(gridInsets?.top ?? 0, systemUIVisible ? statusBarHeight : 0)
    : 0;
  const indexingPercent = indexingProgress?.total
    ? Math.min(100, Math.round((indexingProgress.current / indexingProgress.total) * 100))
    : undefined;
  const pendingAssistantMessageId = loading
    ? [...conversationMessages].reverse().find((message) => message.role === 'assistant')?.id
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
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleDialogKeyDown}
    >
      <header
        className='border-base-content/10 bg-base-100/95 eink:bg-base-100 eink:backdrop-blur-0 border-b p-4 pb-3 backdrop-blur-md'
        role='banner'
        aria-label='AI 阅读助手顶部栏'
        style={{
          paddingTop: 16 + topSystemInset,
          paddingRight: 16 + (gridInsets?.right ?? 0),
          paddingLeft: 16 + (gridInsets?.left ?? 0),
        }}
      >
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
          <div
            className='flex shrink-0 items-center gap-1'
            data-testid='reader-ai-answer-header-actions'
          >
            <ReaderAISpoilerGuard
              enabled={spoilerProtection}
              onChange={(enabled) => onSpoilerProtectionChange?.(enabled)}
              variant='badge'
            />
            <button
              ref={closeButtonRef}
              type='button'
              className='btn btn-ghost btn-circle text-base-content/70 hover:bg-base-200 h-11 min-h-11 w-11'
              onClick={onClose}
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
          {conversationMessages.map((message) => {
            const isPendingAssistantMessage = message.id === pendingAssistantMessageId;
            const orderedSources = isPendingAssistantMessage
              ? []
              : getOrderedSources(message.sources);
            const citationMap = buildCitationDisplayMap(message.content, orderedSources);
            const displaySources = getDisplaySources(message.content, orderedSources, citationMap);
            return (
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
                  <ReaderAIMessageContent
                    content={message.content}
                    role={message.role}
                    sources={orderedSources}
                    citationMap={citationMap}
                    onCitationClick={(index, trigger) => {
                      const displayIndex = citationMap.get(index);
                      const source = displaySources.find((displaySource) =>
                        displaySource.sourceIndexes.includes(index),
                      )?.source;
                      if (source && displayIndex !== undefined) {
                        openSource(source, displayIndex, trigger);
                      }
                    }}
                  />
                )}
                {message.role === 'assistant' && displaySources.length ? (
                  <section
                    className='border-base-content/10 mt-3 border-t pt-3'
                    aria-label='引用来源'
                  >
                    <div className='text-base-content/55 mb-2 text-[11px] font-semibold tracking-wide'>
                      引用
                    </div>
                    <div className='space-y-1.5'>
                      {displaySources.map(({ source, displayIndex }) => (
                        <button
                          key={source.id}
                          type='button'
                          className='hover:border-primary/30 hover:bg-primary/5 focus-visible:ring-primary/30 border-base-content/10 bg-base-200/45 text-base-content/75 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs leading-5 transition-colors focus:outline-none focus-visible:ring-2'
                          onClick={(event) => openSource(source, displayIndex, event.currentTarget)}
                          aria-label={`查看引用 ${displayIndex + 1}：${source.chapterTitle}`}
                        >
                          <span className='bg-primary/10 text-primary border-primary/20 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold'>
                            [{displayIndex + 1}]
                          </span>
                          <span className='min-w-0 flex-1 font-medium'>{source.chapterTitle}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}
              </article>
            );
          })}
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

      {activeSource && (
        <Dialog
          isOpen={true}
          title='原文上下文预览'
          id='reader-ai-source-preview'
          snapHeight={0.72}
          dragHandleLabel='下拉关闭原文上下文预览'
          header={<div className='sr-only'>原文上下文预览</div>}
          className='modal-open absolute inset-0 z-[60]'
          bgClassName='bg-base-content/20 backdrop-blur-[1px]'
          boxClassName='border-base-content/10 bg-base-100/95 text-base-content shadow-2xl backdrop-blur-md sm:max-w-md'
          contentClassName='!my-0 !px-4 !pb-4 !pt-0'
          onClose={closeSourcePreview}
        >
          <div className='mb-3 flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='text-primary/80 mb-1 text-[11px] font-semibold tracking-wide'>
                引用 [{activeSource.displayIndex + 1}]
              </div>
              <h3 className='text-sm font-semibold leading-5'>
                {activeSource.source.chapterTitle}
              </h3>
              <p className='text-base-content/55 mt-1 text-xs'>不会改变当前阅读位置</p>
            </div>
          </div>
          <div
            className='focus-visible:ring-primary/30 max-h-[58vh] overflow-y-auto pr-1 font-serif text-[17px] leading-8 focus-visible:outline-none focus-visible:ring-2'
            role='region'
            aria-label='原文上下文内容'
            tabIndex={0}
          >
            {getSourcePreviewText(activeSource.source) ? (
              (() => {
                const previewText = getSourcePreviewText(activeSource.source);
                const highlightSpans = getValidHighlightSpans(
                  previewText,
                  activeSource.source.highlightSpans,
                );
                if (highlightSpans.length > 0) {
                  const nodes: React.ReactNode[] = [];
                  let cursor = 0;
                  let highlightKey = 0;
                  let firstHighlightAssigned = false;
                  const pushHighlightedSegment = (text: string) => {
                    const parts = text.split(/(\s+)/);
                    parts.forEach((part) => {
                      if (!part) return;
                      if (/^\s+$/.test(part)) {
                        nodes.push(
                          <React.Fragment
                            key={`${activeSource.source.id}-highlight-space-${highlightKey}`}
                          >
                            {part}
                          </React.Fragment>,
                        );
                        highlightKey += 1;
                        return;
                      }
                      const shouldAssignHighlightRef = !firstHighlightAssigned;
                      firstHighlightAssigned = true;
                      if (shouldAssignHighlightRef) {
                        nodes.push(
                          <span
                            key={`${activeSource.source.id}-highlight-start-${highlightKey}`}
                            ref={(element) => {
                              firstHighlightRef.current = element;
                            }}
                            data-testid='reader-ai-source-highlight-start'
                            aria-hidden='true'
                            className='inline-block h-0 w-0 align-baseline'
                          />,
                        );
                      }
                      nodes.push(
                        <span
                          key={`${activeSource.source.id}-highlight-${highlightKey}`}
                          data-testid='reader-ai-source-highlight'
                          className='bg-warning/25 text-base-content box-decoration-clone px-1 [-webkit-box-decoration-break:clone]'
                        >
                          {part}
                        </span>,
                      );
                      highlightKey += 1;
                    });
                  };

                  highlightSpans.forEach((span, spanIndex) => {
                    if (span.start > cursor) {
                      nodes.push(
                        <React.Fragment key={`${activeSource.source.id}-text-${spanIndex}`}>
                          {previewText.slice(cursor, span.start)}
                        </React.Fragment>,
                      );
                    }
                    pushHighlightedSegment(previewText.slice(span.start, span.end));
                    cursor = span.end;
                  });
                  if (cursor < previewText.length) {
                    nodes.push(
                      <React.Fragment key={`${activeSource.source.id}-text-end`}>
                        {previewText.slice(cursor)}
                      </React.Fragment>,
                    );
                  }
                  return (
                    <p className='text-base-content/85 whitespace-pre-wrap px-1 py-1'>{nodes}</p>
                  );
                }
                let firstQuotedParagraphAssigned = false;
                return splitPreviewParagraphs(previewText).map((paragraph, paragraphIndex) => {
                  const isQuoted = isSourcePreviewParagraphHighlighted(
                    paragraph,
                    activeSource.source,
                  );
                  const shouldAssignHighlightRef = isQuoted && !firstQuotedParagraphAssigned;
                  if (isQuoted) firstQuotedParagraphAssigned = true;
                  return (
                    <p
                      key={`${activeSource.source.id}-${paragraphIndex}`}
                      ref={
                        shouldAssignHighlightRef
                          ? (element) => {
                              firstHighlightRef.current = element;
                            }
                          : undefined
                      }
                      className={
                        isQuoted
                          ? 'bg-warning/25 text-base-content box-decoration-clone px-1 py-1 [-webkit-box-decoration-break:clone]'
                          : 'text-base-content/85 px-1 py-1'
                      }
                    >
                      {paragraph}
                    </p>
                  );
                });
              })()
            ) : (
              <p className='text-base-content/60 px-1 py-1 font-sans text-sm leading-6'>
                暂无可预览的原文片段。
              </p>
            )}
            {activeSource.source.atSpoilerBoundary && (
              <div className='border-base-content/10 text-base-content/60 mt-3 rounded-2xl border px-3 py-2 text-center font-sans text-xs leading-5'>
                <div className='font-semibold'>已到达你的当前阅读进度</div>
                <div>预览已限制在当前阅读进度内。</div>
              </div>
            )}
          </div>
        </Dialog>
      )}

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
