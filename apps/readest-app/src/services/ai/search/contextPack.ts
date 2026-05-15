import type { ScoredChunk } from '../types';
import { isChunkWithinPageBoundary, tokenizeSearchText } from './bm25';

export interface PackReaderContextOptions {
  question: string;
  chunks: ScoredChunk[];
  currentPage: number;
  maxContextChunks: number;
  spoilerProtection: boolean;
  selectionText?: string;
}

const MIN_INFORMATION_CHARS = 6;

const normalizeTextKey = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 160);

const countTokenMatches = (tokens: string[], value: string): number => {
  const normalized = value.toLowerCase();
  return tokens.reduce(
    (total, token) => total + (normalized.includes(token.toLowerCase()) ? 1 : 0),
    0,
  );
};

export function packReaderContext({
  question,
  chunks,
  currentPage,
  maxContextChunks,
  spoilerProtection,
  selectionText,
}: PackReaderContextOptions): ScoredChunk[] {
  const seenIds = new Set<string>();
  const seenTexts = new Set<string>();
  const uniqueChunks: ScoredChunk[] = [];

  for (const chunk of chunks) {
    if (spoilerProtection && !isChunkWithinPageBoundary(chunk, currentPage)) continue;
    if (seenIds.has(chunk.id)) continue;

    const textKey = normalizeTextKey(chunk.text);
    if (!textKey || seenTexts.has(textKey)) continue;

    seenIds.add(chunk.id);
    seenTexts.add(textKey);
    uniqueChunks.push(chunk);
  }

  const informativeChunks = uniqueChunks.filter(
    (chunk) => chunk.text.trim().length >= MIN_INFORMATION_CHARS,
  );
  const candidates = informativeChunks.length > 0 ? informativeChunks : uniqueChunks;
  const queryTokens = tokenizeSearchText(question);
  const selectionTokens = selectionText ? tokenizeSearchText(selectionText) : [];

  return candidates
    .map((chunk, index) => {
      const combinedText = `${chunk.chapterTitle}\n${chunk.text}`;
      const queryMatches = countTokenMatches(queryTokens, combinedText);
      const selectionMatches = countTokenMatches(selectionTokens, combinedText);
      const proximity = Math.max(0, 1 - Math.abs(currentPage - chunk.pageNumber) / 20);
      const shortPenalty = chunk.text.trim().length < 20 ? 0.2 : 0;
      const packedScore =
        chunk.score +
        queryMatches * 0.18 +
        selectionMatches * 0.12 +
        proximity * 0.05 -
        shortPenalty;
      return { chunk, packedScore, index };
    })
    .sort(
      (a, b) =>
        b.packedScore - a.packedScore ||
        b.chunk.score - a.chunk.score ||
        (a.chunk.sortIndex ?? a.chunk.pageNumber) - (b.chunk.sortIndex ?? b.chunk.pageNumber) ||
        a.index - b.index,
    )
    .slice(0, maxContextChunks)
    .map(({ chunk }) => chunk);
}
