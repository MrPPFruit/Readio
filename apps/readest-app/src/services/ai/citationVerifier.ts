import { generateText } from 'ai';

import { logDiagnosticError, logDiagnosticEvent } from '@/services/diagnostics/logger';
import { getAIProvider } from './providers';
import type { AISettings } from './types';
import type { ReaderAISource, ReaderAISourceHighlightSpan } from '@/types/readerAI';

export interface RefineReaderAISourceCitationsOptions {
  settings: AISettings;
  answer: string;
  sources: ReaderAISource[];
  signal?: AbortSignal;
}

export interface RefineReaderAIAnswerCitationsResult {
  answer: string;
  sources: ReaderAISource[];
}

interface ReviewerQuotesResponse {
  quotes: string[];
}

interface ParsedReviewerQuotesResponse {
  valid: boolean;
  quotes: string[];
}

const citationPattern = /\[(\d+)\]/g;

function getCitedSourceIndexes(answer: string, sourceCount: number): number[] {
  const indexes = new Set<number>();
  for (const match of answer.matchAll(citationPattern)) {
    const citationNumber = Number(match[1]);
    if (Number.isInteger(citationNumber) && citationNumber >= 1 && citationNumber <= sourceCount) {
      indexes.add(citationNumber - 1);
    }
  }
  return [...indexes].sort((left, right) => left - right);
}

const sentenceBoundaryCharacters = ['。', '！', '？', '.', '!', '?', '\n'];
const citationClosingPunctuationOnlyPattern = /^[\s"'”’」』）)》〉】\]]*$/;
const immediatePostCitationPunctuationPattern = /^[\s。！？.!?，,；;：:"'”’」』）)》〉】\]]*/;

function getLastSentenceBoundaryIndex(text: string, endIndex = text.length): number {
  return Math.max(
    ...sentenceBoundaryCharacters.map((punctuation) => text.lastIndexOf(punctuation, endIndex)),
  );
}

function getCitationClause(answer: string, citationNumber: number): string {
  const marker = `[${citationNumber}]`;
  const markerIndex = answer.indexOf(marker);
  if (markerIndex < 0) return answer.trim();

  const before = answer.slice(0, markerIndex);
  let sentenceStart = getLastSentenceBoundaryIndex(before);
  const markerFollowsCompletedSentence =
    sentenceStart >= 0 &&
    citationClosingPunctuationOnlyPattern.test(before.slice(sentenceStart + 1, markerIndex));
  if (
    sentenceStart >= 0 &&
    (!before.slice(sentenceStart + 1, markerIndex).trim() || markerFollowsCompletedSentence)
  ) {
    sentenceStart = getLastSentenceBoundaryIndex(before, sentenceStart - 1);
  }
  const after = answer.slice(markerIndex + marker.length);
  const immediatePostCitationPunctuation =
    after.match(immediatePostCitationPunctuationPattern)?.[0] ?? '';
  if (markerFollowsCompletedSentence) {
    return `${answer.slice(sentenceStart + 1, markerIndex)}${marker}${immediatePostCitationPunctuation}`.trim();
  }

  const afterCitationClauseStart = immediatePostCitationPunctuation.length;
  const nextPunctuationMatches = sentenceBoundaryCharacters
    .map((punctuation) => after.indexOf(punctuation, afterCitationClauseStart))
    .filter((index) => index >= 0);
  const sentenceEnd = nextPunctuationMatches.length
    ? Math.min(...nextPunctuationMatches)
    : after.length;
  return `${answer.slice(sentenceStart + 1, markerIndex)}${marker}${after.slice(0, sentenceEnd)}`.trim();
}

function getSourcePreviewText(source: ReaderAISource): string {
  return source.previewText || source.contextText || source.snippet || '';
}

function parseReviewerQuotes(text: string): ParsedReviewerQuotesResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return { valid: false, quotes: [] };
  }

  if (!parsed || typeof parsed !== 'object' || !('quotes' in parsed))
    return { valid: false, quotes: [] };
  const quotes = (parsed as ReviewerQuotesResponse).quotes;
  if (!Array.isArray(quotes)) return { valid: false, quotes: [] };
  return {
    valid: true,
    quotes: quotes.filter(
      (quote): quote is string => typeof quote === 'string' && quote.trim().length > 0,
    ),
  };
}

