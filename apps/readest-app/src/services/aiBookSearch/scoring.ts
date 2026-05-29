import type { AIBookSearchIntent, AIBookSearchResult } from './types';
import { normalizeAIBookText } from './dedupe';

const hasCjk = (text: string) => /[\u3400-\u9fff]/u.test(text);

const NOISE_PATTERN =
  /study guide|summary|workout|fanfic|fan-fiction|doujin|parody|crossover|同人|论文|journal|proceedings/i;

const candidateTitles = (intent: AIBookSearchIntent) =>
  [intent.title, intent.query, ...intent.books.flatMap((book) => [book.titleZh, book.titleEn])]
    .map((title) => normalizeAIBookText(title ?? ''))
    .filter(Boolean);

const candidateAuthors = (intent: AIBookSearchIntent) =>
  [intent.author, ...intent.books.map((book) => book.author)]
    .map((author) => normalizeAIBookText(author ?? ''))
    .filter(Boolean);

export const calculateAIBookScore = (result: AIBookSearchResult, intent: AIBookSearchIntent) => {
  const query = normalizeAIBookText(intent.query);
  const title = normalizeAIBookText(result.title);
  const author = normalizeAIBookText(result.authors[0] ?? '');
  const queryTokens = query.split(' ').filter(Boolean);
  const titles = candidateTitles(intent);
  const authors = candidateAuthors(intent);
  let score = 0;

  if (titles.some((candidate) => title === candidate)) score += 80;
  else if (titles.some((candidate) => title.startsWith(candidate))) score += 60;
  else if (
    titles.some(
      (candidate) => hasCjk(candidate) && candidate.length <= 4 && title.includes(candidate),
    )
  ) {
    score += title.length <= Math.max(...titles.map((candidate) => candidate.length)) * 3 ? 45 : 5;
  } else if (titles.some((candidate) => title.includes(candidate) || candidate.includes(title)))
    score += 30;
  else if (queryTokens.length > 0 && queryTokens.every((token) => title.includes(token)))
    score += 25;

  if (authors.some((candidate) => author.includes(candidate))) score += 30;
  else if (queryTokens.some((token) => author.includes(token))) score += 10;

  if (intent.language && intent.language !== 'both' && result.language) {
    score += result.language === intent.language ? 8 : -12;
  }

  if (NOISE_PATTERN.test(result.title)) score -= 35;
  if (result.source === 'gutendex') score += 15;
  if (result.source === 'open-library') score += 5;
  if (result.downloadLinks.some((link) => link.format === 'epub')) score += 5;
  if (result.description) score += 3;
  if (result.coverUrl) score += 2;
  if (result.isPublicDomain) score += 10;

  return Math.max(0, Math.min(99, score));
};

export const sortAIBookResults = (results: AIBookSearchResult[]) =>
  [...results].sort(
    (a, b) =>
      (b.aiScore ?? b.score ?? 0) - (a.aiScore ?? a.score ?? 0) || (b.score ?? 0) - (a.score ?? 0),
  );
