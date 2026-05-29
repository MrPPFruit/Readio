import { generateText, streamText, type ModelMessage } from 'ai';

import { isTauriAppPlatform, isWebAppPlatform } from '@/services/environment';
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
import { logReaderAITraceEvent } from '@/services/diagnostics/readerAITrace';
import { AI_PROVIDER_CATALOG } from './constants';
import { getAIProvider } from './providers';
import {
  buildCitationRepairPrompt,
  buildGroundedInsufficientAnswer,
  validateAnswerCitations,
  type CitationValidationIssue,
} from './citationGrounding';
import { buildSystemPrompt } from './prompts';
import {
  buildEntityExpandedQueries,
  buildEntitySidecarForChunks,
  searchEntitySidecar,
} from './entitySidecar';
import { classifyReaderQuestion, type ReaderQuestionClassification } from './questionRouting';
import {
  getCurrentSectionContextChunks,
  getCurrentSectionSummaryChunks,
  hybridSearch,
} from './ragService';
import { aiStore } from './storage/aiStore';
import { packReaderContext } from './search/contextPack';
import { tokenizeSearchText } from './search/bm25';
import { withTimeout } from './utils/retry';
import type { ReaderAISource } from '@/types/readerAI';
import type { AIProviderName, AISettings, EntitySidecarHit, ScoredChunk, TextChunk } from './types';

export interface ReaderChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamReaderAIAnswerOptions {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  currentAIPage?: number;
  messages: ReaderChatMessage[];
  question: string;
  selectionText?: string;
  signal?: AbortSignal;
  onSources?: (sources: ReaderAISource[]) => void;
  loadSectionText?: (sectionIndex: number) => Promise<string | null>;
  runId?: string;
}

export interface GenerateReaderAISuggestionsOptions {
  settings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  source: 'selection' | 'initial' | 'follow-up';
  selectionText?: string;
  messages: ReaderChatMessage[];
  signal?: AbortSignal;
}

const currentContextQuestionPattern =
  /前面|发生了什么|本章|这章|这一章|当前章节|这里|当前|现在|目前|刚才|这段|上一段/;
const entityListQuestionPattern = /成员|都有谁|有谁|名单|包括谁/;
const currentContextScoreBoost = 1_000;
const analysisRetrievalMultiplier = 5;
const MIN_ENTITY_CONTEXT_CHUNKS = 8;
const MIN_ENTITY_CURRENT_CONTEXT_TOKEN_LENGTH = 2;
const MIN_SOURCE_HIGHLIGHT_TOKEN_LENGTH = 3;
const MIN_SOURCE_HIGHLIGHT_TOKEN_MATCHES = 2;
const ORIGINAL_SECTION_PREVIEW_WINDOW_LENGTH = 6_000;
const ORIGINAL_SECTION_PREVIEW_WINDOW_PADDING = 2_000;
const ORIGINAL_SECTION_LOAD_TIMEOUT_MS = 1_200;
const QUERY_REWRITE_TIMEOUT_MS = 4_000;
const READER_AI_RETRIEVAL_TRACE_BUDGET_MS = 3_000;
const READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS = 15_000;
const CJK_TEXT_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
const LATIN_WORD_PATTERN = /[a-zA-Z][a-zA-Z'-]*/g;
const CROSS_LANGUAGE_RETRIEVAL_TERMS: Array<[RegExp, string[]]> = [
  [/北方冷风|北风|冷风/, ['cold northern breeze', 'north wind', 'cold wind']],
  [/感受|感觉|觉得/, ['feel', 'feels', 'feeling']],
  [/振奋|鼓舞/, ['brace', 'braces', 'braced']],
  [/喜悦|高兴|快乐/, ['delight', 'joy']],
  [/朋友|知己|同伴/, ['friend', 'friends']],
  [/找不到|无人|缺少|缺乏/, ['no friend', 'no one', 'want of a friend', 'lack of']],
  [/目的|目标|想要/, ['purpose', 'goal', 'want']],
  [/为什么|原因/, ['why', 'reason']],
  [/谁|人物|角色/, ['who', 'character']],
  [/发生|事件/, ['happen', 'event']],
  [/钥匙|小钥匙/, ['key', 'little key', 'golden key']],
  [/门|小门|锁/, ['door', 'little door', 'lock']],
  [/作用|用途|用处|用来/, ['use', 'purpose', 'open', 'fit', 'fitted']],
  [/总结|概括/, ['summary', 'summarize']],
];

const isSupportedProvider = (provider: string): provider is AIProviderName =>
  provider in AI_PROVIDER_CATALOG;

function countCitationIssueTypes(issues: CitationValidationIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.issue] = (counts[issue.issue] ?? 0) + 1;
    return counts;
  }, {});
}

function buildQuestion(question: string, selectionText?: string): string {
  if (!selectionText?.trim()) return question;
  return `选中文本：\n${selectionText.trim()}\n\n问题：${question}`;
}

function getLatinQuestionTerms(question: string): Set<string> {
  const terms = new Set<string>();
  for (const match of question.matchAll(LATIN_WORD_PATTERN)) terms.add(match[0]!.toLowerCase());
  return terms;
}

function getLexicalCrossLanguageConceptGroupCount(question: string): number {
  return CROSS_LANGUAGE_RETRIEVAL_TERMS.reduce(
    (count, [pattern]) => count + (pattern.test(question) ? 1 : 0),
    0,
  );
}

function buildLexicalCrossLanguageRetrievalQueries(question: string): string[] {
  if (!CJK_TEXT_PATTERN.test(question)) return [];

  const terms = getLatinQuestionTerms(question);
  for (const [pattern, translations] of CROSS_LANGUAGE_RETRIEVAL_TERMS) {
    if (!pattern.test(question)) continue;
    translations.forEach((term) => terms.add(term));
  }

  const query = [...terms].join(' ').trim();
  return query ? [query] : [];
}

function countTokenMatchesInChunks(tokens: string[], chunks: ScoredChunk[]): number {
  return chunks.reduce((bestMatchCount, chunk) => {
    const text = `${chunk.chapterTitle}\n${chunk.text}`.toLowerCase();
    const matchCount = tokens.reduce(
      (total, token) => total + (text.includes(token.toLowerCase()) ? 1 : 0),
      0,
    );
    return Math.max(bestMatchCount, matchCount);
  }, 0);
}

function getSourceLanguageConceptTokens(question: string, retrievalQuery: string): string[] {
  const latinQuestionTerms = getLatinQuestionTerms(question);
  return tokenizeSearchText(retrievalQuery).filter(
    (token) => token.length >= 3 && !latinQuestionTerms.has(token),
  );
}

