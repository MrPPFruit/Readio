import { embed, embedMany } from 'ai';
import { aiStore } from './storage/aiStore';
import { estimateAIIndexBytes } from './storage/estimate';
import { buildEntitySidecarForChunks } from './entitySidecar';
import { CHUNKER_VERSION, chunkText, extractTextFromDocument } from './utils/chunker';
import { withRetryAndTimeout, AI_TIMEOUTS, AI_RETRY_CONFIGS } from './utils/retry';
import { AI_PROVIDER_CATALOG } from './constants';
import { getAIProvider } from './providers';
import { aiLogger } from './logger';
import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
import {
  BM25_VERSION,
  getCurrentPageContextChunks,
  getCurrentSectionSummaryChunks as getBM25CurrentSectionSummaryChunks,
} from './search/bm25';
import { getTocDisplayLabel } from '@/services/nav';
import type {
  AISettings,
  TextChunk,
  ScoredChunk,
  EmbeddingProgress,
  BookIndexMeta,
  IndexingState,
} from './types';

type IndexBookJob = {
  promise: Promise<void>;
  controller: AbortController;
  indexKey: string;
};

interface SectionItem {
  id: string;
  size: number;
  linear: string;
  cfi?: string;
  href?: string;
  createDocument: () => Promise<Document>;
  loadText?: () => Promise<string | null>;
}

interface TOCItem {
  id: number;
  label: string;
  href?: string;
  subitems?: TOCItem[];
}

export interface BookDocType {
  sections?: SectionItem[];
  toc?: TOCItem[];
  metadata?: { title?: string | { [key: string]: string }; author?: string | { name?: string } };
}

export const INDEX_VERSION = 3;
export const BM25_ONLY_EMBEDDING_MODEL = 'bm25-only';

interface IndexIdentity {
  indexVersion: number;
  chunkerVersion: number;
  bm25Version: number;
  embeddingModel: string;
}

const indexingStates = new Map<string, IndexingState>();
const indexingJobs = new Map<string, IndexBookJob>();

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException('Aborted', 'AbortError');
}

function getEmbeddingModelName(settings?: AISettings): string {
  if (!settings) return BM25_ONLY_EMBEDDING_MODEL;
  return settings.providerEmbeddingModels?.[settings.provider] || BM25_ONLY_EMBEDDING_MODEL;
}

function getIndexIdentity(settings?: AISettings): IndexIdentity {
  return {
    indexVersion: INDEX_VERSION,
    chunkerVersion: CHUNKER_VERSION,
    bm25Version: BM25_VERSION,
    embeddingModel: getEmbeddingModelName(settings),
  };
}

function getIndexJobKey(bookHash: string, settings: AISettings): string {
  const identity = getIndexIdentity(settings);
  return [
    bookHash,
    identity.indexVersion,
    identity.chunkerVersion,
    identity.bm25Version,
    identity.embeddingModel,
  ].join(':');
}

function isBookIndexMetaCurrent(meta: BookIndexMeta | null, settings?: AISettings): boolean {
  if (!meta || meta.totalChunks <= 0) return false;
  const identity = getIndexIdentity(settings);
  if (meta.indexVersion !== identity.indexVersion) return false;
  if (meta.chunkerVersion !== identity.chunkerVersion) return false;
  if (meta.bm25Version !== identity.bm25Version) return false;
  if (
    settings &&
    meta.embeddingModel !== identity.embeddingModel &&
    meta.embeddingModel !== BM25_ONLY_EMBEDDING_MODEL
  )
    return false;
  return true;
}

export async function isBookIndexed(bookHash: string, settings?: AISettings): Promise<boolean> {
  const meta = await aiStore.getMeta(bookHash);
  const indexed = isBookIndexMetaCurrent(meta, settings);
  aiLogger.rag.isIndexed(bookHash, indexed);
  return indexed;
}

