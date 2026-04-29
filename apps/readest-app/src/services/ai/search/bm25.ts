import type { Index } from 'lunr';
import type { ScoredChunk, TextChunk } from '../types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lunr = require('lunr') as typeof import('lunr');

const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
const CJK_RUN_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]+/g;
const WORD_PATTERN = /[a-zA-Z0-9_]+/g;

const tokenizeCjkRun = (value: string): string[] => {
  const tokens = new Set<string>();
  for (let i = 0; i < value.length; i++) {
    if (i + 2 <= value.length) tokens.add(value.slice(i, i + 2));
    if (i + 3 <= value.length) tokens.add(value.slice(i, i + 3));
  }
  return [...tokens];
};

export const tokenizeSearchText = (value: string): string[] => {
  const tokens = new Set<string>();
  for (const match of value.matchAll(CJK_RUN_PATTERN)) {
    for (const token of tokenizeCjkRun(match[0])) tokens.add(token);
  }
  for (const match of value.matchAll(WORD_PATTERN)) tokens.add(match[0].toLowerCase());
  return [...tokens];
};

export const createBM25Index = (chunks: TextChunk[]): Index =>
  lunr(function (this: lunr.Builder) {
    this.ref('id');
    this.field('text');
    this.field('chapterTitle');
    this.pipeline.remove(lunr.stemmer);
    this.searchPipeline.remove(lunr.stemmer);
    for (const chunk of chunks) {
      this.add({ id: chunk.id, text: chunk.text, chapterTitle: chunk.chapterTitle });
    }
  });

const CURRENT_PAGE_CONTEXT_WINDOW = 2;

const getChunkOrder = (chunk: TextChunk, fallback: number): number => {
  const match = chunk.id.match(/-(\d+)$/);
  return match ? Number(match[1]) : fallback;
};

export const getCurrentPageContextChunks = (
  chunks: TextChunk[],
  currentPage: number,
  topK = 2,
): ScoredChunk[] => {
  const readableChunks = chunks
    .map((chunk, index) => ({ chunk, index }))
    .filter(({ chunk }) => chunk.pageNumber <= currentPage);
  if (readableChunks.length === 0) return [];

  const currentSectionIndex = readableChunks.reduce((latest, candidate) =>
    candidate.chunk.sectionIndex > latest.chunk.sectionIndex ? candidate : latest,
  ).chunk.sectionIndex;
  const sectionChunks = readableChunks.filter(
    ({ chunk }) => chunk.sectionIndex === currentSectionIndex,
  );
  const windowStart = currentPage - CURRENT_PAGE_CONTEXT_WINDOW;
  const windowChunks = sectionChunks.filter(({ chunk }) => chunk.pageNumber >= windowStart);

  return (windowChunks.length > 0 ? windowChunks : sectionChunks)
    .sort(
      (a, b) =>
        a.chunk.pageNumber - b.chunk.pageNumber ||
        getChunkOrder(a.chunk, a.index) - getChunkOrder(b.chunk, b.index) ||
        a.index - b.index,
    )
    .slice(0, topK)
    .map(({ chunk }) => ({ ...chunk, score: 1, searchMethod: 'bm25' as const }));
};

const lexicalChineseSearch = (
  chunks: TextChunk[],
  query: string,
  topK: number,
  maxPage?: number,
): ScoredChunk[] => {
  const tokens = tokenizeSearchText(query);
  if (tokens.length === 0) return [];

  return chunks
    .flatMap((chunk) => {
      if (maxPage !== undefined && chunk.pageNumber > maxPage) return [];
      const text = `${chunk.chapterTitle}\n${chunk.text}`.toLowerCase();
      const score = tokens.reduce(
        (total, token) => total + (text.includes(token.toLowerCase()) ? token.length : 0),
        0,
      );
      return score > 0 ? [{ ...chunk, score, searchMethod: 'bm25' as const }] : [];
    })
    .sort((a, b) => b.score - a.score || b.pageNumber - a.pageNumber)
    .slice(0, topK);
};

export const searchBM25Index = (
  index: Index,
  chunks: TextChunk[],
  query: string,
  topK: number,
  maxPage?: number,
): ScoredChunk[] => {
  if (CJK_PATTERN.test(query)) {
    const chineseResults = lexicalChineseSearch(chunks, query, topK, maxPage);
    if (chineseResults.length > 0) return chineseResults;
  }

  const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const results = index.search(query);
  const scored: ScoredChunk[] = [];
  for (const result of results) {
    const chunk = chunkMap.get(result.ref);
    if (!chunk) continue;
    if (maxPage !== undefined && chunk.pageNumber > maxPage) continue;
    scored.push({ ...chunk, score: result.score, searchMethod: 'bm25' });
    if (scored.length >= topK) break;
  }
  return scored;
};