function countSourceLanguageConceptMatches(
  question: string,
  retrievalQuery: string,
  chunks: ScoredChunk[],
): number {
  return countTokenMatchesInChunks(
    getSourceLanguageConceptTokens(question, retrievalQuery),
    chunks,
  );
}

function shouldTrySourceLanguageRetrievalForWeakMatch(
  question: string,
  chunks: ScoredChunk[],
): boolean {
  if (chunks.length === 0 || !CJK_TEXT_PATTERN.test(question)) return false;

  const latinQuestionTerms = getLatinQuestionTerms(question);
  if (latinQuestionTerms.size === 0) return false;

  const translatedConceptTokens = buildLexicalCrossLanguageRetrievalQueries(question).flatMap(
    (retrievalQuery) => getSourceLanguageConceptTokens(question, retrievalQuery),
  );
  if (translatedConceptTokens.length === 0) return false;

  const requiredMatches = Math.min(2, translatedConceptTokens.length);
  return countTokenMatchesInChunks(translatedConceptTokens, chunks) < requiredMatches;
}

function parseRetrievalQueries(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*\d.、\s]+/, '').trim())
    .filter((line) => Boolean(line) && !CJK_TEXT_PATTERN.test(line))
    .slice(0, 3);
}

function buildSourceLanguageQueryPrompt({
  bookTitle,
  authorName,
  question,
}: {
  bookTitle: string;
  authorName: string;
  question: string;
}) {
  return `Create source-language search queries for finding evidence in the book text.\nReturn 1-3 short English keyword queries, one per line.\nDo not answer the question. Do not include explanations.\n\nBook: ${bookTitle}${authorName ? ` by ${authorName}` : ''}\nQuestion: ${question}`;
}

async function buildCrossLanguageRetrievalQueries({
  settings,
  bookTitle,
  authorName,
  question,
}: {
  settings: AISettings;
  bookTitle: string;
  authorName: string;
  question: string;
}): Promise<string[]> {
  const lexicalQueries = buildLexicalCrossLanguageRetrievalQueries(question);
  const latinQuestionTerms = getLatinQuestionTerms(question);
  if (!CJK_TEXT_PATTERN.test(question) || !isSupportedProvider(settings.provider)) {
    return lexicalQueries;
  }
  if (
    lexicalQueries.length > 0 &&
    latinQuestionTerms.size === 0 &&
    getLexicalCrossLanguageConceptGroupCount(question) >= 2
  ) {
    return lexicalQueries;
  }

  try {
    const provider = getAIProvider(settings);
    const rewritten = await withTimeout(
      generateText({
        model: provider.getModel(),
        prompt: buildSourceLanguageQueryPrompt({ bookTitle, authorName, question }),
      }),
      QUERY_REWRITE_TIMEOUT_MS,
      'source-language query rewrite timed out',
    );
    return [...parseRetrievalQueries(rewritten.text), ...lexicalQueries].filter(
      (query, index, queries) => queries.indexOf(query) === index,
    );
  } catch {
    return lexicalQueries;
  }
}

function parseSuggestions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*\d.、\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function chunksToText(chunks: ScoredChunk[]): string {
  return chunks
    .map((chunk) => chunk.text.trim())
    .filter(Boolean)
    .join('\n');
}

function getChunkBookOrder(chunk: ScoredChunk): number {
  return chunk.sortIndex ?? chunk.sectionIndex * 1_000_000 + chunk.pageNumber;
}

function sortChunksByBookOrder(chunks: ScoredChunk[]): ScoredChunk[] {
  return [...chunks].sort((a, b) => {
    const sortA = getChunkBookOrder(a);
    const sortB = getChunkBookOrder(b);
    if (sortA !== sortB) return sortA - sortB;
    return b.score - a.score;
  });
}

function canLoadOriginalSectionPreviews(): boolean {
  return !isTauriAppPlatform();
}

function sortCurrentChunksFirst(
  chunks: ScoredChunk[],
  currentChunkIds: Set<string>,
): ScoredChunk[] {
  return [...chunks].sort((a, b) => {
    const aIsCurrent = currentChunkIds.has(a.id);
    const bIsCurrent = currentChunkIds.has(b.id);
    if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1;

    const sortA = getChunkBookOrder(a);
    const sortB = getChunkBookOrder(b);
    if (sortA !== sortB) return sortA - sortB;
    return b.score - a.score;
  });
}

interface JoinedSourcePreview {
  text: string;
  previewStartOffset?: number;
  chapterTitle?: string;
  chunkRanges: Map<string, { start: number; end: number; quote: string }>;
}

function getTextOverlapLength(left: string, right: string): number {
  const maxLength = Math.min(left.length, right.length);
  for (let length = maxLength; length > 0; length -= 1) {
    if (left.slice(-length) === right.slice(0, length)) return length;
  }
  return 0;
}

function joinSameSectionChunks(chunks: ScoredChunk[]): JoinedSourcePreview {
  const chunkRanges = new Map<string, { start: number; end: number; quote: string }>();
  let text = '';
  let previewStartOffset: number | undefined;
  let previewEndOffset: number | undefined;

  chunks.forEach((chunk) => {
    const chunkText = chunk.text.trim();
    if (!chunkText) return;

    if (!text) {
      text = chunkText;
      previewStartOffset = chunk.startOffset;
      previewEndOffset = chunk.endOffset;
      chunkRanges.set(chunk.id, { start: 0, end: chunkText.length, quote: chunkText });
      return;
    }

    const currentPreviewStartOffset = previewStartOffset;
    const currentPreviewEndOffset = previewEndOffset;
    const currentChunkStartOffset = chunk.startOffset;
    const currentChunkEndOffset = chunk.endOffset;
    let appendText = chunkText;
    let rangeStart: number;

    if (
      currentPreviewStartOffset !== undefined &&
      currentPreviewEndOffset !== undefined &&
      currentChunkStartOffset !== undefined &&
      currentChunkEndOffset !== undefined
    ) {
      if (currentChunkStartOffset < currentPreviewEndOffset) {
        const overlapLength = Math.max(0, currentPreviewEndOffset - currentChunkStartOffset);
        appendText = chunkText.slice(overlapLength);
        rangeStart = Math.max(0, currentChunkStartOffset - currentPreviewStartOffset);
        previewEndOffset = Math.max(currentPreviewEndOffset, currentChunkEndOffset);
      } else {
        appendText = `\n\n${chunkText}`;
        rangeStart = text.length + 2;
        previewEndOffset = currentChunkEndOffset;
      }
    } else {
      const overlapLength = getTextOverlapLength(text, chunkText);
      appendText = overlapLength > 0 ? chunkText.slice(overlapLength) : `\n\n${chunkText}`;
      rangeStart = overlapLength > 0 ? text.length - overlapLength : text.length + 2;
    }

    text += appendText;
    chunkRanges.set(chunk.id, {
      start: rangeStart,
      end: rangeStart + chunkText.length,
      quote: text.slice(rangeStart, rangeStart + chunkText.length),
    });
  });

  return { text, previewStartOffset, chunkRanges };
}

