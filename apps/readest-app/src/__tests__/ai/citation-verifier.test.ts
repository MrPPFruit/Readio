import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  refineReaderAIAnswerCitations,
  refineReaderAISourceCitations,
} from '@/services/ai/citationVerifier';
import type { AISettings } from '@/services/ai/types';
import type { ReaderAISource } from '@/types/readerAI';

const { generateTextMock, getModelMock, logDiagnosticErrorMock, logDiagnosticEventMock } =
  vi.hoisted(() => ({
    generateTextMock: vi.fn(),
    getModelMock: vi.fn(),
    logDiagnosticErrorMock: vi.fn().mockResolvedValue(undefined),
    logDiagnosticEventMock: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@/services/ai/providers', () => ({
  getAIProvider: () => ({
    getModel: getModelMock,
  }),
}));

vi.mock('@/services/diagnostics/logger', () => ({
  logDiagnosticError: logDiagnosticErrorMock,
  logDiagnosticEvent: logDiagnosticEventMock,
}));

const settings: AISettings = {
  enabled: true,
  showReaderAIEntrypoints: true,
  provider: 'openrouter',
  providerApiKeys: { openrouter: 'openrouter-key' },
  providerModels: { openrouter: 'google/gemini-2.5-flash-lite' },
  spoilerProtection: true,
  maxContextChunks: 3,
  indexingMode: 'on-demand',
};

const fallbackSpan = {
  start: 0,
  end: 4,
  quote: 'fallback',
  source: 'chunk' as const,
};

function createSource(overrides: Partial<ReaderAISource> = {}): ReaderAISource {
  return {
    id: 'source-1',
    chapterTitle: '第一章',
    sectionIndex: 1,
    snippet: 'fallback snippet',
    previewText: '前文。克莱恩在灰雾之上看见塔罗会成员。后文。',
    highlightSpans: [fallbackSpan],
    confidence: 'approximate',
    ...overrides,
  };
}

