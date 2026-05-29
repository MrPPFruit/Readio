import { describe, expect, it, vi } from 'vitest';

import {
  buildEntityExpandedQueries,
  buildEntitySidecarForChunks,
  searchEntitySidecar,
} from '@/services/ai/entitySidecar';
import type { EntitySidecarIndex, TextChunk } from '@/services/ai/types';

const installSidecarIndexedDBStub = (): void => {
  const stores = new Map<string, Map<string, unknown>>();
  const db = {
    objectStoreNames: { contains: (name: string) => stores.has(name) },
    createObjectStore: vi.fn((name: string) => {
      stores.set(name, new Map());
      return {
        createIndex: vi.fn(),
      };
    }),
    transaction: vi.fn((storeNames: string | string[]) => {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      const tx = {
        objectStore: vi.fn((name: string) => {
          if (!stores.has(name)) stores.set(name, new Map());
          return {
            put: vi.fn((value: unknown) => {
              const key = (value as { bookHash?: string }).bookHash;
              if (key) stores.get(name)!.set(key, value);
            }),
            get: vi.fn((key: string) => {
              const request = {
                result: stores.get(name)?.get(key),
                onsuccess: null as (() => void) | null,
                onerror: null,
              };
              queueMicrotask(() => request.onsuccess?.());
              return request;
            }),
            delete: vi.fn((key: string) => {
              stores.get(name)!.delete(key);
            }),
            index: vi.fn(() => ({ openCursor: vi.fn(() => ({ onsuccess: null, onerror: null })) })),
          };
        }),
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        error: null,
      };
      names.forEach((name) => {
        if (!stores.has(name)) stores.set(name, new Map());
      });
      queueMicrotask(() => tx.oncomplete?.());
      return tx;
    }),
    close: vi.fn(),
  };
  vi.stubGlobal('indexedDB', {
    open: vi.fn(() => {
      const request = {
        result: db,
        error: null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as ((event: unknown) => void) | null,
      };
      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: request });
        request.onsuccess?.();
      });
      return request;
    }),
  });
};

const chunk = (
  id: string,
  text: string,
  pageNumber: number,
  sectionIndex = pageNumber,
): TextChunk => ({
  id,
  bookHash: 'book-hash',
  sectionIndex,
  chapterTitle: `第${sectionIndex}章`,
  text,
  pageNumber,
  endPageNumber: pageNumber,
  sortIndex: sectionIndex * 100,
});

describe('entity sidecar', () => {
  it('extracts conservative aliases and short facts for a generic entity', () => {
    const sidecar = buildEntitySidecarForChunks([
      chunk('c1', '林澈先生是主角的灰塔导师，曾经教他辨认古老符号。', 3),
      chunk('c2', '林澈（灰塔导师）在夜里救过主角，并提醒他不要相信钟声。', 8),
      chunk('c3', '后来林澈又称灰塔看守者，他似乎忘记了自己为何守在那里。', 12),
    ]);

    const entity = sidecar.entities.find((candidate) =>
      candidate.aliases.some((alias) => alias.text === '林澈'),
    );

    expect(entity).toBeDefined();
    expect(entity?.aliases.map((alias) => alias.text)).toEqual(
      expect.arrayContaining(['林澈', '林澈先生', '灰塔导师', '灰塔看守者']),
    );
    expect(entity?.facts.map((fact) => fact.chunkId)).toEqual(
      expect.arrayContaining(['c1', 'c2', 'c3']),
    );
    expect(entity?.facts.every((fact) => fact.text.length <= 180)).toBe(true);
  });

  it('searches by aliases while respecting page boundaries and returning original chunk ids only', () => {
    const sidecar = buildEntitySidecarForChunks([
      chunk('early', '林澈先生是主角的灰塔导师。', 4),
      chunk('late', '林澈在后文揭示自己曾经守护灰塔。', 30),
    ]);

    const hits = searchEntitySidecar(sidecar, '灰塔导师是谁？', { maxPage: 10, topK: 5 });

    expect(hits.map((hit) => hit.chunkId)).toEqual(['early']);
    expect(hits[0]?.hitType).toBe('alias');
    expect(hits[0]).not.toHaveProperty('text');
  });

  it('does not treat a shared role word as a global alias for unrelated facts', () => {
    const sidecar = buildEntitySidecarForChunks([
      chunk('lin', '林澈先生是主角的老师。', 3),
      chunk('other', '另一位老师周岚在学院里讲授药剂学。', 4),
    ]);

    const hits = searchEntitySidecar(sidecar, '林澈是谁？', { topK: 5 });

    expect(hits.map((hit) => hit.chunkId)).toContain('lin');
    expect(hits.map((hit) => hit.chunkId)).not.toContain('other');
  });

  it('builds expanded queries only from book-derived aliases', () => {
    const sidecar = buildEntitySidecarForChunks([
      chunk('c1', '林澈先生是主角的灰塔导师。', 3),
      chunk('c2', '林澈（灰塔导师）救过主角。', 8),
    ]);
    const hits = searchEntitySidecar(sidecar, '林澈是谁？', { topK: 5 });

    expect(buildEntityExpandedQueries('林澈是谁？', hits)).toEqual(
      expect.arrayContaining(['林澈 林澈先生 灰塔导师']),
    );
  });

  it('indexes numbered artifacts as entities for ordinary reader object recap questions', () => {
    const sidecar = buildEntitySidecarForChunks([
      chunk('quill-intro', '0-08是黑夜女神教会的一件0级封印物，外形是一支古典羽毛笔。', 5),
      chunk('quill-event', '因斯·赞格威尔利用0-08制造巧合，推动廷根市惨案发生。', 16),
    ]);

    const hits = searchEntitySidecar(sidecar, '我忘了0-08是什么东西，它之前做过什么？', {
      topK: 5,
    });

    expect(hits.map((hit) => hit.chunkId)).toEqual(
      expect.arrayContaining(['quill-intro', 'quill-event']),
    );
  });

  it('persists and clears sidecars by book hash', async () => {
    vi.resetModules();
    installSidecarIndexedDBStub();
    const { aiStore } = await import('@/services/ai/storage/aiStore');
    const sidecar: EntitySidecarIndex = buildEntitySidecarForChunks([
      chunk('c1', '林澈先生是主角的灰塔导师。', 3),
    ]);

    await aiStore.saveEntitySidecar('book-hash', sidecar);

    await expect(aiStore.getEntitySidecar('book-hash')).resolves.toMatchObject({
      bookHash: 'book-hash',
    });
    await aiStore.clearEntitySidecar('book-hash');
    await expect(aiStore.getEntitySidecar('book-hash')).resolves.toBeNull();
  });
});