function buildReaderAISourcePreviewDetails({
  chunk,
  orderedChunks,
  spoilerBoundaryPage,
}: {
  chunk: ScoredChunk;
  orderedChunks: ScoredChunk[];
  spoilerBoundaryPage?: number;
}): JoinedSourcePreview {
  const sectionChunks = sortChunksByBookOrder(
    orderedChunks.filter((candidate) => {
      if (
        candidate.sectionIndex !== chunk.sectionIndex ||
        candidate.chapterTitle !== chunk.chapterTitle
      ) {
        return false;
      }
      if (spoilerBoundaryPage === undefined) return true;
      return (candidate.endPageNumber ?? candidate.pageNumber ?? 0) <= spoilerBoundaryPage;
    }),
  );
  const previewChunks = sectionChunks.length > 0 ? sectionChunks : [chunk];
  return joinSameSectionChunks(previewChunks);
}

export function buildReaderAISourcePreview({
  chunk,
  orderedChunks,
  spoilerBoundaryPage,
}: {
  chunk: ScoredChunk;
  orderedChunks: ScoredChunk[];
  spoilerBoundaryPage?: number;
}): string {
  return buildReaderAISourcePreviewDetails({ chunk, orderedChunks, spoilerBoundaryPage }).text;
}

function filterEntityCurrentChunks(chunks: ScoredChunk[], question: string): ScoredChunk[] {
  const tokens = tokenizeSearchText(question).filter(
    (token) => token.length >= MIN_ENTITY_CURRENT_CONTEXT_TOKEN_LENGTH,
  );
  if (tokens.length === 0) return chunks;

  const relevantChunks = chunks.filter((chunk) => {
    const text = `${chunk.chapterTitle}\n${chunk.text}`.toLowerCase();
    return tokens.some((token) => text.includes(token.toLowerCase()));
  });
  return relevantChunks.length > 0 ? relevantChunks : chunks;
}

function scoreSidecarChunk(
  chunk: ScoredChunk,
  hitsByChunkId: Map<string, EntitySidecarHit>,
): ScoredChunk {
  const hit = hitsByChunkId.get(chunk.id);
  if (!hit) return chunk;
  return {
    ...chunk,
    score: chunk.score + hit.score,
    searchMethod: 'hybrid',
  };
}

function chunkToSidecarScoredChunk(chunk: TextChunk, hit: EntitySidecarHit): ScoredChunk {
  return {
    ...chunk,
    score: hit.score,
    searchMethod: 'hybrid',
  };
}

async function collectOriginalSidecarHitChunks(
  bookHash: string,
  hits: EntitySidecarHit[],
  existingChunks: ScoredChunk[],
): Promise<ScoredChunk[]> {
  const missingHitIds = new Set(
    hits
      .map((hit) => hit.chunkId)
      .filter((chunkId) => !existingChunks.some((chunk) => chunk.id === chunkId)),
  );
  if (missingHitIds.size === 0) return [];

  const storedChunks = await aiStore.getChunks(bookHash);
  const hitsByChunkId = new Map(hits.map((hit) => [hit.chunkId, hit]));
  return storedChunks
    .filter((chunk) => missingHitIds.has(chunk.id))
    .map((chunk) => chunkToSidecarScoredChunk(chunk, hitsByChunkId.get(chunk.id)!));
}

async function collectEntitySidecarChunks({
  bookHash,
  query,
  settings,
  retrievalK,
  searchBoundary,
  scope,
  runId,
}: {
  bookHash: string;
  query: string;
  settings: AISettings;
  retrievalK: number;
  searchBoundary?: number;
  scope: ReaderQuestionClassification['scope'];
  runId: string;
}): Promise<ScoredChunk[]> {
  const startedAt = Date.now();
  try {
    let sidecar = await aiStore.getEntitySidecar(bookHash);
    if (!sidecar) {
      const storedChunks = await aiStore.getChunks(bookHash);
      if (storedChunks.length === 0) return [];
      sidecar = buildEntitySidecarForChunks(storedChunks);
      await aiStore.saveEntitySidecar(bookHash, sidecar);
    }
    const hits = searchEntitySidecar(sidecar, query, { maxPage: searchBoundary, topK: retrievalK });
    if (hits.length === 0) return [];

    const expandedQueries = buildEntityExpandedQueries(query, hits);
    const expandedChunks = (
      await Promise.all(
        expandedQueries.map((expandedQuery) =>
          hybridSearch(bookHash, expandedQuery, settings, Math.max(retrievalK, 8), searchBoundary),
        ),
      )
    ).flat();
    const hitsByChunkId = new Map(hits.map((hit) => [hit.chunkId, hit]));
    const sidecarChunks = expandedChunks.map((chunk) => scoreSidecarChunk(chunk, hitsByChunkId));
    sidecarChunks.push(...(await collectOriginalSidecarHitChunks(bookHash, hits, sidecarChunks)));
    const durationMs = Date.now() - startedAt;
    await logDiagnosticEvent('reader_ai.entity_sidecar_hit', 'debug', {
      hitCount: hits.length,
      aliasHitCount: hits.filter((hit) => hit.hitType === 'alias').length,
      factHitCount: hits.filter((hit) => hit.hitType === 'fact').length,
      scope,
      durationMs,
    });
    void logReaderAITraceEvent({
      runId,
      stage: 'retrieval',
      action: 'entity_sidecar_lookup',
      status: 'completed',
      durationMs,
      candidateCount: hits.length,
      selectedCount: sidecarChunks.length,
      latencyBudgetMs: READER_AI_RETRIEVAL_TRACE_BUDGET_MS,
      firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
    });
    return sidecarChunks;
  } catch (error) {
    await logDiagnosticError('reader_ai.entity_sidecar_failed', error, { operation: 'search' });
    return [];
  }
}

interface ReaderAIEvidencePacket {
  chunks: ScoredChunk[];
  currentChunkIds: Set<string>;
  sourceBoundaryPage: number;
  preserveEvidenceOrder: boolean;
  sourceHighlightQuery: string;
}

