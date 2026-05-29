import { describe, expect, it } from 'vitest';

import {
  buildGroundedInsufficientAnswer,
  validateAnswerCitations,
} from '@/services/ai/citationGrounding';
import type { ReaderAISource } from '@/types/readerAI';

function createSource(overrides: Partial<ReaderAISource> = {}): ReaderAISource {
  return {
    id: 'source-1',
    chapterTitle: '第一章',
    snippet: '克莱恩在灰雾之上看见塔罗会成员。',
    previewText: '前文。克莱恩在灰雾之上看见塔罗会成员，并听见他们讨论新的线索。后文。',
    confidence: 'exact',
    ...overrides,
  };
}

describe('validateAnswerCitations', () => {
  it('rejects citation numbers outside the bounded source list', () => {
    const result = validateAnswerCitations('塔罗会在灰雾上聚会。[99]', [createSource()]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ citationNumber: 99, issue: 'missing_source' }),
    ]);
  });

  it('rejects citations whose source has no previewable text', () => {
    const result = validateAnswerCitations('塔罗会在灰雾上聚会。[1]', [
      createSource({ snippet: '', previewText: '', contextText: '' }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ citationNumber: 1, issue: 'empty_source' }),
    ]);
  });

  it('rejects uncited factual answers when citation grounding is required', () => {
    const result = validateAnswerCitations('克莱恩在灰雾之上看见了塔罗会成员。', [createSource()], {
      requireCitations: true,
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ issue: 'missing_citation' })]);
  });

  it('rejects unsupported cited clauses with no lexical overlap against the source text', () => {
    const result = validateAnswerCitations('亵渎石板记载了二十二条神之途径。[1]', [
      createSource({ previewText: '阿尔杰说塔罗牌实际上就属于这种工具。' }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ citationNumber: 1, issue: 'unsupported_clause' }),
    ]);
  });

  it('rejects multi-fact cited clauses when the source only supports one fact', () => {
    const result = validateAnswerCitations('周明瑞发现了左轮手枪和有瑕疵的家传怀表。[1]', [
      createSource({
        previewText: '周明瑞边按住太阳穴，边慌忙拉开书桌抽屉，将左轮手枪丢了进去。',
      }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ citationNumber: 1, issue: 'unsupported_clause' }),
    ]);
  });

  it('rejects unsupported citations placed after completed sentence punctuation', () => {
    const result = validateAnswerCitations(
      'He feels isolated, noting that such a companion "is something which I cannot find." [2]',
      [
        createSource({
          id: 'letter-1',
          chapterTitle: 'Letter 1',
          previewText: 'I have no friend, Margaret.',
        }),
        createSource({
          id: 'letter-2-signature',
          chapterTitle: 'Letter 2',
          previewText: 'Your affectionate brother, Robert Walton',
        }),
      ],
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({
        citationNumber: 2,
        issue: 'unsupported_clause',
        clause: expect.stringContaining('something which I cannot find'),
      }),
    ]);
  });

  it('accepts comma-separated multi-source entity facts when each citation supports its local clause', () => {
    const result = validateAnswerCitations(
      '林远是大学老师，也是主角信任的导师[1]；他长期失去记忆，梦里反复看见不同人生[2]；后来他用铜哨救下主角，说明他有特殊能力[3]。',
      [
        createSource({
          id: 'mentor-source',
          previewText: '林远在大学历史系任教，主角一直称他为导师，并向他请教古代文献。',
        }),
        createSource({
          id: 'memory-source',
          previewText: '林远发现自己的记忆长期断片，梦里反复出现不同年代的人生片段。',
        }),
        createSource({
          id: 'rescue-source',
          previewText: '危急时刻，林远吹响铜哨救下主角，旁人意识到他掌握着特殊能力。',
        }),
      ],
    );

    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('accepts a directly supported cited clause', () => {
    const result = validateAnswerCitations('克莱恩在灰雾之上看见了塔罗会成员。[1]', [
      createSource(),
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts mention/existence answers when the cited source contains the named entity', () => {
    const result = validateAnswerCitations('前文确实提到过阿兹克。[1]', [
      createSource({
        previewText: '克莱恩在廷根见到了阿兹克先生，并向他请教了第四纪相关的问题。',
      }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts mention/existence answers when the cited source contains the named entity with suffixes', () => {
    const result = validateAnswerCitations('前文有关于阿兹克的内容。[1]', [
      createSource({
        previewText: '阿兹克先生提醒克莱恩注意梦境里的异常。',
      }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts translated cited clauses when the source text is in another language', () => {
    const result = validateAnswerCitations('北方寒风让叙述者振奋，并让他充满喜悦。[1]', [
      createSource({
        previewText:
          'I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.',
      }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts translated cited clauses that preserve source-language names', () => {
    const result = validateAnswerCitations('Walton 说北方冷风让他振奋，并让他充满喜悦。[1]', [
      createSource({
        previewText:
          'Walton writes that he feels a cold northern breeze play upon his cheeks, which braces his nerves and fills him with delight.',
      }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects cited clauses whose stated chapter conflicts with the cited source title', () => {
    const result = validateAnswerCitations('在第二章中，Alice 发现了金色小钥匙。[1]', [
      createSource({
        chapterTitle: 'Chapter 1 - Down the Rabbit Hole',
        previewText:
          'Suddenly she came upon a little three-legged table, all made of solid glass: there was nothing on it except a tiny golden key.',
      }),
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ citationNumber: 1, issue: 'unsupported_clause' }),
    ]);
  });

  it('accepts translated absence claims when the cited English source states the absence', () => {
    const result = validateAnswerCitations('Walton 找不到一个真正理解他的朋友。[1]', [
      createSource({
        chapterTitle: 'Letter 2',
        previewText:
          'I bitterly feel the want of a friend. I have no one near me, gentle yet courageous, possessed of a cultivated as well as of a capacious mind.',
      }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts translated absence claims when the cited English source says no friend', () => {
    const result = validateAnswerCitations('Walton 找不到朋友。[1]', [
      createSource({
        chapterTitle: 'Letter 2',
        previewText:
          'I have no friend, Margaret: when I am glowing with the enthusiasm of success, there will be none to participate my joy.',
      }),
    ]);

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('rejects absence claims when the cited source does not explicitly support the absence', () => {
    const result = validateAnswerCitations('这一章没有提到塔罗会。[1]', [createSource()]);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining({ citationNumber: 1, issue: 'invalid_absence_citation' }),
    ]);
  });
});

describe('buildGroundedInsufficientAnswer', () => {
  it('explains the searched scope instead of guessing when evidence is insufficient', () => {
    expect(
      buildGroundedInsufficientAnswer({
        question: '亵渎石板是什么？',
        spoilerProtection: true,
        readerPage: 42,
        reason: 'empty',
      }),
    ).toContain('已读到第 42 页');
  });
});
