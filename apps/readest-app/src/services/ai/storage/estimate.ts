import type { BookIndexMeta, TextChunk } from '../types';

const METADATA_OVERHEAD_BYTES = 1024;
const BM25_OVERHEAD_MULTIPLIER = 1.2;
const EMBEDDING_FLOAT_BYTES = 8;

const textEncoder = new TextEncoder();

const encodedLength = (value: string) => textEncoder.encode(value).length;

export function estimateAIIndexBytes(chunks: TextChunk[], meta?: Partial<BookIndexMeta>): number {
  const chunkTextBytes = chunks.reduce(
    (total, chunk) => total + encodedLength(chunk.text) + encodedLength(chunk.chapterTitle),
    0,
  );
  const embeddingBytes = chunks.reduce(
    (total, chunk) => total + (chunk.embedding?.length ?? 0) * EMBEDDING_FLOAT_BYTES,
    0,
  );
  const bm25Bytes = Math.ceil(chunkTextBytes * BM25_OVERHEAD_MULTIPLIER);
  const metaBytes = meta ? encodedLength(JSON.stringify(meta)) : METADATA_OVERHEAD_BYTES;

  return Math.ceil(chunkTextBytes + embeddingBytes + bm25Bytes + metaBytes);
}