function extractTitle(metadata?: BookDocType['metadata']): string {
  if (!metadata?.title) return 'Unknown Book';
  if (typeof metadata.title === 'string') return metadata.title;
  return (
    metadata.title['en'] ||
    metadata.title['default'] ||
    Object.values(metadata.title)[0] ||
    'Unknown Book'
  );
}

function extractAuthor(metadata?: BookDocType['metadata']): string {
  if (!metadata?.author) return 'Unknown Author';
  if (typeof metadata.author === 'string') return metadata.author;
  return metadata.author.name || 'Unknown Author';
}

function getSectionTocItems(toc: TOCItem[] | undefined, sectionIndex: number): TOCItem[] {
  if (!toc?.length) return [];
  const items: TOCItem[] = [];
  const walk = (tocItems: TOCItem[]) => {
    for (const item of tocItems) {
      items.push(item);
      if (item.subitems?.length) walk(item.subitems);
    }
  };
  walk(toc);
  return items.filter((item) => item.id <= sectionIndex).sort((a, b) => a.id - b.id);
}

function getChapterTitle(
  toc: TOCItem[] | undefined,
  sectionIndex: number,
  sectionHref?: string,
): string {
  const candidates = getSectionTocItems(toc, sectionIndex);
  if (candidates.length === 0) return `Section ${sectionIndex + 1}`;
  if (sectionHref) {
    const hrefMatch = [...candidates]
      .reverse()
      .find((item) => item.href?.split('#')[0] === sectionHref);
    if (hrefMatch) return getTocDisplayLabel(toc, hrefMatch) ?? hrefMatch.label;
  }
  const sectionItem = candidates[candidates.length - 1];
  if (!sectionItem) return `Section ${sectionIndex + 1}`;
  return getTocDisplayLabel(toc, sectionItem) ?? sectionItem.label;
}

interface IndexBookOptions {
  onProgress?: (progress: EmbeddingProgress) => void;
  signal?: AbortSignal;
}

export async function indexBook(
  bookDoc: BookDocType,
  bookHash: string,
  settings: AISettings,
  options: IndexBookOptions = {},
): Promise<void> {
  const { onProgress, signal } = options;
  throwIfAborted(signal);
  const indexKey = getIndexJobKey(bookHash, settings);
  const existingJob = indexingJobs.get(bookHash);
  if (existingJob) {
    if (existingJob.indexKey === indexKey) return existingJob.promise;
    await existingJob.promise.catch((error) => {
      if ((error as Error).name !== 'AbortError') throw error;
    });
    throwIfAborted(signal);
    return indexBook(bookDoc, bookHash, settings, { onProgress, signal });
  }

  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const promise = runIndexBook(bookDoc, bookHash, settings, onProgress, controller.signal).finally(
    () => {
      if (indexingJobs.get(bookHash)?.promise === promise) {
        indexingJobs.delete(bookHash);
      }
    },
  );
  indexingJobs.set(bookHash, { promise, controller, indexKey });
  return promise;
}