async function retrieveReaderEvidence({
  settings,
  bookHash,
  query,
  question,
  bookTitle,
  authorName,
  currentPage,
  currentAIPage,
  classification,
  selectionText,
  runId,
}: {
  settings: AISettings;
  bookHash: string;
  query: string;
  question: string;
  bookTitle: string;
  authorName: string;
  currentPage: number;
  currentAIPage?: number;
  classification: ReaderQuestionClassification;
  selectionText?: string;
  runId: string;
}): Promise<ReaderAIEvidencePacket> {
  let chunks: ScoredChunk[] = [];
  const currentChunkIds = new Set<string>();
  const sourceBoundaryPage = currentAIPage ?? currentPage;

  const requestedMaxContextChunks = settings.maxContextChunks || 5;
  const maxContextChunks =
    classification.intent === 'entity_lookup'
      ? Math.max(requestedMaxContextChunks, MIN_ENTITY_CONTEXT_CHUNKS)
      : requestedMaxContextChunks;
  const retrievalMultiplier =
    classification.intent === 'analysis' || classification.intent === 'entity_lookup'
      ? analysisRetrievalMultiplier
      : 3;
  const retrievalK = Math.max(maxContextChunks * retrievalMultiplier, 8);
  const searchBoundary = settings.spoilerProtection ? sourceBoundaryPage : undefined;
  const shouldIncludeCurrentContext =
    currentContextQuestionPattern.test(question) ||
    classification.intent === 'entity_lookup' ||
    classification.intent === 'analysis';
  const enabledActions = [
    'hybrid_search',
    ...(classification.intent === 'entity_lookup' ? ['entity_sidecar_lookup'] : []),
    'source_language_rewrite',
    ...(shouldIncludeCurrentContext ? ['current_context_injection'] : []),
    'context_pack',
  ];
  void logReaderAITraceEvent({
    runId,
    stage: 'retrieval',
    action: 'hybrid_search',
    status: 'started',
    classificationIntent: classification.intent,
    classificationScope: classification.scope,
    enabledActions,
    maxContextChunks,
    retrievalK,
    latencyBudgetMs: READER_AI_RETRIEVAL_TRACE_BUDGET_MS,
    firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
  });

  let preserveEvidenceOrder = false;
  let sourceHighlightQuery = query;

  try {
    chunks = await hybridSearch(bookHash, query, settings, retrievalK, searchBoundary);
    if (chunks.length === 0) {
      chunks = await hybridSearch(
        bookHash,
        query,
        settings,
        Math.max(retrievalK * 2, retrievalK + 4),
        searchBoundary,
      );
    }
    const needsSourceLanguageWeakMatchRecovery = shouldTrySourceLanguageRetrievalForWeakMatch(
      question,
      chunks,
    );
    if (classification.intent === 'entity_lookup') {
      chunks = [
        ...chunks,
        ...(await collectEntitySidecarChunks({
          bookHash,
          query,
          settings,
          retrievalK,
          searchBoundary,
          scope: classification.scope,
          runId,
        })),
      ];
    }
    if (chunks.length === 0 || needsSourceLanguageWeakMatchRecovery) {
      const retrievalQueries = await buildCrossLanguageRetrievalQueries({
        settings,
        bookTitle,
        authorName,
        question,
      });
      const originalConceptMatches = needsSourceLanguageWeakMatchRecovery
        ? countTokenMatchesInChunks(
            buildLexicalCrossLanguageRetrievalQueries(question).flatMap((retrievalQuery) =>
              getSourceLanguageConceptTokens(question, retrievalQuery),
            ),
            chunks,
          )
        : 0;
      for (const retrievalQuery of retrievalQueries) {
        const rewriteStartedAt = Date.now();
        const sourceLanguageChunks = await hybridSearch(
          bookHash,
          retrievalQuery,
          settings,
          Math.max(retrievalK * 2, retrievalK + 4),
          searchBoundary,
        );
        if (
          sourceLanguageChunks.length > 0 &&
          (!needsSourceLanguageWeakMatchRecovery ||
            countSourceLanguageConceptMatches(question, retrievalQuery, sourceLanguageChunks) >
              originalConceptMatches)
        ) {
          void logReaderAITraceEvent({
            runId,
            stage: 'retrieval',
            action: 'source_language_rewrite',
            status: 'completed',
            durationMs: Date.now() - rewriteStartedAt,
            candidateCount: sourceLanguageChunks.length,
            selectedCount: sourceLanguageChunks.length,
            latencyBudgetMs: READER_AI_RETRIEVAL_TRACE_BUDGET_MS,
            firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
          });
          chunks = sourceLanguageChunks;
          preserveEvidenceOrder = true;
          sourceHighlightQuery = retrievalQuery;
          break;
        }
      }
    }
    if (shouldIncludeCurrentContext) {
      const currentContextStartedAt = Date.now();
      const sectionChunks =
        classification.intent === 'chapter_summary'
          ? await getCurrentSectionSummaryChunks(bookHash, sourceBoundaryPage, 4)
          : await getCurrentSectionContextChunks(bookHash, sourceBoundaryPage, 4);
      const currentChunks =
        classification.intent === 'entity_lookup'
          ? filterEntityCurrentChunks(sectionChunks, question)
          : sectionChunks;
      void logReaderAITraceEvent({
        runId,
        stage: 'retrieval',
        action: 'current_context_injection',
        status: 'completed',
        durationMs: Date.now() - currentContextStartedAt,
        candidateCount: sectionChunks.length,
        selectedCount: currentChunks.length,
        latencyBudgetMs: READER_AI_RETRIEVAL_TRACE_BUDGET_MS,
        firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
      });
      currentChunks.forEach((chunk) => currentChunkIds.add(chunk.id));
      const shouldBoostCurrentChunks =
        !preserveEvidenceOrder &&
        (classification.intent !== 'entity_lookup' ||
          currentContextQuestionPattern.test(question) ||
          entityListQuestionPattern.test(question));
      const boostedCurrentChunks = currentChunks.map((chunk) => ({
        ...chunk,
        score: shouldBoostCurrentChunks ? chunk.score + currentContextScoreBoost : chunk.score,
      }));
      chunks =
        classification.intent === 'chapter_summary' && boostedCurrentChunks.length
          ? boostedCurrentChunks
          : [...boostedCurrentChunks, ...chunks];
    }
    const candidateCount = chunks.length;
    chunks = packReaderContext({
      question: query,
      chunks,
      currentPage: sourceBoundaryPage,
      maxContextChunks,
      spoilerProtection: settings.spoilerProtection,
      selectionText,
      preferSectionDiversity: classification.intent === 'entity_lookup',
    });
    void logReaderAITraceEvent({
      runId,
      stage: 'context',
      action: 'context_pack',
      status: 'completed',
      candidateCount,
      selectedCount: chunks.length,
      firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
    });
  } catch {
    chunks = [];
  }

  return {
    chunks,
    currentChunkIds,
    sourceBoundaryPage,
    preserveEvidenceOrder,
    sourceHighlightQuery,
  };
}

