import { describe, expect, it } from 'vitest';

import { classifyReaderQuestion } from '@/services/ai/questionRouting';

describe('classifyReaderQuestion', () => {
  it('keeps question intent separate from spoiler source scope', () => {
    const protectedResult = classifyReaderQuestion({
      question: '戴里克是谁？',
      spoilerProtection: true,
    });
    const unprotectedResult = classifyReaderQuestion({
      question: '戴里克是谁？',
      spoilerProtection: false,
    });

    expect(protectedResult.intent).toBe('entity_lookup');
    expect(protectedResult.scope).toBe('read_so_far');
    expect(unprotectedResult.intent).toBe('entity_lookup');
    expect(unprotectedResult.scope).toBe('whole_book_allowed');
  });

  it('detects selected-text explanation from explicit selection', () => {
    expect(
      classifyReaderQuestion({
        question: '这里是什么意思？',
        selectionText: '他在灰雾之上听见了祈祷声。',
        spoilerProtection: true,
      }),
    ).toEqual({ intent: 'selection_explanation', scope: 'read_so_far' });
  });

  it('detects common reader question intents with deterministic rules', () => {
    expect(
      classifyReaderQuestion({ question: '前面发生了什么？', spoilerProtection: true }).intent,
    ).toBe('current_recap');
    expect(
      classifyReaderQuestion({ question: '总结本章内容', spoilerProtection: true }).intent,
    ).toBe('chapter_summary');
    expect(
      classifyReaderQuestion({ question: '白银城是什么地方？', spoilerProtection: true }).intent,
    ).toBe('entity_lookup');
    expect(
      classifyReaderQuestion({ question: '戴里克发生了什么？', spoilerProtection: true }).intent,
    ).toBe('entity_lookup');
    expect(
      classifyReaderQuestion({
        question: '这是不是伏笔？为什么他会这样做？',
        spoilerProtection: true,
      }).intent,
    ).toBe('analysis');
    expect(
      classifyReaderQuestion({ question: '这段剧情可信吗？', spoilerProtection: true }).intent,
    ).toBe('general');
  });
});
