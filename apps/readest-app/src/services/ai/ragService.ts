import { embed, embedMany } from 'ai';
import { aiStore } from './storage/aiStore';
import { chunkSection, extractTextFromDocument } from './utils/chunker';
import { withRetryAndTimeout, AI_TIMEOUTS, AI_RETRY_CONFIGS } from './utils/retry';
import { AI_PROVIDER_CATALOG } from './constants';
import { getAIProvider } from './providers';
import { aiLogger } from './logger';
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
};

interface SectionItem {
  id: string;
  size: number;
  linear: string;
  createDocument: () => Promise<Document>;
}

interface TOCItem {
  id: number;
  label: string;
  href?: string;
}

export interface BookDocType {
  sections?: SectionItem[];
  toc?: TOCItem[];
  metadata?: { title?: string | { [key: string]: string }; author?: string | { name?: string } };
}

const indexingStates = new Map<string, IndexingState>();
const indexingJobs = new Map<string, IndexBookJob>();

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException('Aborted', 'AbortError');
}

export async function isBookIndexed(bookHash: string): Promise<boolean> {
  const indexed = await aiStore.isIndexed(bookHash);
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

function getChapterTitle(toc: TOCItem[] | undefined, sectionIndex: number): string {
  if (!toc || toc.length === 0) return `Section ${sectionIndex + 1}`;
  for (let i = toc.length - 1; i >= 0; i--) {
    if (toc[i]!.id <= sectionIndex) return toc[i]!.label;
  }
  return toc[0]?.label || `Section ${sectionIndex + 1}`;
}

export async function indexBook(
  bookDoc: BookDocType,
  bookHash: string,
  settings: AISettings,
  onProgress?: (progress: EmbeddingProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const existingJob = indexingJobs.get(bookHash);
  if (existingJob) return existingJob.promise;

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
  indexingJobs.set(bookHash, { promise, controller });
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

  if (await aiStore.isIndexed(bookHash)) {
    aiLogger.rag.isIndexed(bookHash, true);
    return;
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
        const sectionChunks = chunkSection(
          doc,
          i,
          getChapterTitle(toc, i),
          bookHash,
          cumulativeSizes[i] ?? 0,
        );
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
    const embeddingModelName = settings.providerEmbeddingModels?.[settings.provider] || 'bm25-only';
    aiLogger.embedding.start(embeddingModelName, allChunks.length);

    const texts = allChunks.map((c) => c.text);
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
    const meta: BookIndexMeta = {
      bookHash,
      bookTitle: title,
      authorName: extractAuthor(bookDoc.metadata),
      totalSections: sections.length,
      totalChunks: allChunks.length,
      embeddingModel: embeddingModelName,
      lastUpdated: Date.now(),
    };
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