function isSourcePreviewAtSpoilerBoundary(
  chunk: ScoredChunk,
  spoilerBoundaryPage: number | undefined,
  previewChunks: ScoredChunk[],
): boolean {
  if (spoilerBoundaryPage === undefined) return false;
  const chunkBoundaryPage = chunk.endPageNumber ?? chunk.pageNumber;
  if (chunkBoundaryPage >= spoilerBoundaryPage) return true;
  return previewChunks.some(
    (candidate) =>
      candidate.sectionIndex === chunk.sectionIndex &&
      candidate.chapterTitle === chunk.chapterTitle &&
      (candidate.pageNumber ?? 0) > spoilerBoundaryPage,
  );
}

function createReaderAISource({
  chunk,
  preview,
  anchorRange,
  isAtSpoilerBoundary,
}: {
  chunk: ScoredChunk;
  preview: { text: string; previewStartOffset?: number; chapterTitle?: string };
  anchorRange?: { start: number; end: number; quote: string };
  isAtSpoilerBoundary: boolean;
}): ReaderAISource {
  return {
    id: chunk.id,
    chapterTitle: preview.chapterTitle ?? chunk.chapterTitle,
    sectionIndex: chunk.sectionIndex,
    sortIndex: chunk.sortIndex,
    ...(chunk.chunkIndex !== undefined ? { chunkIndex: chunk.chunkIndex } : {}),
    ...(chunk.startOffset !== undefined ? { startOffset: chunk.startOffset } : {}),
    ...(chunk.endOffset !== undefined ? { endOffset: chunk.endOffset } : {}),
    ...(chunk.cfi ? { cfi: chunk.cfi } : {}),
    ...(chunk.href ? { href: chunk.href } : {}),
    snippet: chunk.text.trim().slice(0, 120),
    contextText: preview.text,
    previewText: preview.text,
    ...(preview.previewStartOffset !== undefined
      ? { previewStartOffset: preview.previewStartOffset }
      : {}),
    ...(anchorRange
      ? {
          highlightSpans: [
            {
              start: anchorRange.start,
              end: anchorRange.end,
              quote: anchorRange.quote,
              source: 'chunk' as const,
            },
          ],
        }
      : {}),
    ...(isAtSpoilerBoundary ? { atSpoilerBoundary: true } : {}),
    confidence: chunk.cfi || chunk.href ? 'section' : 'approximate',
  };
}

function getSafeSectionEndOffset(
  chunk: ScoredChunk,
  spoilerBoundaryPage: number | undefined,
  previewChunks: ScoredChunk[],
): number | undefined {
  if (spoilerBoundaryPage === undefined) return undefined;
  return previewChunks
    .filter(
      (candidate) =>
        candidate.sectionIndex === chunk.sectionIndex &&
        candidate.chapterTitle === chunk.chapterTitle &&
        (candidate.endPageNumber ?? candidate.pageNumber ?? 0) <= spoilerBoundaryPage &&
        candidate.endOffset !== undefined,
    )
    .reduce<
      number | undefined
    >((safeEndOffset, candidate) => Math.max(safeEndOffset ?? 0, candidate.endOffset ?? 0), undefined);
}

function normalizePreviewText(text: string): string {
  return text.trim() ? text : '';
}

function getOriginalSectionTitle(sectionText: string): string | undefined {
  const lines = sectionText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (lines.length < 2) return undefined;

  const heading = lines[0]!;
  if (!/^chapter\s+\S+/i.test(heading) && !/^第.+[章节卷部篇回]$/.test(heading)) return undefined;
  return `${heading} - ${lines[1]}`;
}

const sentencePunctuationPattern = /[。！？.!?]/;

function isParagraphBoundary(text: string, index: number): boolean {
  return text[index] === '\n' && (text[index - 1] === '\n' || text[index + 1] === '\n');
}

function isSourceSentenceBoundary(text: string, index: number): boolean {
  const character = text[index];
  return (
    character !== undefined &&
    (sentencePunctuationPattern.test(character) || isParagraphBoundary(text, index))
  );
}

function splitSourceSentences(text: string): Array<{ start: number; end: number; quote: string }> {
  const sentences: Array<{ start: number; end: number; quote: string }> = [];
  let start = 0;
  const pushSentence = (end: number) => {
    const quote = text.slice(start, end).trim();
    if (!quote) return;

    const trimmedStart = text.slice(start, end).search(/\S/);
    sentences.push({
      start: start + Math.max(trimmedStart, 0),
      end: start + Math.max(trimmedStart, 0) + quote.length,
      quote,
    });
  };

  for (let index = 0; index < text.length; index += 1) {
    if (sentencePunctuationPattern.test(text[index]!)) {
      const end = index + 1;
      pushSentence(end);
      start = end;
      continue;
    }

    if (isParagraphBoundary(text, index)) {
      pushSentence(index);
      while (text[index + 1] === '\n') index += 1;
      start = index + 1;
    }
  }
  pushSentence(text.length);
  return sentences;
}

function narrowRangeToBestMatchingSentence(
  range: { start: number; end: number; quote: string },
  query: string,
): { start: number; end: number; quote: string } {
  const tokens = tokenizeSearchText(query).filter(
    (token) => token.length >= MIN_SOURCE_HIGHLIGHT_TOKEN_LENGTH,
  );
  if (tokens.length === 0) return range;

  const sentences = splitSourceSentences(range.quote)
    .map((sentence) => ({
      ...sentence,
      start: range.start + sentence.start,
      end: range.start + sentence.end,
    }))
    .filter((sentence) => sentence.quote.length < range.quote.length);
  if (sentences.length === 0) return range;

  const rankedSentences = sentences
    .map((sentence) => {
      const normalizedQuote = sentence.quote.toLowerCase();
      const matches = tokens.filter((token) =>
        normalizedQuote.includes(token.toLowerCase()),
      ).length;
      return { sentence, matches };
    })
    .sort((a, b) => b.matches - a.matches || a.sentence.quote.length - b.sentence.quote.length);
  const bestSentence = rankedSentences[0];
  const secondBestSentence = rankedSentences[1];

  if (!bestSentence || bestSentence.matches < MIN_SOURCE_HIGHLIGHT_TOKEN_MATCHES) return range;
  if (
    secondBestSentence &&
    secondBestSentence.matches >= MIN_SOURCE_HIGHLIGHT_TOKEN_MATCHES &&
    bestSentence.matches - secondBestSentence.matches < MIN_SOURCE_HIGHLIGHT_TOKEN_MATCHES
  ) {
    return range;
  }
  return bestSentence.sentence;
}

