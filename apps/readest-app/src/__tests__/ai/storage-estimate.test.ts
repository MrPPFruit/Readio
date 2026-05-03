import { describe, expect, it } from 'vitest';

import { estimateAIIndexBytes } from '@/services/ai/storage/estimate';
import type { TextChunk } from '@/services/ai/types';

const chunks: TextChunk[] = [
  {
    id: 'book-0-0',
    bookHash: 'book',
    sectionIndex: 0,
    chapterTitle: '第一章',
    text: '克莱恩看见灰雾之上出现新的线索。',
    pageNumber: 1,
  },
  {
    id: 'book-0-1',
    bookHash: 'book',
    sectionIndex: 0,
    chapterTitle: '第一章',
    text: 'Readable content with latin words.',
    embedding: [0.1, 0.2, 0.3, 0.4],
    pageNumber: 1,
  },
];

describe('estimateAIIndexBytes', () => {
  it('includes text, metadata, BM25, and embedding storage in the estimate', () => {
    const estimatedBytes = estimateAIIndexBytes(chunks);

    expect(estimatedBytes).toBeGreaterThan(0);
    expect(estimatedBytes).toBeGreaterThan(new TextEncoder().encode(chunks[0]!.text).length);
  });

  it('does not add embedding bytes for BM25-only chunks', () => {
    const bm25OnlyBytes = estimateAIIndexBytes(
      chunks.map(({ embedding: _embedding, ...chunk }) => chunk),
    );
    const hybridBytes = estimateAIIndexBytes(chunks);

    expect(hybridBytes).toBeGreaterThan(bm25OnlyBytes);
  });
});