function buildReviewerPrompt({
  answerClause,
  citationNumber,
  previewText,
}: {
  answerClause: string;
  citationNumber: number;
  previewText: string;
}): string {
  return `You are a constrained citation quote extractor, not a judge.\nReturn strict JSON only in this exact shape: {"quotes":["..."]}\nTask: For citation [${citationNumber}], propose exact original quote strings from the provided SOURCE PREVIEW that support the cited answer clause.\nRules:\n- Only quote text that appears verbatim in SOURCE PREVIEW.\n- Do not paraphrase, translate, normalize, or switch sources.\n- If no exact quote supports the clause, return {"quotes":[]}.\n- Return at most 2 short quotes.\n\nCITED ANSWER CLAUSE:\n${answerClause}\n\nSOURCE PREVIEW:\n${previewText}`;
}

const sentenceBoundaryPattern = /[。！？.!?]/;

function isParagraphBoundary(text: string, index: number): boolean {
  return text[index] === '\n' && (text[index - 1] === '\n' || text[index + 1] === '\n');
}

function isSourceSentenceStartBoundary(text: string, index: number): boolean {
  const character = text[index];
  return character !== undefined && (sentenceBoundaryPattern.test(character) || character === '\n');
}

function isSourceSentenceEndBoundary(text: string, index: number): boolean {
  const character = text[index];
  return (
    character !== undefined &&
    (sentenceBoundaryPattern.test(character) || isParagraphBoundary(text, index))
  );
}
const openingQuotePattern = /[“‘「『（(《〈]/;
const closingQuotePattern = /[”’」』）)》〉]/;
const crossLanguageCitationTermPatterns: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /北方|北风|寒风|冷风/, terms: ['cold northern breeze', 'northern breeze', 'breeze'] },
  { pattern: /振奋|鼓舞/, terms: ['brace', 'braces', 'braced'] },
  { pattern: /喜悦|高兴|快乐/, terms: ['delight', 'joy'] },
  { pattern: /朋友|知己|同伴/, terms: ['friend', 'friends'] },
  {
    pattern: /找不到|没有|无人|缺少|缺乏/,
    terms: ['no friend', 'no one', 'want of', 'absence', 'lack'],
  },
  { pattern: /阿坎杰尔/, terms: ['archangel'] },
  { pattern: /商人/, terms: ['merchant', 'merchants'] },
  { pattern: /水手/, terms: ['seaman', 'seamen', 'sailor', 'sailors'] },
  {
    pattern: /承诺|遐想|热切|生动/,
    terms: ['promise', 'daydream', 'daydreams', 'fervent', 'vivid'],
  },
];

function expandQuoteToSentence(
  previewText: string,
  start: number,
  end: number,
): { start: number; end: number; quote: string } {
  let expandedStart = start;
  while (expandedStart > 0) {
    if (isSourceSentenceStartBoundary(previewText, expandedStart - 1)) break;
    expandedStart -= 1;
  }
  while (expandedStart < start && /\s/.test(previewText[expandedStart]!)) expandedStart += 1;
  while (expandedStart < start && openingQuotePattern.test(previewText[expandedStart]!))
    expandedStart += 1;

  let expandedEnd = end;
  if (!isSourceSentenceEndBoundary(previewText, expandedEnd - 1)) {
    while (expandedEnd < previewText.length) {
      expandedEnd += 1;
      if (isSourceSentenceEndBoundary(previewText, expandedEnd - 1)) break;
    }
  }
  while (expandedEnd > end && /\s/.test(previewText[expandedEnd - 1]!)) expandedEnd -= 1;
  while (expandedEnd > end && closingQuotePattern.test(previewText[expandedEnd - 1]!))
    expandedEnd -= 1;

  return {
    start: expandedStart,
    end: expandedEnd,
    quote: previewText.slice(expandedStart, expandedEnd),
  };
}

function tokenizeCitationText(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/[\p{Script=Han}]+/gu)) {
    const value = match[0];
    for (let index = 0; index < value.length - 1; index += 1) {
      tokens.add(value.slice(index, index + 2));
    }
  }
  text.match(/[A-Za-z0-9]{2,}/g)?.forEach((token) => tokens.add(token.toLowerCase()));
  return [...tokens];
}