function expandRangeToSentence(
  text: string,
  start: number,
  end: number,
): { start: number; end: number; quote: string } {
  let expandedStart = start;
  while (expandedStart > 0) {
    if (isSourceSentenceBoundary(text, expandedStart - 1)) break;
    expandedStart -= 1;
  }
  while (expandedStart < start && /\s/.test(text[expandedStart]!)) expandedStart += 1;

  let expandedEnd = end;
  if (!isSourceSentenceBoundary(text, expandedEnd - 1)) {
    while (expandedEnd < text.length) {
      const currentIndex = expandedEnd;
      expandedEnd += 1;
      if (isSourceSentenceBoundary(text, currentIndex)) break;
    }
  }
  while (expandedEnd > end && /\s/.test(text[expandedEnd - 1]!)) expandedEnd -= 1;

  return { start: expandedStart, end: expandedEnd, quote: text.slice(expandedStart, expandedEnd) };
}

function findOriginalSectionRange(
  sectionText: string,
  chunk: ScoredChunk,
): { start: number; end: number; quote: string } | undefined {
  const chunkText = chunk.text.trim();
  if (!chunkText) return undefined;

  if (chunk.startOffset !== undefined && chunk.endOffset !== undefined) {
    const start = chunk.startOffset;
    const end = chunk.endOffset;
    if (start >= 0 && end > start && end <= sectionText.length) {
      const quote = sectionText.slice(start, end);
      if (quote === chunkText) {
        return expandRangeToSentence(sectionText, start, end);
      }
      const chunkIndexInStoredRange = quote.indexOf(chunkText);
      if (chunkIndexInStoredRange >= 0) {
        const chunkStart = start + chunkIndexInStoredRange;
        return expandRangeToSentence(sectionText, chunkStart, chunkStart + chunkText.length);
      }
    }
  }

  const chunkIndex = sectionText.indexOf(chunkText);
  if (chunkIndex >= 0) {
    return expandRangeToSentence(sectionText, chunkIndex, chunkIndex + chunkText.length);
  }

  const snippet = chunkText.slice(0, 120);
  const snippetIndex = snippet ? sectionText.indexOf(snippet) : -1;
  if (snippetIndex >= 0) {
    return expandRangeToSentence(sectionText, snippetIndex, snippetIndex + snippet.length);
  }

  return undefined;
}

function windowOriginalSectionPreview(
  sectionText: string,
  range: { start: number; end: number; quote: string },
): {
  text: string;
  previewStartOffset: number;
  range: { start: number; end: number; quote: string };
} {
  if (sectionText.length <= ORIGINAL_SECTION_PREVIEW_WINDOW_LENGTH) {
    return { text: sectionText, previewStartOffset: 0, range };
  }

  const previewStartOffset = Math.max(0, range.start - ORIGINAL_SECTION_PREVIEW_WINDOW_PADDING);
  const previewEndOffset = Math.min(
    sectionText.length,
    Math.max(
      range.end + ORIGINAL_SECTION_PREVIEW_WINDOW_PADDING,
      previewStartOffset + ORIGINAL_SECTION_PREVIEW_WINDOW_LENGTH,
    ),
  );
  return {
    text: sectionText.slice(previewStartOffset, previewEndOffset),
    previewStartOffset,
    range: {
      start: range.start - previewStartOffset,
      end: range.end - previewStartOffset,
      quote: range.quote,
    },
  };
}

async function loadOriginalSectionTextWithTimeout(
  loadSectionText: (sectionIndex: number) => Promise<string | null>,
  sectionIndex: number,
): Promise<string | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loadSectionText(sectionIndex),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), ORIGINAL_SECTION_LOAD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function buildOriginalSectionPreviewDetails({
  chunk,
  spoilerBoundaryPage,
  previewChunks,
  loadSectionText,
  query,
}: {
  chunk: ScoredChunk;
  spoilerBoundaryPage?: number;
  previewChunks: ScoredChunk[];
  loadSectionText?: (sectionIndex: number) => Promise<string | null>;
  query: string;
}): Promise<JoinedSourcePreview | undefined> {
  if (!loadSectionText) return undefined;

  const loadedText = await loadOriginalSectionTextWithTimeout(
    loadSectionText,
    chunk.sectionIndex,
  ).catch(() => null);
  const sectionText = normalizePreviewText(loadedText ?? '');
  if (!sectionText) return undefined;

  const safeEndOffset = getSafeSectionEndOffset(chunk, spoilerBoundaryPage, previewChunks);
  if (spoilerBoundaryPage !== undefined && safeEndOffset === undefined) return undefined;
  if (
    safeEndOffset !== undefined &&
    (chunk.endOffset === undefined || chunk.endOffset > safeEndOffset)
  ) {
    return undefined;
  }

  const range = findOriginalSectionRange(sectionText, chunk);
  if (!range) return undefined;
  const highlightRange = narrowRangeToBestMatchingSentence(range, query);
  const safePreviewEndOffset =
    safeEndOffset === undefined ? undefined : Math.max(safeEndOffset, highlightRange.end);
  if (safePreviewEndOffset !== undefined && highlightRange.start > safePreviewEndOffset)
    return undefined;

  const safeSectionText =
    safePreviewEndOffset === undefined ? sectionText : sectionText.slice(0, safePreviewEndOffset);
  const windowed = windowOriginalSectionPreview(safeSectionText, highlightRange);
  return {
    text: windowed.text,
    previewStartOffset: windowed.previewStartOffset,
    chapterTitle: getOriginalSectionTitle(sectionText),
    chunkRanges: new Map([[chunk.id, windowed.range]]),
  };
}

