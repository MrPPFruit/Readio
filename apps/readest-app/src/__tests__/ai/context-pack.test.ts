import { describe, expect, it } from 'vitest';

import { packReaderContext } from '@/services/ai/search/contextPack';
import type { ScoredChunk } from '@/services/ai/types';

const makeChunk = (overrides: Partial<ScoredChunk>): ScoredChunk => ({
  id: 'chunk-1',
  bookHash: 'book',
  sectionIndex: 1,
  chapterTitle: '第一章',
  text: '克莱恩在灰雾之上整理线索。',
  pageNumber: 10,
  endPageNumber: 10,
  score: 0.5,
  searchMethod: 'bm25',
  ...overrides,
});

describe('packReaderContext', () => {
  it('deduplicates chunks by id and normalized text', () => {
    const packed = packReaderContext({
      question: '灰雾线索是什么？',
      chunks: [
        makeChunk({ id: 'duplicate-id', text: '灰雾线索重复内容。', score: 0.9 }),
        makeChunk({ id: 'duplicate-id', text: '灰雾线索重复内容。', score: 0.8 }),
        makeChunk({ id: 'same-text-a', text: '灰雾线索重复内容。', score: 0.7 }),
        makeChunk({ id: 'unique', text: '戴里克准备献祭仪式。', score: 0.6 }),
      ],
      currentPage: 10,
      maxContextChunks: 5,
      spoilerProtection: true,
    });

    expect(packed.map((chunk) => chunk.id)).toEqual(['duplicate-id', 'unique']);
  });

  it('excludes chunks crossing the read boundary when spoiler protection is enabled', () => {
    const packed = packReaderContext({
      question: '发生了什么？',
      chunks: [
        makeChunk({ id: 'safe', pageNumber: 9, endPageNumber: 10, text: '已读范围内的线索。' }),
        makeChunk({ id: 'future', pageNumber: 10, endPageNumber: 12, text: '跨到未读页的线索。' }),
      ],
      currentPage: 10,
      maxContextChunks: 5,
      spoilerProtection: true,
    });

    expect(packed.map((chunk) => chunk.id)).toEqual(['safe']);
  });

  it('uses lexical matches to lift more relevant evidence over generic high-score chunks', () => {
    const packed = packReaderContext({
      question: '戴里克的献祭仪式发生了什么？',
      chunks: [
        makeChunk({
          id: 'generic',
          chapterTitle: '普通章节',
          text: '这里有一些泛泛的剧情描述。',
          score: 0.8,
        }),
        makeChunk({
          id: 'matched',
          chapterTitle: '第五十八章 献祭仪式',
          text: '戴里克点亮蜡烛，准备起献祭仪式。',
          score: 0.55,
        }),
      ],
      currentPage: 10,
      maxContextChunks: 1,
      spoilerProtection: true,
    });

    expect(packed.map((chunk) => chunk.id)).toEqual(['matched']);
  });

  it('drops very short low-information chunks when enough evidence exists', () => {
    const packed = packReaderContext({
      question: '灰雾线索是什么？',
      chunks: [
        makeChunk({ id: 'short', text: '是。', score: 1 }),
        makeChunk({ id: 'evidence', text: '克莱恩在灰雾之上整理了新的线索。', score: 0.5 }),
      ],
      currentPage: 10,
      maxContextChunks: 2,
      spoilerProtection: true,
    });

    expect(packed.map((chunk) => chunk.id)).toEqual(['evidence']);
  });

  it('keeps entity evidence diverse across sections instead of filling the budget from one section', () => {
    const packed = packReaderContext({
      question: '阿兹克是谁？',
      chunks: [
        makeChunk({
          id: 'same-section-1',
          sectionIndex: 88,
          chapterTitle: '第八十八章 当前线索',
          text: '克莱恩又想到了阿兹克先生。',
          pageNumber: 700,
          sortIndex: 700_000,
          score: 10,
        }),
        makeChunk({
          id: 'same-section-2',
          sectionIndex: 88,
          chapterTitle: '第八十八章 当前线索',
          text: '阿兹克先生这个名字再次浮现。',
          pageNumber: 700,
          sortIndex: 700_010,
          score: 9,
        }),
        makeChunk({
          id: 'same-section-3',
          sectionIndex: 88,
          chapterTitle: '第八十八章 当前线索',
          text: '这让克莱恩联想到阿兹克先生。',
          pageNumber: 700,
          sortIndex: 700_020,
          score: 8,
        }),
        makeChunk({
          id: 'teacher',
          sectionIndex: 12,
          chapterTitle: '第十二章 老师',
          text: '阿兹克先生是克莱恩认识的历史老师。',
          pageNumber: 100,
          sortIndex: 100_000,
          score: 4,
        }),
        makeChunk({
          id: 'amnesia',
          sectionIndex: 24,
          chapterTitle: '第二十四章 记忆',
          text: '阿兹克先生失去了一些记忆。',
          pageNumber: 210,
          sortIndex: 210_000,
          score: 3,
        }),
      ],
      currentPage: 700,
      maxContextChunks: 3,
      spoilerProtection: true,
      preferSectionDiversity: true,
    });

    expect(packed.map((chunk) => chunk.id)).toEqual(['same-section-1', 'teacher', 'amnesia']);
  });

  it('limits output to maxContextChunks', () => {
    const packed = packReaderContext({
      question: '线索是什么？',
      chunks: [
        makeChunk({ id: 'chunk-1', text: '第一条线索说明灰雾异常。', score: 0.9 }),
        makeChunk({ id: 'chunk-2', text: '第二条线索说明献祭仪式。', score: 0.8 }),
        makeChunk({ id: 'chunk-3', text: '第三条线索说明塔罗会讨论。', score: 0.7 }),
      ],
      currentPage: 10,
      maxContextChunks: 2,
      spoilerProtection: true,
    });

    expect(packed).toHaveLength(2);
  });
});
