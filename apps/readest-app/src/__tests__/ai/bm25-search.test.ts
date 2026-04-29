import { describe, expect, it } from 'vitest';

import {
  createBM25Index,
  getCurrentPageContextChunks,
  searchBM25Index,
} from '@/services/ai/search/bm25';
import type { TextChunk } from '@/services/ai/types';

const chunks: TextChunk[] = [
  {
    id: 'book-1-0',
    bookHash: 'book',
    sectionIndex: 1,
    chapterTitle: '第五十八章 压制',
    pageNumber: 4052,
    text: '白银城，伯格家。戴里克点亮蜡烛，准备起献祭仪式。克莱恩在灰雾之上回应。',
  },
  {
    id: 'book-2-0',
    bookHash: 'book',
    sectionIndex: 2,
    chapterTitle: '其他章节',
    pageNumber: 4053,
    text: '奥德拉家地下区域，埃姆林拿到了奖励。',
  },
];

describe('BM25 search for Chinese reader content', () => {
  it('matches Chinese character names and locations without embeddings', () => {
    const index = createBM25Index(chunks);

    const results = searchBM25Index(index, chunks, '戴里克在白银城发生了什么？', 3, 4054);

    expect(results[0]).toMatchObject({
      id: 'book-1-0',
      chapterTitle: '第五十八章 压制',
      searchMethod: 'bm25',
    });
  });

  it('prefers the beginning of the current page window over later chunks on the same page', () => {
    const pageChunks: TextChunk[] = [
      {
        id: 'book-546-1',
        bookHash: 'book',
        sectionIndex: 546,
        chapterTitle: '第五十八章 压制',
        pageNumber: 4052,
        text: '白银城，伯格家。戴里克点亮蜡烛，准备起献祭仪式。',
      },
      {
        id: 'book-546-5',
        bookHash: 'book',
        sectionIndex: 546,
        chapterTitle: '第五十八章 压制',
        pageNumber: 4054,
        text: '卡维图瓦即将失控，风暴教会正在压制灾难。',
      },
      {
        id: 'book-546-6',
        bookHash: 'book',
        sectionIndex: 546,
        chapterTitle: '第五十八章 压制',
        pageNumber: 4054,
        text: '亚恩考特曼改变天气，压制了海神的力量。',
      },
    ];

    const results = getCurrentPageContextChunks(pageChunks, 4054, 2);

    expect(results.map((result) => result.id)).toEqual(['book-546-1', 'book-546-5']);
  });
});