async function chunkToSource(
  chunk: ScoredChunk,
  spoilerBoundaryPage: number | undefined,
  previewChunks: ScoredChunk[],
  query: string,
  loadSectionText?: (sectionIndex: number) => Promise<string | null>,
): Promise<ReaderAISource> {
  const isAtSpoilerBoundary = isSourcePreviewAtSpoilerBoundary(
    chunk,
    spoilerBoundaryPage,
    previewChunks,
  );
  const preview =
    (await buildOriginalSectionPreviewDetails({
      chunk,
      spoilerBoundaryPage,
      previewChunks,
      loadSectionText,
      query,
    })) ??
    buildReaderAISourcePreviewDetails({ chunk, orderedChunks: previewChunks, spoilerBoundaryPage });
  return createReaderAISource({
    chunk,
    preview,
    anchorRange: preview.chunkRanges.get(chunk.id),
    isAtSpoilerBoundary,
  });
}

async function buildSuggestionContext({
  settings,
  bookHash,
  currentPage,
  source,
  selectionText,
  messages,
}: GenerateReaderAISuggestionsOptions): Promise<{ label: string; content: string }> {
  if (source === 'selection' && selectionText?.trim()) {
    return { label: '选中文本', content: selectionText.trim() };
  }

  if (source === 'follow-up') {
    const previousAnswer = [...messages].reverse().find((message) => message.role === 'assistant');
    if (previousAnswer?.content.trim()) {
      return { label: '先前回答', content: previousAnswer.content.trim() };
    }
  }

  const currentChunks = await getCurrentSectionContextChunks(bookHash, currentPage, 3);
  const currentPageText = chunksToText(currentChunks);
  if (currentPageText) return { label: '当前页面内容', content: currentPageText };

  const searchChunks = await hybridSearch(
    bookHash,
    '当前页面可提问的问题',
    settings,
    3,
    settings.spoilerProtection ? currentPage : undefined,
  );
  return { label: '当前页面内容', content: chunksToText(searchChunks) };
}

export async function generateReaderAISuggestions(
  options: GenerateReaderAISuggestionsOptions,
): Promise<string[]> {
  const { settings, bookTitle, authorName = '', currentPage, source, signal } = options;
  if (!isSupportedProvider(settings.provider)) return [];

  const context = await buildSuggestionContext(options);
  if (!context.content) return [];

  const provider = getAIProvider(settings);
  const result = await generateText({
    model: provider.getModel(),
    prompt: `你是阅读 AI 助手。请基于${context.label}，为读者生成 3 个适合继续提问的简短中文问题。\n\n书名：${bookTitle}\n作者：${authorName || '未知'}\n当前页：${currentPage}\n建议来源：${source}\n防剧透：${settings.spoilerProtection ? '开启，只能基于当前进度' : '关闭'}\n\n${context.label}：\n${context.content}\n\n要求：\n- 只输出 3 行，每行一个问题\n- 不要编号以外的解释\n- 不要包含未读后文剧透`,
    abortSignal: signal,
  });

  return parseSuggestions(result.text);
}

