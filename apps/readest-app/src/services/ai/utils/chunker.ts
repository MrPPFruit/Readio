import { TextChunk } from '../types';

export const CHUNKER_VERSION = 3;

// same formula as toc.ts - 1500 chars = 1 page
export const SIZE_PER_PAGE = 1500;

interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  minChunkSize: number;
}

const DEFAULT_OPTIONS: ChunkingOptions = {
  maxChunkSize: 500,
  overlapSize: 50,
  minChunkSize: 100,
};

const getEstimatedPage = (absoluteOffset: number): number =>
  Math.floor(absoluteOffset / SIZE_PER_PAGE);

const getEstimatedEndPage = (cumulativeSizeBeforeSection: number, endOffset: number): number =>
  getEstimatedPage(cumulativeSizeBeforeSection + Math.max(0, endOffset - 1));

const createChunk = (
  text: string,
  sectionIndex: number,
  chapterTitle: string,
  bookHash: string,
  cumulativeSizeBeforeSection: number,
  startOffset: number,
  endOffset: number,
  chunkIndex: number,
): TextChunk => ({
  id: `${bookHash}-${sectionIndex}-${chunkIndex}`,
  bookHash,
  sectionIndex,
  chapterTitle,
  text,
  pageNumber: getEstimatedPage(cumulativeSizeBeforeSection + startOffset),
  sortIndex: cumulativeSizeBeforeSection + startOffset,
  startOffset,
  endOffset,
  charCount: text.length,
  endPageNumber: getEstimatedEndPage(cumulativeSizeBeforeSection, endOffset),
  chunkIndex,
});

export function extractTextFromDocument(doc: Document): string {
  const body = doc.body || doc.documentElement;
  if (!body) return '';
  const clone = body.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('script, style, noscript, nav, header, footer')
    .forEach((el) => el.remove());
  return clone.textContent?.trim() || '';
}

function findBreakPoint(text: string, targetPos: number, searchRange = 50): number {
  const start = Math.max(0, targetPos - searchRange);
  const end = Math.min(text.length, targetPos + searchRange);
  const searchText = text.slice(start, end);

  const paragraphBreak = searchText.lastIndexOf('\n\n');
  if (paragraphBreak !== -1 && paragraphBreak > searchRange / 2) return start + paragraphBreak + 2;

  const sentenceBreak = searchText.lastIndexOf('. ');
  if (sentenceBreak !== -1 && sentenceBreak > searchRange / 2) return start + sentenceBreak + 2;

  const wordBreak = searchText.lastIndexOf(' ');
  if (wordBreak !== -1) return start + wordBreak + 1;

  return targetPos;
}

export function chunkText(
  text: string,
  sectionIndex: number,
  chapterTitle: string,
  bookHash: string,
  cumulativeSizeBeforeSection: number, // total chars in all sections before this one
  options?: Partial<ChunkingOptions>,
): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!text || text.length < opts.minChunkSize) {
    const trimmedText = text.trim();
    return trimmedText
      ? [
          createChunk(
            trimmedText,
            sectionIndex,
            chapterTitle,
            bookHash,
            cumulativeSizeBeforeSection,
            0,
            text.length,
            0,
          ),
        ]
      : [];
  }

  const chunks: TextChunk[] = [];
  let position = 0;
  let chunkIndex = 0;

  while (position < text.length) {
    let chunkEnd = position + opts.maxChunkSize;

    if (chunkEnd >= text.length) {
      const remaining = text.slice(position).trim();
      if (remaining.length >= opts.minChunkSize) {
        chunks.push(
          createChunk(
            remaining,
            sectionIndex,
            chapterTitle,
            bookHash,
            cumulativeSizeBeforeSection,
            position,
            text.length,
            chunkIndex,
          ),
        );
      } else if (chunks.length > 0) {
        const previous = chunks[chunks.length - 1]!;
        previous.text += ' ' + remaining;
        previous.endOffset = text.length;
        previous.charCount = previous.text.length;
        previous.endPageNumber = getEstimatedEndPage(cumulativeSizeBeforeSection, text.length);
      }
      break;
    }

    chunkEnd = findBreakPoint(text, chunkEnd);
    const chunkText = text.slice(position, chunkEnd).trim();

    if (chunkText.length >= opts.minChunkSize) {
      chunks.push(
        createChunk(
          chunkText,
          sectionIndex,
          chapterTitle,
          bookHash,
          cumulativeSizeBeforeSection,
          position,
          chunkEnd,
          chunkIndex,
        ),
      );
      chunkIndex++;
    }

    position = chunkEnd - opts.overlapSize;
  }

  return chunks;
}

export function chunkSection(
  doc: Document,
  sectionIndex: number,
  chapterTitle: string,
  bookHash: string,
  cumulativeSizeBeforeSection: number,
  options?: Partial<ChunkingOptions>,
): TextChunk[] {
  return chunkText(
    extractTextFromDocument(doc),
    sectionIndex,
    chapterTitle,
    bookHash,
    cumulativeSizeBeforeSection,
    options,
  );
}
