import type { AIBookSearchIntent, AIBookSearchResult } from './types';

const NOISE_PATTERN =
  /fanfic|fan-fiction|doujin|parody|crossover|同人|论文|journal|proceedings|study guide|summary|workout/i;

export const isNoisyAIBookResult = (result: AIBookSearchResult, intent: AIBookSearchIntent) => {
  if (result.title.length > 80) return true;
  if (NOISE_PATTERN.test(result.title)) {
    const normalizedTitle = result.title.toLowerCase();
    const normalizedQuery = intent.query.toLowerCase();
    if (result.source === 'internet-archive' && normalizedTitle.startsWith(normalizedQuery))
      return false;
    const knownTitles = intent.books
      .flatMap((book) => [book.titleZh, book.titleEn])
      .filter((title): title is string => !!title);
    return ![normalizedQuery, ...knownTitles.map((title) => title.toLowerCase())].some(
      (title) => normalizedTitle === title,
    );
  }
  return false;
};

export const filterNoisyAIBookResults = (
  results: AIBookSearchResult[],
  intent: AIBookSearchIntent,
) => results.filter((result) => !isNoisyAIBookResult(result, intent));