async function* streamViaApiRoute(
  messages: ModelMessage[],
  readerContext: {
    bookTitle: string;
    authorName: string;
    currentPage: number;
    readerPage?: number;
    spoilerProtection: boolean;
    classification?: ReaderQuestionClassification;
    chunks: ScoredChunk[];
  },
  settings: AISettings,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      readerContext,
      provider: settings.provider,
      apiKey: settings.providerApiKeys[settings.provider],
      baseUrl:
        settings.provider === 'custom-openai-compatible'
          ? settings.customProviderBaseUrl
          : AI_PROVIDER_CATALOG[settings.provider].baseUrl,
      model:
        settings.providerModels[settings.provider] ||
        AI_PROVIDER_CATALOG[settings.provider].defaultModel,
    }),
    signal,
  });

  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new Error('provider-auth-failed');
    if ([402, 429].includes(response.status)) throw new Error('provider-quota-failed');
    if (response.status === 404) throw new Error('provider-model-failed');
    if (response.status >= 500) throw new Error('provider-failed');
    throw new Error(`provider-request-failed:${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

export async function* streamReaderAIAnswer({
  settings,
  bookHash,
  bookTitle,
  authorName = '',
  currentPage,
  currentAIPage,
  messages,
  question,
  selectionText,
  signal,
  onSources,
  loadSectionText,
  runId = crypto.randomUUID(),
}: StreamReaderAIAnswerOptions): AsyncGenerator<string> {
  const runStartedAt = Date.now();
  const query = buildQuestion(question, selectionText);
  const classificationStartedAt = Date.now();
  const classification = classifyReaderQuestion({
    question,
    selectionText,
    spoilerProtection: settings.spoilerProtection,
  });
  void logReaderAITraceEvent({
    runId,
    stage: 'run',
    action: 'classify_question',
    status: 'completed',
    durationMs: Date.now() - classificationStartedAt,
    firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
  });
  const retrievalStartedAt = Date.now();
  const {
    chunks,
    currentChunkIds,
    sourceBoundaryPage,
    preserveEvidenceOrder,
    sourceHighlightQuery,
  } = await retrieveReaderEvidence({
    settings,
    bookHash,
    query,
    question,
    bookTitle,
    authorName,
    currentPage,
    ...(currentAIPage !== undefined ? { currentAIPage } : {}),
    classification,
    selectionText,
    runId,
  });
  const retrievalDurationMs = Date.now() - retrievalStartedAt;
  void logReaderAITraceEvent({
    runId,
    stage: 'retrieval',
    action: 'hybrid_search',
    status: 'completed',
    durationMs: retrievalDurationMs,
    selectedCount: chunks.length,
    latencyBudgetMs: READER_AI_RETRIEVAL_TRACE_BUDGET_MS,
    firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
    ...(retrievalDurationMs > READER_AI_RETRIEVAL_TRACE_BUDGET_MS
      ? { overBudgetStage: 'retrieval' }
      : {}),
  });

  const shouldPrioritizeCurrentChunks =
    currentChunkIds.size > 0 &&
    classification.intent !== 'current_recap' &&
    (classification.intent !== 'entity_lookup' ||
      entityListQuestionPattern.test(question) ||
      currentContextQuestionPattern.test(question));
  const orderedChunks = preserveEvidenceOrder
    ? chunks
    : shouldPrioritizeCurrentChunks
      ? sortCurrentChunksFirst(chunks, currentChunkIds)
      : sortChunksByBookOrder(chunks);
  const storedPreviewChunks = await aiStore.getChunks(bookHash).catch(() => orderedChunks);
  const mergedPreviewChunks = [...storedPreviewChunks];
  orderedChunks.forEach((chunk) => {
    if (!mergedPreviewChunks.some((previewChunk) => previewChunk.id === chunk.id)) {
      mergedPreviewChunks.push(chunk);
    }
  });
  const sourcePreviewChunks = mergedPreviewChunks.map((previewChunk) => {
    const orderedChunk = orderedChunks.find((chunk) => chunk.id === previewChunk.id);
    return {
      ...previewChunk,
      score: orderedChunk?.score ?? 0,
      searchMethod: orderedChunk?.searchMethod ?? 'bm25',
    };
  });
  const sourceSectionLoader = canLoadOriginalSectionPreviews() ? loadSectionText : undefined;
  const sources = await Promise.all(
    orderedChunks.map((chunk) =>
      chunkToSource(
        chunk,
        settings.spoilerProtection ? sourceBoundaryPage : undefined,
        sourcePreviewChunks,
        sourceHighlightQuery,
        sourceSectionLoader,
      ),
    ),
  );
  onSources?.(sources);
  void logDiagnosticEvent('reader_ai.retrieval_completed', 'info', {
    provider: settings.provider,
    model: settings.providerModels[settings.provider] ?? '',
    chunkCount: orderedChunks.length,
    sourceCount: sources.length,
    currentPage,
    sourceBoundaryPage: sourceBoundaryPage ?? null,
    spoilerProtection: settings.spoilerProtection,
    classificationIntent: classification.intent,
    classificationScope: classification.scope,
  });

  if (orderedChunks.length === 0) {
    void logReaderAITraceEvent({
      runId,
      stage: 'generation',
      action: 'generate_answer',
      status: 'skipped',
      durationMs: Date.now() - runStartedAt,
      firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
      recoveryHint: 'fallback_answer_shown',
    });
    void logReaderAITraceEvent({
      runId,
      stage: 'generation',
      action: 'insufficient_answer_fallback',
      status: 'completed',
      sourceCount: sources.length,
      recoveryHint: 'fallback_answer_shown',
    });
    yield buildGroundedInsufficientAnswer({
      question,
      spoilerProtection: settings.spoilerProtection,
      readerPage: currentPage,
      reason: 'empty',
    });
    return;
  }

  const systemPrompt = buildSystemPrompt(
    bookTitle,
    authorName,
    orderedChunks,
    sourceBoundaryPage,
    settings.spoilerProtection,
    classification,
    currentPage,
  );
  const aiMessages: ModelMessage[] = [
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: 'user', content: query },
  ];

  if (!isSupportedProvider(settings.provider)) throw new Error('Unsupported provider');

  let answer = '';
  const generationStartedAt = Date.now();
  try {
    if (isWebAppPlatform()) {
      for await (const chunk of streamViaApiRoute(
        aiMessages,
        {
          bookTitle,
          authorName,
          currentPage: sourceBoundaryPage,
          readerPage: currentPage,
          spoilerProtection: settings.spoilerProtection,
          classification,
          chunks: orderedChunks,
        },
        settings,
        signal,
      )) {
        answer += chunk;
      }
    } else {
      const provider = getAIProvider(settings);
      const result = streamText({
        model: provider.getModel(),
        system: systemPrompt,
        messages: aiMessages,
        abortSignal: signal,
      });

      for await (const chunk of result.textStream) {
        answer += chunk;
      }
    }
  } catch (error) {
    void logReaderAITraceEvent({
      runId,
      stage: 'generation',
      action: 'generate_answer',
      status: signal?.aborted ? 'cancelled' : 'failed',
      durationMs: Date.now() - generationStartedAt,
      firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
      ...(signal?.aborted ? { overBudgetStage: 'cancelled' } : {}),
    });
    void logDiagnosticError('reader_ai.generation_failed', error, {
      provider: settings.provider,
      model: settings.providerModels[settings.provider] ?? '',
      sourceCount: sources.length,
      messageCount: messages.length,
      currentPage,
      spoilerProtection: settings.spoilerProtection,
    });
    throw error;
  }

  const generationDurationMs = Date.now() - generationStartedAt;
  void logReaderAITraceEvent({
    runId,
    stage: 'generation',
    action: 'generate_answer',
    status: 'completed',
    durationMs: generationDurationMs,
    firstOutputMs: Date.now() - runStartedAt,
    firstOutputBudgetMs: READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS,
    ...(Date.now() - runStartedAt > READER_AI_FIRST_OUTPUT_TRACE_BUDGET_MS
      ? { overBudgetStage: 'generation' }
      : {}),
  });
  const citationValidationStartedAt = Date.now();
  const validation = validateAnswerCitations(answer, sources, { requireCitations: true });
  const issueTypeCounts = countCitationIssueTypes(validation.issues);
  void logReaderAITraceEvent({
    runId,
    stage: 'citation_validation',
    action: 'validate_citations',
    status: validation.valid ? 'completed' : 'failed',
    durationMs: Date.now() - citationValidationStartedAt,
    issueCount: validation.issues.length,
    issueTypeCounts,
  });
  if (validation.valid) {
    if (answer) yield answer;
    return;
  }

  const citationRepairStartedAt = Date.now();
  try {
    const provider = getAIProvider(settings);
    const repaired = await generateText({
      model: provider.getModel(),
      prompt: buildCitationRepairPrompt({ answer, sources, issues: validation.issues }),
      abortSignal: signal,
    });
    const repairedAnswer = repaired.text.trim();
    const repairedValidation = validateAnswerCitations(repairedAnswer, sources, {
      requireCitations: true,
    });
    void logReaderAITraceEvent({
      runId,
      stage: 'citation_repair',
      action: 'repair_citations',
      status: repairedValidation.valid ? 'completed' : 'failed',
      durationMs: Date.now() - citationRepairStartedAt,
      issueCount: repairedValidation.issues.length,
      issueTypeCounts: repairedValidation.valid ? {} : issueTypeCounts,
      repairedCount: repairedValidation.valid ? sources.length : 0,
      ...(repairedValidation.valid ? {} : { recoveryHint: 'fallback_answer_shown' }),
    });
    if (repairedValidation.valid) {
      yield repairedAnswer;
      return;
    }
  } catch {
    void logReaderAITraceEvent({
      runId,
      stage: 'citation_repair',
      action: 'repair_citations',
      status: 'failed',
      durationMs: Date.now() - citationRepairStartedAt,
      issueCount: validation.issues.length,
      issueTypeCounts,
      recoveryHint: 'fallback_answer_shown',
    });
  }

  void logReaderAITraceEvent({
    runId,
    stage: 'generation',
    action: 'insufficient_answer_fallback',
    status: 'completed',
    sourceCount: sources.length,
    recoveryHint: 'fallback_answer_shown',
  });
  yield buildGroundedInsufficientAnswer({
    question,
    spoilerProtection: settings.spoilerProtection,
    readerPage: currentPage,
    reason: 'invalid_citations',
  });
}