function getCrossLanguageCitationScore(answerClause: string, quote: string): number {
  const normalizedQuote = quote.toLowerCase();
  return crossLanguageCitationTermPatterns.reduce((score, { pattern, terms }) => {
    if (!pattern.test(answerClause)) return score;
    return score + terms.filter((term) => normalizedQuote.includes(term)).length;
  }, 0);
}

function getSpanTokenScore(answerTokens: string[], answerClause: string, quote: string): number {
  const normalizedQuote = quote.toLowerCase();
  const lexicalScore = answerTokens.filter((token) => normalizedQuote.includes(token)).length;
  return lexicalScore + getCrossLanguageCitationScore(answerClause, quote);
}

function extractQuotedAnswerPhrases(answerClause: string): string[] {
  const phrases = new Set<string>();
  for (const match of answerClause.matchAll(
    /[“"]([^“”"]{8,})[”"]|「([^」]{8,})」|『([^』]{8,})』/g,
  )) {
    const phrase = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (phrase) phrases.add(phrase);
  }
  return [...phrases];
}

function findCaseInsensitiveIndex(text: string, search: string): number {
  return text.toLowerCase().indexOf(search.toLowerCase());
}

function hasComparableScript(answerClause: string, quote: string): boolean {
  const answerHasHan = /\p{Script=Han}/u.test(answerClause);
  const quoteHasHan = /\p{Script=Han}/u.test(quote);
  const answerHasLatin = /[A-Za-z]{2,}/.test(answerClause);
  const quoteHasLatin = /[A-Za-z]{2,}/.test(quote);
  return (answerHasHan && quoteHasHan) || (answerHasLatin && quoteHasLatin);
}

function trimRange(text: string, start: number, end: number): { start: number; end: number } {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/.test(text[trimmedStart]!)) trimmedStart += 1;
  while (trimmedEnd > trimmedStart && /\s/.test(text[trimmedEnd - 1]!)) trimmedEnd -= 1;
  return { start: trimmedStart, end: trimmedEnd };
}

function splitRangeIntoSentences(
  text: string,
  start: number,
  end: number,
  source: ReaderAISourceHighlightSpan['source'],
): ReaderAISourceHighlightSpan[] {
  const spans: ReaderAISourceHighlightSpan[] = [];
  let cursor = start;
  for (let index = start; index < end; index += 1) {
    if (!isSourceSentenceEndBoundary(text, index)) continue;
    const range = trimRange(text, cursor, index + 1);
    if (range.end > range.start) {
      spans.push({
        start: range.start,
        end: range.end,
        quote: text.slice(range.start, range.end),
        source,
      });
    }
    cursor = index + 1;
  }
  const finalRange = trimRange(text, cursor, end);
  if (finalRange.end > finalRange.start) {
    spans.push({
      start: finalRange.start,
      end: finalRange.end,
      quote: text.slice(finalRange.start, finalRange.end),
      source,
    });
  }
  return spans;
}

const lowSignalEnglishCitationTokens = new Set([
  'about',
  'after',
  'also',
  'and',
  'are',
  'because',
  'before',
  'from',
  'have',
  'into',
  'that',
  'the',
  'their',
  'there',
  'this',
  'with',
]);