async function runIndexBook(
  bookDoc: BookDocType,
  bookHash: string,
  settings: AISettings,
  onProgress?: (progress: EmbeddingProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const startTime = Date.now();
  const title = extractTitle(bookDoc.metadata);

  const existingMeta = await aiStore.getMeta(bookHash);
  if (isBookIndexMetaCurrent(existingMeta, settings)) {
    aiLogger.rag.isIndexed(bookHash, true);
    return;
  }
  if (existingMeta) {
    await aiStore.clearBook(bookHash);
  }
  throwIfAborted(signal);

  aiLogger.rag.indexStart(bookHash, title);
  const sections = bookDoc.sections || [];
  const toc = bookDoc.toc || [];

  // calculate cumulative character sizes like toc.ts does
  const sizes = sections.map((s) => (s.linear !== 'no' && s.size > 0 ? s.size : 0));
  let cumulative = 0;
  const cumulativeSizes = sizes.map((size) => {
    const current = cumulative;
    cumulative += size;
    return current;
  });

  const state: IndexingState = {
    bookHash,
    status: 'indexing',
    progress: 0,
    chunksProcessed: 0,
    totalChunks: 0,
  };
  indexingStates.set(bookHash, state);
  let persistenceStarted = false;
  let persistenceComplete = false;

  try {
    throwIfAborted(signal);
    onProgress?.({ current: 0, total: 1, phase: 'chunking' });
    aiLogger.rag.indexProgress('chunking', 0, sections.length);
    const allChunks: TextChunk[] = [];

    for (let i = 0; i < sections.length; i++) {
      throwIfAborted(signal);
      const section = sections[i]!;
      try {
        const doc = await section.createDocument();
        throwIfAborted(signal);
        const text = extractTextFromDocument(doc);
        if (text.length < 100) continue;
        const sectionChunks = chunkText(
          text,
          i,
          getChapterTitle(toc, i, section.href),
          bookHash,
          cumulativeSizes[i] ?? 0,
        ).map((chunk) => ({
          ...chunk,
          ...(section.cfi ? { cfi: section.cfi } : {}),
          ...(section.href ? { href: section.href } : {}),
        }));
        throwIfAborted(signal);
        aiLogger.chunker.section(i, text.length, sectionChunks.length);
        allChunks.push(...sectionChunks);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || signal?.aborted) throw e;
        aiLogger.chunker.error(i, (e as Error).message);
      }
    }

    throwIfAborted(signal);
    aiLogger.chunker.complete(bookHash, allChunks.length);
    state.totalChunks = allChunks.length;

    if (allChunks.length === 0) {
      state.status = 'complete';
      state.progress = 100;
      aiLogger.rag.indexComplete(bookHash, 0, Date.now() - startTime);
      return;
    }

    throwIfAborted(signal);
    onProgress?.({ current: 0, total: allChunks.length, phase: 'embedding' });
    const embeddingModelName = getEmbeddingModelName(settings);
    aiLogger.embedding.start(embeddingModelName, allChunks.length);

    const texts = allChunks.map((c) => c.text);
    let savedEmbeddingModelName = embeddingModelName;
    if (settings.providerEmbeddingModels?.[settings.provider]) {
      try {
        const provider = getAIProvider(settings);
        const { embeddings } = await withRetryAndTimeout(
          () =>
            embedMany({
              model: provider.getEmbeddingModel(),
              values: texts,
            }),
          AI_TIMEOUTS.EMBEDDING_BATCH,
          AI_RETRY_CONFIGS.EMBEDDING,
        );
        throwIfAborted(signal);

        for (let i = 0; i < allChunks.length; i++) {
          throwIfAborted(signal);
          allChunks[i]!.embedding = embeddings[i];
          state.chunksProcessed = i + 1;
          state.progress = Math.round(((i + 1) / allChunks.length) * 100);
        }
        aiLogger.embedding.complete(
          embeddings.length,
          allChunks.length,
          embeddings[0]?.length || 0,
        );
      } catch (e) {
        aiLogger.embedding.error('batch', (e as Error).message);
        savedEmbeddingModelName = BM25_ONLY_EMBEDDING_MODEL;
      }
    }
    state.chunksProcessed = allChunks.length;
    state.progress = 100;
    onProgress?.({ current: allChunks.length, total: allChunks.length, phase: 'embedding' });

    throwIfAborted(signal);
    onProgress?.({ current: 0, total: 2, phase: 'indexing' });
    throwIfAborted(signal);
    persistenceStarted = true;
    aiLogger.store.saveChunks(bookHash, allChunks.length);
    await aiStore.saveChunks(allChunks);

    throwIfAborted(signal);
    onProgress?.({ current: 1, total: 2, phase: 'indexing' });
    throwIfAborted(signal);
    aiLogger.store.saveBM25(bookHash);
    await aiStore.saveBM25Index(bookHash, allChunks);

    throwIfAborted(signal);
    await buildAndSaveEntitySidecar(bookHash, allChunks);

    throwIfAborted(signal);
    const meta: BookIndexMeta = {
      bookHash,
      bookTitle: title,
      authorName: extractAuthor(bookDoc.metadata),
      totalSections: sections.length,
      totalChunks: allChunks.length,
      embeddingModel: savedEmbeddingModelName,
      indexVersion: INDEX_VERSION,
      chunkerVersion: CHUNKER_VERSION,
      bm25Version: BM25_VERSION,
      estimatedBytes: 0,
      lastUpdated: Date.now(),
    };
    meta.estimatedBytes = estimateAIIndexBytes(allChunks, meta);
    throwIfAborted(signal);
    aiLogger.store.saveMeta(meta);
    await aiStore.saveMeta(meta);
    throwIfAborted(signal);
    persistenceComplete = true;

    onProgress?.({ current: 2, total: 2, phase: 'indexing' });
    state.status = 'complete';
    state.progress = 100;
    aiLogger.rag.indexComplete(bookHash, allChunks.length, Date.now() - startTime);
  } catch (error) {
    if (persistenceStarted && !persistenceComplete) {
      await aiStore.clearBook(bookHash);
    }
    state.status = 'error';
    state.error = (error as Error).message;
    aiLogger.rag.indexError(bookHash, (error as Error).message);
    throw error;
  }
}