describe('refineReaderAISourceCitations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getModelMock.mockReturnValue('mock-model');
    generateTextMock.mockResolvedValue({ text: '{"quotes":[]}' });
  });

  it('expands reviewer quotes to full sentence boundaries when possible', async () => {
    generateTextMock.mockResolvedValue({ text: '{"quotes":["忍耐，等待至少"]}' });
    const source = createSource({
      previewText: '前文。她必须忍耐，等待至少三个月才能返回。后文。',
    });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '她需要先忍耐等待。[1]',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: 3,
        end: 21,
        quote: '她必须忍耐，等待至少三个月才能返回。',
        source: 'reviewer',
      },
    ]);
  });

  it('ignores invalid reviewer quotes when at least one returned quote is exact', async () => {
    generateTextMock.mockResolvedValue({
      text: '{"quotes":["灰雾之上看见塔罗会成员","不存在的引文"]}',
    });
    const source = createSource();

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '他在灰雾上看见成员。[1]',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: 3,
        end: 19,
        quote: '克莱恩在灰雾之上看见塔罗会成员。',
        source: 'reviewer',
      },
    ]);
  });

  it('turns an exact reviewer quote into reviewer highlight spans with preview-relative offsets', async () => {
    generateTextMock.mockResolvedValue({ text: '{"quotes":["灰雾之上看见塔罗会成员"]}' });
    const source = createSource();

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '他在灰雾上看见成员。[1]',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: 3,
        end: 19,
        quote: '克莱恩在灰雾之上看见塔罗会成员。',
        source: 'reviewer',
      },
    ]);
    expect(refined[0]).not.toBe(source);
    expect(source.highlightSpans).toEqual([fallbackSpan]);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'mock-model', prompt: expect.stringContaining('[1]') }),
    );
  });

  it('keeps exact reviewer quotes even when the answer and source use different languages', async () => {
    const quote =
      'cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight';
    generateTextMock.mockResolvedValue({ text: JSON.stringify({ quotes: [quote] }) });
    const source = createSource({
      previewText:
        'Letter 1. I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. More text.',
    });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '北方寒风让叙述者精神振奋，并让他充满喜悦。[1]',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: 10,
        end: 110,
        quote:
          'I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.',
        source: 'reviewer',
      },
    ]);
  });

  it('expands reviewer quotes across soft line wraps to keep the cited sentence complete', async () => {
    const quote = 'cold northern breeze play upon my cheeks, which braces my nerves and';
    const previewText =
      'I am already far north of London, and as I walk in the streets of Petersburgh,\nI feel a cold northern breeze play upon my cheeks, which braces my nerves and\nfills me with delight. Do you understand this feeling?';
    generateTextMock.mockResolvedValue({ text: JSON.stringify({ quotes: [quote] }) });
    const source = createSource({ previewText });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer:
        'In Letter 1, Walton says the cold northern breeze braces his nerves and fills him with delight. [1]',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: 79,
        end: 179,
        quote:
          'I feel a cold northern breeze play upon my cheeks, which braces my nerves and\nfills me with delight.',
        source: 'reviewer',
      },
    ]);
  });

  it('falls back to later preview evidence when the existing highlight supports a different citation clause', async () => {
    const coldSentence =
      'I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.';
    const promiseSentence =
      'Inspirited by this wind of promise, my daydreams become more fervent and vivid.';
    const previewText = [
      'I am already far north of London, and as I walk in the streets of Petersburgh,',
      coldSentence,
      'Do you understand this feeling?',
      'This breeze, which has travelled from the regions towards which I am advancing, gives me a foretaste of those icy climes.',
      promiseSentence,
    ].join(' ');
    const coldStart = previewText.indexOf(coldSentence);
    const promiseStart = previewText.indexOf(promiseSentence);
    generateTextMock.mockResolvedValue({ text: JSON.stringify({ quotes: [] }) });
    const source = createSource({
      previewText,
      highlightSpans: [
        {
          start: coldStart,
          end: coldStart + coldSentence.length,
          quote: coldSentence,
          source: 'chunk',
        },
      ],
    });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '他将这阵风称为“承诺之风”，让他的遐想变得更加热切和生动。[1]',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: promiseStart,
        end: promiseStart + promiseSentence.length,
        quote: promiseSentence,
        source: 'chunk',
      },
    ]);
  });

  it('prefers direct friend-absence evidence over an unrelated cross-language reviewer quote', async () => {
    const irrelevantSentence =
      'Yet some feelings, unallied to the dross of human nature, beat even in these rugged bosoms.';
    const relevantSentence =
      'Well, these are useless complaints; I shall certainly find no friend on the wide ocean, nor even here in Archangel, among merchants and seamen.';
    const previewText = [
      'But I have one want which I have never yet been able to satisfy.',
      'I have no friend, Margaret: when I am glowing with the enthusiasm of success, there will be none to participate my joy.',
      irrelevantSentence,
      relevantSentence,
    ].join(' ');
    generateTextMock.mockResolvedValue({ text: JSON.stringify({ quotes: [irrelevantSentence] }) });
    const source = createSource({
      chapterTitle: 'Letter 2',
      previewText,
      highlightSpans: [{ start: 0, end: previewText.length, quote: previewText, source: 'chunk' }],
    });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '他身处阿坎杰尔，周围都是商人和水手，因此觉得自己找不到真正的朋友。[1]',
      sources: [source],
    });

    const highlightedQuote = refined[0]?.highlightSpans?.[0]?.quote ?? '';
    expect(highlightedQuote).toContain('I shall certainly find no friend');
    expect(highlightedQuote).toContain('Archangel, among merchants and seamen');
    expect(highlightedQuote).not.toContain('Yet some feelings');
  });

  it('uses the sentence before a post-quote citation marker when narrowing fallback highlights', async () => {
    const citedSentence =
      'Well, these are useless complaints; I shall certainly find no friend on the wide ocean, nor even here in Archangel, among merchants and seamen.';
    const unrelatedSentence =
      'Yet some feelings, unallied to the dross of human nature, beat even in these rugged bosoms.';
    const lieutenantSentence =
      'My lieutenant, for instance, is a man of wonderful courage and enterprise; he is madly desirous of glory.';
    const previewText = [
      'It is true that I have thought more and that my daydreams are more extended and magnificent, but they want keeping; and I greatly need a friend who would have sense enough not to despise me as romantic.',
      citedSentence,
      unrelatedSentence,
      lieutenantSentence,
    ].join(' ');
    const broadSpan = {
      start: 0,
      end: previewText.length,
      quote: previewText,
      source: 'chunk' as const,
    };
    const sources = [
      createSource({ id: 'source-1', previewText: 'Unrelated first source.' }),
      createSource({ id: 'source-2', previewText: 'Unrelated second source.' }),
      createSource({ id: 'source-3', previewText: 'Unrelated third source.' }),
      createSource({
        id: 'source-4',
        chapterTitle: 'Letter 2',
        previewText,
        highlightSpans: [broadSpan],
      }),
    ];
    generateTextMock.mockResolvedValue({ text: JSON.stringify({ quotes: [] }) });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: `他坦率地说：“${citedSentence}” [4] 虽然他也承认这些人里 some feelings，但那不是他渴望的精神共鸣。`,
      sources,
    });

    expect(refined[3]?.highlightSpans).toEqual([
      {
        start: previewText.indexOf(citedSentence),
        end: previewText.indexOf(citedSentence) + citedSentence.length,
        quote: citedSentence,
        source: 'chunk',
      },
    ]);
  });

  it('uses a deterministic sentence fallback when the reviewer returns no usable quote', async () => {
    generateTextMock.mockResolvedValue({ text: '{"quotes":["不存在的引文"]}' });
    const previewText =
      '前文铺垫。序列8的“读心者”是“观众”的全面提升，他的观察不再仅限于表面细节，而是深入到气场、以太体等神秘领域。后文继续。';
    const source = createSource({
      previewText,
      snippet: previewText,
      highlightSpans: [{ start: 0, end: previewText.length, quote: previewText, source: 'chunk' }],
    });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '读心者是观众的全面提升，可以深入观察气场和以太体。[1]',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: 5,
        end: 56,
        quote:
          '序列8的“读心者”是“观众”的全面提升，他的观察不再仅限于表面细节，而是深入到气场、以太体等神秘领域。',
        source: 'chunk',
      },
    ]);
    expect(refined[0]).not.toBe(source);
  });

  it('uses the direct cited sentence from the preview when the chunk highlight is adjacent', async () => {
    generateTextMock.mockResolvedValue({ text: '{"quotes":[]}' });
    const adjacentSentence =
      'Continue for the present to write to me by every opportunity: I may receive your letters on some occasions when I need them most to support my spirits.';
    const citedSentence = 'Remember me with affection, should you never hear from me again.';
    const previewText = [
      'But to return to dearer considerations. Shall I meet you again?',
      adjacentSentence,
      'I love you very tenderly.',
      citedSentence,
      'Your affectionate brother, Robert Walton',
    ].join(' ');
    const adjacentStart = previewText.indexOf(adjacentSentence);
    const source = createSource({
      chapterTitle: 'Letter 2',
      previewText,
      highlightSpans: [
        {
          start: adjacentStart,
          end: adjacentStart + adjacentSentence.length,
          quote: adjacentSentence,
          source: 'chunk',
        },
      ],
    });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer:
        'Walton tells Margaret to "remember me with affection, should you never hear from me again" [1], which suggests isolation.',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: previewText.indexOf(citedSentence),
        end: previewText.indexOf(citedSentence) + citedSentence.length,
        quote: citedSentence,
        source: 'chunk',
      },
    ]);
  });

  it('uses deterministic sentence fallback when reviewer parsing or provider calls fail', async () => {
    const previewText =
      '章节标题。背景铺垫。The cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. unrelated ending.';
    const broadSpan = {
      start: 0,
      end: previewText.length,
      quote: previewText,
      source: 'chunk' as const,
    };
    const invalidJsonSource = createSource({
      id: 'invalid-json',
      previewText,
      highlightSpans: [broadSpan],
    });
    generateTextMock.mockResolvedValueOnce({ text: 'not json' });

    const invalidJsonRefined = await refineReaderAISourceCitations({
      settings,
      answer: 'The northern breeze braces the narrator and fills him with delight. [1]',
      sources: [invalidJsonSource],
    });

    expect(invalidJsonRefined[0]?.highlightSpans).toEqual([
      {
        start: 10,
        end: 105,
        quote:
          'The cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.',
        source: 'chunk',
      },
    ]);

    const providerFailureSource = createSource({
      id: 'provider-failure',
      previewText,
      highlightSpans: [broadSpan],
    });
    generateTextMock.mockRejectedValueOnce(new Error('provider failed'));

    const failureRefined = await refineReaderAISourceCitations({
      settings,
      answer: 'The northern breeze braces the narrator and fills him with delight. [1]',
      sources: [providerFailureSource],
    });

    expect(failureRefined[0]?.highlightSpans).toEqual([
      {
        start: 10,
        end: 105,
        quote:
          'The cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.',
        source: 'chunk',
      },
    ]);
  });

  it('logs citation reviewer failures without leaking answer or source text', async () => {
    const previewText =
      '章节标题。The cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight. unrelated ending.';
    const source = createSource({
      previewText,
      highlightSpans: [{ start: 0, end: previewText.length, quote: previewText, source: 'chunk' }],
    });
    generateTextMock.mockRejectedValueOnce(
      new Error('provider failed with raw source should not leak'),
    );

    await refineReaderAISourceCitations({
      settings,
      answer: 'The northern breeze braces the narrator and fills him with delight. [1]',
      sources: [source],
    });

    expect(logDiagnosticErrorMock).toHaveBeenCalledWith(
      'reader_ai.citation_refinement_failed',
      expect.any(Error),
      expect.objectContaining({
        sourceIndex: 0,
        sourceCount: 1,
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash-lite',
      }),
    );
    const calls = JSON.stringify(logDiagnosticErrorMock.mock.calls);
    expect(calls).not.toContain('The northern breeze braces the narrator');
    expect(calls).not.toContain('The cold northern breeze play upon my cheeks');
    expect(calls).not.toContain('previewText');
    expect(calls).not.toContain('quotes');
  });

  it('refines multiple citations independently when one reviewer quote is missing', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: '{"quotes":["可验证的第一处原文"]}' })
      .mockResolvedValueOnce({ text: '{"quotes":["不存在的第二处引文"]}' });
    const firstSource = createSource({
      id: 'source-1',
      previewText: '开头。可验证的第一处原文。结尾。',
      highlightSpans: [{ ...fallbackSpan, quote: 'first fallback' }],
    });
    const secondFallback = [{ ...fallbackSpan, quote: 'second fallback' }];
    const secondSource = createSource({
      id: 'source-2',
      previewText: '这里没有模型返回的那句话。',
      highlightSpans: secondFallback,
    });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '第一条依据。[1] 第二条依据。[2]',
      sources: [firstSource, secondSource],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: 3,
        end: 13,
        quote: '可验证的第一处原文。',
        source: 'reviewer',
      },
    ]);
    expect(refined[1]?.highlightSpans).toEqual(secondFallback);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('only reviews sources cited in the answer', async () => {
    generateTextMock.mockResolvedValue({ text: '{"quotes":["被引用的原文"]}' });
    const citedSource = createSource({ id: 'source-1', previewText: '被引用的原文在这里。' });
    const uncitedSource = createSource({ id: 'source-2', previewText: '未引用来源。' });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer: '只引用第一处。[1]',
      sources: [citedSource, uncitedSource],
    });

    expect(refined[0]?.highlightSpans?.[0]).toMatchObject({
      quote: '被引用的原文在这里。',
      source: 'reviewer',
    });
    expect(refined[1]).toBe(uncitedSource);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('keeps citation markers and fallback highlights when the reviewer finds no support', async () => {
    generateTextMock.mockResolvedValue({ text: '{"quotes":[]}' });
    const legacyFallbackSource = createSource({
      previewText: '阿尔杰说塔罗牌实际上就属于这种工具。',
      highlightSpans: [{ start: 4, end: 17, quote: '塔罗牌实际上就属于这种工具', source: 'chunk' }],
    });

    const refinedAnswer = await refineReaderAIAnswerCitations({
      settings,
      answer: '塔罗牌和亵渎石板有关。[1]',
      sources: [legacyFallbackSource],
    });

    expect(refinedAnswer.answer).toBe('塔罗牌和亵渎石板有关。[1]');
    expect(refinedAnswer.sources[0]?.highlightSpans?.[0]).toMatchObject({
      quote: '阿尔杰说塔罗牌实际上就属于这种工具。',
      source: 'chunk',
    });

    const refinedSources = await refineReaderAISourceCitations({
      settings,
      answer: '塔罗牌和亵渎石板有关。[1]',
      sources: [legacyFallbackSource],
    });

    expect(refinedSources[0]?.highlightSpans?.[0]).toMatchObject({
      quote: '阿尔杰说塔罗牌实际上就属于这种工具。',
      source: 'chunk',
    });
  });

  it('does not let over-broad reviewer quotes highlight chapter titles and unrelated context', async () => {
    const citedSentence =
      'I feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.';
    const previewText = `Letter 1\n\nTo Mrs. Saville, England.\n\nSt. Petersburgh, Dec. 11th, 17—.\n\nYou will rejoice to hear that no disaster has accompanied the commencement of an enterprise.\n\n${citedSentence}`;
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({ quotes: [previewText] }),
    });
    const sentenceStart = previewText.indexOf(citedSentence);
    const source = createSource({
      previewText,
      highlightSpans: [
        {
          start: sentenceStart,
          end: sentenceStart + citedSentence.length,
          quote: citedSentence,
          source: 'chunk',
        },
      ],
    });

    const refined = await refineReaderAISourceCitations({
      settings,
      answer:
        'The cold northern breeze braces the narrator’s nerves and fills him with delight. [1]',
      sources: [source],
    });

    expect(refined[0]?.highlightSpans).toEqual([
      {
        start: sentenceStart,
        end: sentenceStart + citedSentence.length,
        quote: citedSentence,
        source: 'reviewer',
      },
    ]);
  });

  it('keeps answer citation markers while refining only the supported source highlights', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: '{"quotes":[]}' })
      .mockResolvedValueOnce({ text: '{"quotes":["亵渎石板上可是记载了二十二条神之途径"]}' });
    const unsupportedSource = createSource({
      id: 'source-unsupported',
      previewText: '阿尔杰看了周明瑞一眼，便出言否定了奥黛丽的说法，“塔罗牌实际上就属于这种工具。”',
      highlightSpans: [],
    });
    const supportedSource = createSource({
      id: 'source-supported',
      previewText: '按照倒吊人和正义之前的说法，亵渎石板上可是记载了二十二条神之途径的！',
      highlightSpans: [],
    });

    const refined = await refineReaderAIAnswerCitations({
      settings,
      answer: '亵渎石板和二十二条神之途径有关。[1][2]',
      sources: [unsupportedSource, supportedSource],
    });

    expect(refined.answer).toBe('亵渎石板和二十二条神之途径有关。[1][2]');
    expect(refined.sources[0]?.highlightSpans).toEqual([]);
    expect(refined.sources[1]?.highlightSpans?.[0]).toMatchObject({
      quote: '按照倒吊人和正义之前的说法，亵渎石板上可是记载了二十二条神之途径的！',
      source: 'reviewer',
    });
  });
});