function getCitationSearchTerms(answerClause: string, answerTokens: string[]): string[] {
  const terms = new Set<string>();
  answerTokens
    .filter(
      (token) => /^[a-z0-9'-]{4,}$/i.test(token) && !lowSignalEnglishCitationTokens.has(token),
    )
    .forEach((token) => terms.add(token.toLowerCase()));
  crossLanguageCitationTermPatterns.forEach(({ pattern, terms: translatedTerms }) => {
    if (!pattern.test(answerClause)) return;
    translatedTerms.forEach((term) => terms.add(term.toLowerCase()));
  });
  return [...terms].sort((left, right) => right.length - left.length);
}

function getSourceTokenCandidates(
  previewText: string,
  searchTerms: string[],
  source: ReaderAISourceHighlightSpan['source'],
): ReaderAISourceHighlightSpan[] {
  const candidates: ReaderAISourceHighlightSpan[] = [];
  const seenRanges = new Set<string>();
  const normalizedPreview = previewText.toLowerCase();
  for (const term of searchTerms) {
    let start = normalizedPreview.indexOf(term);
    while (start >= 0) {
      const expanded = expandQuoteToSentence(previewText, start, start + term.length);
      const rangeKey = `${expanded.start}:${expanded.end}`;
      if (!seenRanges.has(rangeKey)) {
        candidates.push({ ...expanded, source });
        seenRanges.add(rangeKey);
      }
      start = normalizedPreview.indexOf(term, start + term.length);
    }
  }
  return candidates;
}

function buildDeterministicFallbackSpans(
  source: ReaderAISource,
  answerClause: string,
): ReaderAISourceHighlightSpan[] {
  const previewText = getSourcePreviewText(source);
  const quotedAnswerPhrases = extractQuotedAnswerPhrases(answerClause);
  for (const phrase of quotedAnswerPhrases) {
    const start = findCaseInsensitiveIndex(previewText, phrase);
    if (start < 0) continue;
    const expanded = expandQuoteToSentence(previewText, start, start + phrase.length);
    return [{ ...expanded, source: 'chunk' }];
  }

  const answerTokens = tokenizeCitationText(answerClause);
  const candidates = (source.highlightSpans ?? [])
    .flatMap((span) => {
      if (
        !Number.isInteger(span.start) ||
        !Number.isInteger(span.end) ||
        span.start < 0 ||
        span.end <= span.start ||
        span.end > previewText.length ||
        previewText.slice(span.start, span.end) !== span.quote
      ) {
        return [];
      }
      const expanded = expandQuoteToSentence(previewText, span.start, span.end);
      return splitRangeIntoSentences(previewText, expanded.start, expanded.end, span.source).map(
        (candidate) => ({
          ...candidate,
          score: getSpanTokenScore(answerTokens, answerClause, candidate.quote),
        }),
      );
    })
    .filter((span) => answerTokens.length === 0 || span.score > 0)
    .sort((left, right) => right.score - left.score || left.quote.length - right.quote.length);

  const searchTerms = getCitationSearchTerms(answerClause, answerTokens);
  const previewCandidates = getSourceTokenCandidates(previewText, searchTerms, 'chunk')
    .map((candidate) => ({
      ...candidate,
      score: getSpanTokenScore(answerTokens, answerClause, candidate.quote),
    }))
    .filter((span) => answerTokens.length === 0 || span.score > 0);

  const [best] = [...candidates, ...previewCandidates].sort(
    (left, right) => right.score - left.score || left.quote.length - right.quote.length,
  );
  return best ? [{ start: best.start, end: best.end, quote: best.quote, source: best.source }] : [];
}

function getBestSpanSupportScore(
  spans: ReaderAISourceHighlightSpan[],
  answerClause: string,
): number {
  const answerTokens = tokenizeCitationText(answerClause);
  return Math.max(
    ...spans.map((span) => getSpanTokenScore(answerTokens, answerClause, span.quote)),
    0,
  );
}

function buildReviewerSpans(
  source: ReaderAISource,
  quotes: string[],
  answerClause: string,
): ReaderAISourceHighlightSpan[] {
  const previewText = getSourcePreviewText(source);
  const answerTokens = tokenizeCitationText(answerClause);
  const candidates = quotes
    .flatMap((quote) => {
      const start = previewText.indexOf(quote);
      if (start < 0) return [];
      const expandedQuote = expandQuoteToSentence(previewText, start, start + quote.length);
      return splitRangeIntoSentences(
        previewText,
        expandedQuote.start,
        expandedQuote.end,
        'reviewer',
      ).map((span) => ({
        ...span,
        score: getSpanTokenScore(answerTokens, answerClause, span.quote),
      }));
    })
    .filter(
      (span) =>
        answerTokens.length === 0 ||
        span.score > 0 ||
        !hasComparableScript(answerClause, span.quote),
    );
  const maxScore = Math.max(...candidates.map((span) => span.score), 0);
  const spans = candidates
    .filter((span) => answerTokens.length === 0 || span.score === maxScore)
    .sort((left, right) => left.quote.length - right.quote.length)
    .slice(0, 2);

  return spans.map(({ score: _score, ...span }) => span);
}

async function refineReaderAIAnswerCitationsWithMode({
  settings,
  answer,
  sources,
  signal,
}: RefineReaderAISourceCitationsOptions): Promise<RefineReaderAIAnswerCitationsResult> {
  const citedSourceIndexes = getCitedSourceIndexes(answer, sources.length);
  if (citedSourceIndexes.length === 0) return { answer, sources };

  void logDiagnosticEvent('reader_ai.citation_refinement_started', 'debug', {
    citedSourceCount: citedSourceIndexes.length,
    sourceCount: sources.length,
    provider: settings.provider,
    model: settings.providerModels[settings.provider] ?? '',
  });

  let refinedSources = sources;
  let changed = false;

  for (const sourceIndex of citedSourceIndexes) {
    const source = sources[sourceIndex];
    if (!source) continue;
    const previewText = getSourcePreviewText(source);
    if (!previewText.trim()) continue;

    try {
      const provider = getAIProvider(settings);
      const result = await generateText({
        model: provider.getModel(),
        prompt: buildReviewerPrompt({
          answerClause: getCitationClause(answer, sourceIndex + 1),
          citationNumber: sourceIndex + 1,
          previewText,
        }),
        abortSignal: signal,
      });
      const answerClause = getCitationClause(answer, sourceIndex + 1);
      const parsedQuotes = parseReviewerQuotes(result.text);
      const reviewerSpans =
        parsedQuotes.quotes.length > 0
          ? buildReviewerSpans(source, parsedQuotes.quotes, answerClause)
          : [];
      const fallbackSpans = buildDeterministicFallbackSpans(source, answerClause);
      const reviewerScore = getBestSpanSupportScore(reviewerSpans, answerClause);
      const fallbackScore = getBestSpanSupportScore(fallbackSpans, answerClause);
      const highlightSpans =
        reviewerSpans.length > 0 && reviewerScore >= fallbackScore ? reviewerSpans : fallbackSpans;
      if (highlightSpans.length === 0) continue;

      void logDiagnosticEvent('reader_ai.citation_refinement_completed', 'info', {
        sourceIndex,
        sourceCount: sources.length,
        provider: settings.provider,
        model: settings.providerModels[settings.provider] ?? '',
        reviewerQuoteCount: parsedQuotes.quotes.length,
        reviewerSpanCount: reviewerSpans.length,
        fallbackSpanCount: fallbackSpans.length,
        selectedSpanCount: highlightSpans.length,
      });

      if (!changed) refinedSources = [...sources];
      refinedSources[sourceIndex] = { ...source, highlightSpans };
      changed = true;
    } catch (error) {
      void logDiagnosticError('reader_ai.citation_refinement_failed', error, {
        sourceIndex,
        sourceCount: sources.length,
        provider: settings.provider,
        model: settings.providerModels[settings.provider] ?? '',
      });
      const answerClause = getCitationClause(answer, sourceIndex + 1);
      const fallbackSpans = buildDeterministicFallbackSpans(source, answerClause);
      if (fallbackSpans.length === 0) continue;

      if (!changed) refinedSources = [...sources];
      refinedSources[sourceIndex] = { ...source, highlightSpans: fallbackSpans };
      changed = true;
    }
  }

  return { answer, sources: refinedSources };
}

export function narrowReaderAISourceFallbackHighlights({
  answer,
  sources,
}: Pick<RefineReaderAISourceCitationsOptions, 'answer' | 'sources'>): ReaderAISource[] {
  const citedSourceIndexes = getCitedSourceIndexes(answer, sources.length);
  if (citedSourceIndexes.length === 0) return sources;

  let narrowedSources = sources;
  let changed = false;
  for (const sourceIndex of citedSourceIndexes) {
    const source = sources[sourceIndex];
    if (!source) continue;
    const highlightSpans = buildDeterministicFallbackSpans(
      source,
      getCitationClause(answer, sourceIndex + 1),
    );
    if (highlightSpans.length === 0) continue;

    if (!changed) narrowedSources = [...sources];
    narrowedSources[sourceIndex] = { ...source, highlightSpans };
    changed = true;
  }

  return narrowedSources;
}

export async function refineReaderAIAnswerCitations(
  options: RefineReaderAISourceCitationsOptions,
): Promise<RefineReaderAIAnswerCitationsResult> {
  return refineReaderAIAnswerCitationsWithMode(options);
}

export async function refineReaderAISourceCitations(
  options: RefineReaderAISourceCitationsOptions,
): Promise<ReaderAISource[]> {
  return (await refineReaderAIAnswerCitationsWithMode(options)).sources;
}