async function buildAndSaveEntitySidecar(bookHash: string, chunks: TextChunk[]): Promise<void> {
  const startedAt = Date.now();
  try {
    const sidecar = buildEntitySidecarForChunks(chunks);
    await aiStore.saveEntitySidecar(bookHash, sidecar);
    await logDiagnosticEvent('reader_ai.entity_sidecar_built', 'debug', {
      aliasCount: sidecar.meta.aliasCount,
      factCount: sidecar.meta.factCount,
      chunkCount: sidecar.meta.chunkCount,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    await logDiagnosticError('reader_ai.entity_sidecar_failed', error, { operation: 'build' });
  }
}

export async function getCurrentSectionContextChunks(
  bookHash: string,
  currentPage: number,
  topK = 2,
): Promise<ScoredChunk[]> {
  const chunks = await aiStore.getChunks(bookHash);
  return getCurrentPageContextChunks(chunks, currentPage, topK);
}

export async function getCurrentSectionSummaryChunks(
  bookHash: string,
  currentPage: number,
  topK = 4,
): Promise<ScoredChunk[]> {
  const chunks = await aiStore.getChunks(bookHash);
  return getBM25CurrentSectionSummaryChunks(chunks, currentPage, topK);
}

export async function hybridSearch(
  bookHash: string,
  query: string,
  settings: AISettings,
  topK = 10,
  maxPage?: number,
): Promise<ScoredChunk[]> {
  aiLogger.search.query(query, maxPage);
  let queryEmbedding: number[] | null = null;

  if (
    settings.provider in AI_PROVIDER_CATALOG &&
    settings.providerEmbeddingModels?.[settings.provider]
  ) {
    try {
      const provider = getAIProvider(settings);
      const { embedding } = await withRetryAndTimeout(
        () =>
          embed({
            model: provider.getEmbeddingModel(),
            value: query,
          }),
        AI_TIMEOUTS.EMBEDDING_SINGLE,
        AI_RETRY_CONFIGS.EMBEDDING,
      );
      queryEmbedding = embedding;
    } catch {
      // bm25 only fallback
    }
  }

  const results = await aiStore.hybridSearch(bookHash, queryEmbedding, query, topK, maxPage);
  aiLogger.search.hybridResults(results.length, [...new Set(results.map((r) => r.searchMethod))]);
  return results;
}

export async function clearBookIndex(bookHash: string): Promise<void> {
  aiLogger.store.clear(bookHash);
  await aiStore.clearBook(bookHash);
  indexingStates.delete(bookHash);
}
