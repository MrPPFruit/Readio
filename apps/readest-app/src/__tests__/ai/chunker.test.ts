import { describe, test, expect, vi } from 'vitest';

// mock the types module to avoid import issues
vi.mock('../types', () => ({
  TextChunk: {},
}));

import {
  extractTextFromDocument,
  chunkSection,
  chunkText,
  SIZE_PER_PAGE,
} from '@/services/ai/utils/chunker';

describe('AI Chunker', () => {
  const createDocument = (html: string): Document => {
    const parser = new DOMParser();
    return parser.parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
  };

  describe('extractTextFromDocument', () => {
    test('should extract text from simple HTML', () => {
      const doc = createDocument('<p>Hello world</p>');
      const text = extractTextFromDocument(doc);
      expect(text).toBe('Hello world');
    });

    test('should remove script and style tags', () => {
      const doc = createDocument(`
        <p>Visible text</p>
        <script>console.log('ignored')</script>
        <style>.hidden { display: none; }</style>
        <p>More text</p>
      `);
      const text = extractTextFromDocument(doc);
      expect(text).toContain('Visible text');
      expect(text).toContain('More text');
      expect(text).not.toContain('console.log');
      expect(text).not.toContain('.hidden');
    });

    test('should handle empty document', () => {
      const doc = createDocument('');
      const text = extractTextFromDocument(doc);
      expect(text).toBe('');
    });

    test('should trim whitespace', () => {
      const doc = createDocument('   <p>  Text with spaces  </p>   ');
      const text = extractTextFromDocument(doc);
      expect(text).toBe('Text with spaces');
    });
  });

  describe('chunkSection', () => {
    const bookHash = 'test-hash';
    const sectionIndex = 0;
    const chapterTitle = 'Chapter 1';

    test('should chunk already extracted text without re-reading the DOM', () => {
      const chunks = chunkText(
        'Readable content. '.repeat(80),
        sectionIndex,
        chapterTitle,
        bookHash,
        0,
      );

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]!.bookHash).toBe(bookHash);
    });

    test('should create single chunk for short text', () => {
      const doc = createDocument('<p>Short text that is less than max chunk size.</p>');
      const chunks = chunkSection(doc, sectionIndex, chapterTitle, bookHash, 0);

      expect(chunks.length).toBe(1);
      expect(chunks[0]!.id).toBe(`${bookHash}-${sectionIndex}-0`);
      expect(chunks[0]!.bookHash).toBe(bookHash);
      expect(chunks[0]!.sectionIndex).toBe(sectionIndex);
      expect(chunks[0]!.chapterTitle).toBe(chapterTitle);
    });

    test('should split long text into multiple chunks', () => {
      const longText = 'Lorem ipsum dolor sit amet. '.repeat(50);
      const doc = createDocument(`<p>${longText}</p>`);
      const chunks = chunkSection(doc, sectionIndex, chapterTitle, bookHash, 0);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk, i) => {
        expect(chunk.id).toBe(`${bookHash}-${sectionIndex}-${i}`);
      });
    });

    test('should return empty array for empty document', () => {
      const doc = createDocument('');
      const chunks = chunkSection(doc, sectionIndex, chapterTitle, bookHash, 0);
      expect(chunks).toEqual([]);
    });

    test('should include stable offsets and page span metadata for every chunk', () => {
      const cumulativeSize = SIZE_PER_PAGE * 2 + 25;
      const chunks = chunkText(
        'Readable content with repeated context. '.repeat(80),
        sectionIndex,
        chapterTitle,
        bookHash,
        cumulativeSize,
      );

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk, index) => {
        expect(chunk.chunkIndex).toBe(index);
        expect(chunk.startOffset).toBeTypeOf('number');
        expect(chunk.endOffset).toBeTypeOf('number');
        expect(chunk.charCount).toBe(chunk.text.length);
        expect(chunk.sortIndex).toBe(cumulativeSize + chunk.startOffset!);
        expect(chunk.pageNumber).toBe(
          Math.floor((cumulativeSize + chunk.startOffset!) / SIZE_PER_PAGE),
        );
        expect(chunk.endPageNumber).toBe(
          Math.floor((cumulativeSize + Math.max(0, chunk.endOffset! - 1)) / SIZE_PER_PAGE),
        );
        expect(chunk.startOffset!).toBeGreaterThanOrEqual(0);
        expect(chunk.endOffset!).toBeGreaterThan(chunk.startOffset!);
      });
    });

    test('should keep a chunk ending exactly on a page boundary within the previous page', () => {
      const text = 'A'.repeat(SIZE_PER_PAGE);
      const chunks = chunkText(text, sectionIndex, chapterTitle, bookHash, 0, {
        maxChunkSize: SIZE_PER_PAGE,
        overlapSize: 0,
        minChunkSize: 50,
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.pageNumber).toBe(0);
      expect(chunks[0]!.endOffset).toBe(SIZE_PER_PAGE);
      expect(chunks[0]!.endPageNumber).toBe(0);
    });

    test('should update metadata when merging a short final remainder', () => {
      const text = `${'A'.repeat(140)}tail`;
      const chunks = chunkText(text, sectionIndex, chapterTitle, bookHash, 0, {
        maxChunkSize: 140,
        overlapSize: 0,
        minChunkSize: 50,
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.text).toContain('tail');
      expect(chunks[0]!.endOffset).toBe(text.length);
      expect(chunks[0]!.charCount).toBe(chunks[0]!.text.length);
      expect(chunks[0]!.endPageNumber).toBe(Math.floor(text.length / SIZE_PER_PAGE));
    });

    test('should include metadata on short single chunks', () => {
      const text = 'Short text that is less than max chunk size.';
      const chunks = chunkText(text, sectionIndex, chapterTitle, bookHash, 10);

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({
        startOffset: 0,
        endOffset: text.length,
        charCount: text.length,
        endPageNumber: 0,
        chunkIndex: 0,
      });
    });

    test('should respect custom chunk options', () => {
      const longText = 'Word '.repeat(100);
      const doc = createDocument(`<p>${longText}</p>`);
      const chunks = chunkSection(doc, sectionIndex, chapterTitle, bookHash, 0, {
        maxChunkSize: 100,
        minChunkSize: 20,
      });

      expect(chunks.length).toBeGreaterThan(1);
      // all chunks except last should be close to maxChunkSize
      chunks.slice(0, -1).forEach((chunk) => {
        expect(chunk.text.length).toBeLessThanOrEqual(150); // allow some flexibility for break points
      });
    });
  });
});
