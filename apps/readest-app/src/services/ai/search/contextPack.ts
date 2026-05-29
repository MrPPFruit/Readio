import type { ScoredChunk } from '../types';
import { isChunkWithinPageBoundary, tokenizeSearchText } from './bm25';

export interface PackReaderContextOptions {
  question: string;
  chunks: ScoredChunk[];
  currentPage: number;
  maxContextChunks: number;
  spoilerProtection: boolean;
  selectionText?: string;
  preferSectionDiversity?: boolean;
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

const selectDiverseSections = <T extends { chunk: ScoredChunk }>(
  ranked: T[],
  maxContextChunks: number,
): T[] => {
  const selected: T[] = [];
  const selectedIndexes = new Set<number>();
  const usedSections = new Set<string>();

  for (let round = 0; selected.length < maxContextChunks; round += 1) {
    let addedThisRound = false;

    for (let index = 0; index < ranked.length && selected.length < maxContextChunks; index += 1) {
      if (selectedIndexes.has(index)) continue;
      const entry = ranked[index]!;
      const sectionKey = `${entry.chunk.sectionIndex}:${entry.chunk.chapterTitle}`;
      if (round === 0 && usedSections.has(sectionKey)) continue;

      selected.push(entry);
      selectedIndexes.add(index);
      usedSections.add(sectionKey);
      addedThisRound = true;
    }

    if (!addedThisRound) break;
  }

  return selected;
};

export function packReaderContext({
  question,
  chunks,
  currentPage,
  maxContextChunks,
  spoilerProtection,
  selectionText,
  preferSectionDiversity = false,
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

  const ranked = candidates
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
    );

  const selected = preferSectionDiversity
    ? selectDiverseSections(ranked, maxContextChunks)
    : ranked.slice(0, maxContextChunks);

  return selected.map(({ chunk }) => chunk);
}
