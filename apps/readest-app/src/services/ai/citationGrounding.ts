import type { ReaderAISource } from '@/types/readerAI';

export type CitationValidationIssueType =
  | 'missing_citation'
  | 'missing_source'
  | 'empty_source'
  | 'unsupported_clause'
  | 'invalid_absence_citation';

export interface CitationValidationIssue {
  citationNumber: number;
  sourceIndex?: number;
  clause: string;
  issue: CitationValidationIssueType;
}

export interface CitationValidationResult {
  valid: boolean;
  issues: CitationValidationIssue[];
}

export interface CitationValidationOptions {
  requireCitations?: boolean;
}

export interface GroundedInsufficientAnswerOptions {
  question: string;
  spoilerProtection: boolean;
  readerPage: number;
  reason: 'empty' | 'low_confidence' | 'invalid_citations';
}

export interface CitationRepairPromptOptions {
  answer: string;
  sources: ReaderAISource[];
  issues: CitationValidationIssue[];
}

const citationPattern = /\[(\d+)\]/g;
const sentenceBoundaryCharacters = ['。', '！', '？', '；', ';', '.', '!', '?', '\n'];
const citationClosingPunctuationOnlyPattern = /^[\s"'”’」』）)》〉】\]]*$/;
const immediatePostCitationPunctuationPattern = /^[\s。！？.!?，,；;：:"'”’」』）)》〉】\]]*/;
const absencePattern =
  /(?:没有|没|未|并未|不曾|不存在|未出现|没有出现|未提到|没有提到|找不到|不包含)/;
const sourceAbsencePattern =
  /(?:没有|没|未|并未|不曾|不存在|未出现|没有出现|未提到|没有提到|找不到|不包含|\bno one\b|\bno\s+[^.?!\n]{0,40}\bnear\b|\bno\s+[^.?!\n]{0,40}\bfriends?\b|\bwant of\b|\black of\b|\bwithout\b)/i;
const affirmativeMentionPattern = /(?:提到|提及|说到|写到|讲到|出现|关于|有关|相关|内容|信息)/;
const mentionSupportNoisePattern =
  /(?:前文|之前|前面|这里|这章|本章|当前|已经|确实|是否|有没有|有没|有|被|提到|提及|说到|写到|讲到|出现|关于|有关|相关|内容|信息|情节|线索|部分|地方|先生|女士|小姐|的|了|过|吗|么|嘛|呢|在|中|里)/g;
const chineseClauseSegmentBoundaryPattern = /[，,、；;]|以及|而且|同时|并且|并|也|和/g;
const chineseChapterDigits: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

export function extractCitationMarkers(answer: string): number[] {
  return [...answer.matchAll(citationPattern)]
    .map((match) => Number(match[1]))
    .filter((citationNumber) => Number.isInteger(citationNumber));
}

function getLastSentenceBoundaryIndex(text: string, endIndex = text.length): number {
  return Math.max(
    ...sentenceBoundaryCharacters.map((punctuation) => text.lastIndexOf(punctuation, endIndex)),
  );
}

export function getCitationClause(answer: string, citationNumber: number): string {
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

  const immediatePostCitationBoundary =
    after.match(/^[\s"'”’」』）)》〉】\]]*[。！？；;.!?\n]/)?.[0] ?? '';
  if (immediatePostCitationBoundary) {
    return `${answer.slice(sentenceStart + 1, markerIndex)}${marker}${immediatePostCitationBoundary}`.trim();
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

export function getSourcePreviewText(source: ReaderAISource): string {
  return source.previewText || source.contextText || source.snippet || '';
}

function tokenizeCitationText(text: string): string[] {
  const normalized = text.replace(citationPattern, '').toLowerCase();
  const tokens = new Set<string>();
  for (const match of normalized.matchAll(/[\p{Script=Han}]+/gu)) {
    const value = match[0];
    for (let index = 0; index < value.length - 1; index += 1) {
      tokens.add(value.slice(index, index + 2));
    }
  }
  normalized.match(/[a-z0-9]{2,}/g)?.forEach((token) => tokens.add(token));
  return [...tokens];
}

function hasComparableScript(clause: string, sourceText: string): boolean {
  const clauseHasHan = /\p{Script=Han}/u.test(clause);
  const sourceHasHan = /\p{Script=Han}/u.test(sourceText);
  if (clauseHasHan !== sourceHasHan) return false;

  const clauseHasLatin = /[A-Za-z]{2,}/.test(clause);
  const sourceHasLatin = /[A-Za-z]{2,}/.test(sourceText);
  return (clauseHasHan && sourceHasHan) || (clauseHasLatin && sourceHasLatin);
}

function extractMentionSubject(clause: string): string {
  return clause.replace(citationPattern, '').replace(mentionSupportNoisePattern, '').trim();
}

function hasAffirmativeMentionSupport(clause: string, sourceText: string): boolean {
  if (!affirmativeMentionPattern.test(clause) || absencePattern.test(clause)) return false;

  const subject = extractMentionSubject(clause);
  if (!subject || !/\p{Script=Han}/u.test(subject)) return false;

  const normalizedSource = sourceText.toLowerCase();
  const subjectTokens = tokenizeCitationText(subject).filter((token) => token.length >= 2);
  return subjectTokens.some((token) => normalizedSource.includes(token.toLowerCase()));
}

interface LexicalSupportScore {
  tokenCount: number;
  matchedCount: number;
  ratio: number;
}

function getLexicalSupportScore(text: string, normalizedSource: string): LexicalSupportScore {
  const tokens = tokenizeCitationText(text);
  const matchedCount = tokens.filter((token) => normalizedSource.includes(token)).length;
  return {
    tokenCount: tokens.length,
    matchedCount,
    ratio: tokens.length ? matchedCount / tokens.length : 1,
  };
}

function hasTokenSupport(score: LexicalSupportScore, minRatio: number): boolean {
  return (
    score.tokenCount === 0 ||
    (score.matchedCount >= Math.min(2, score.tokenCount) && score.ratio >= minRatio)
  );
}

function hasSegmentedLexicalSupport(clause: string, normalizedSource: string): boolean {
  const segmentScores = clause
    .split(chineseClauseSegmentBoundaryPattern)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => getLexicalSupportScore(segment, normalizedSource))
    .filter((score) => score.tokenCount >= 2);

  return segmentScores.length > 1 && segmentScores.every((score) => hasTokenSupport(score, 0.25));
}

function hasLexicalSupport(clause: string, sourceText: string): boolean {
  const tokens = tokenizeCitationText(clause);
  if (tokens.length === 0) return true;
  const normalizedSource = sourceText.toLowerCase();
  if (hasTokenSupport(getLexicalSupportScore(clause, normalizedSource), 0.4)) return true;
  if (hasSegmentedLexicalSupport(clause, normalizedSource)) return true;
  if (hasAffirmativeMentionSupport(clause, sourceText)) return true;
  return !hasComparableScript(clause, sourceText);
}

function parseChineseChapterNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^十$/.test(normalized)) return 10;
  if (normalized.startsWith('十')) {
    const ones = normalized.slice(1);
    return 10 + (chineseChapterDigits[ones] ?? 0);
  }
  if (normalized.includes('十')) {
    const [tens = '', ones = ''] = normalized.split('十');
    return (chineseChapterDigits[tens] ?? 0) * 10 + (chineseChapterDigits[ones] ?? 0);
  }
  return chineseChapterDigits[normalized] ?? null;
}

function extractChapterNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const match of text.matchAll(/Chapter\s+(\d+)/gi)) {
    numbers.add(Number(match[1]));
  }
  for (const match of text.matchAll(/第\s*([一二三四五六七八九十]+|\d+)\s*[章节卷部篇回]/g)) {
    const value = match[1];
    if (!value) continue;
    const number = /^\d+$/.test(value) ? Number(value) : parseChineseChapterNumber(value);
    if (number) numbers.add(number);
  }
  return [...numbers];
}

function hasConflictingChapterReference(clause: string, source: ReaderAISource): boolean {
  const clauseChapters = extractChapterNumbers(clause);
  if (clauseChapters.length === 0) return false;
  const sourceChapters = extractChapterNumbers(source.chapterTitle || '');
  if (sourceChapters.length === 0) return false;
  return clauseChapters.some((chapter) => !sourceChapters.includes(chapter));
}

export function validateAnswerCitations(
  answer: string,
  sources: ReaderAISource[],
  options: CitationValidationOptions = {},
): CitationValidationResult {
  const issues: CitationValidationIssue[] = [];
  const citationNumbers = extractCitationMarkers(answer);

  if (
    options.requireCitations &&
    sources.length > 0 &&
    answer.trim() &&
    citationNumbers.length === 0
  ) {
    issues.push({ citationNumber: 0, clause: answer.trim(), issue: 'missing_citation' });
  }

  for (const citationNumber of citationNumbers) {
    const sourceIndex = citationNumber - 1;
    const clause = getCitationClause(answer, citationNumber);
    const source = sources[sourceIndex];
    if (!source) {
      issues.push({ citationNumber, clause, issue: 'missing_source' });
      continue;
    }

    const sourceText = getSourcePreviewText(source);
    if (!sourceText.trim()) {
      issues.push({ citationNumber, sourceIndex, clause, issue: 'empty_source' });
      continue;
    }

    if (absencePattern.test(clause) && !sourceAbsencePattern.test(sourceText)) {
      issues.push({ citationNumber, sourceIndex, clause, issue: 'invalid_absence_citation' });
      continue;
    }

    if (hasConflictingChapterReference(clause, source)) {
      issues.push({ citationNumber, sourceIndex, clause, issue: 'unsupported_clause' });
      continue;
    }

    if (!hasLexicalSupport(clause, sourceText)) {
      issues.push({ citationNumber, sourceIndex, clause, issue: 'unsupported_clause' });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function buildGroundedInsufficientAnswer({
  spoilerProtection,
  readerPage,
  reason,
}: GroundedInsufficientAnswerOptions): string {
  const scope = spoilerProtection ? `已读到第 ${readerPage} 页的内容` : '当前已索引的全书内容';
  const detail =
    reason === 'invalid_citations'
      ? '找到的片段还不足以稳定支撑一个带引用的回答'
      : '没有找到足够直接的原文依据';
  return `我在${scope}里做了检索和二次确认，但${detail}。为了避免误导，我不能仅凭猜测回答这个问题。`;
}

export function buildCitationRepairPrompt({
  answer,
  sources,
  issues,
}: CitationRepairPromptOptions): string {
  const sourceText = sources
    .map(
      (source, index) =>
        `[Source ${index + 1}: ${source.chapterTitle}]\n${getSourcePreviewText(source)}`,
    )
    .join('\n\n');
  const issueText = issues
    .map((issue) => `- [${issue.citationNumber}] ${issue.issue}: ${issue.clause}`)
    .join('\n');
  return `REPAIR CITATIONS\nReturn only the corrected answer text.\nRules:\n- Use only citation numbers present in the source list.\n- Remove unsupported claims instead of inventing support.\n- Keep the answer concise and in the original language.\n\nANSWER:\n${answer}\n\nISSUES:\n${issueText}\n\nSOURCES:\n${sourceText}`;
}
