import type { AIBookSearchIntent, AIBookSearchResult } from '../types';

const APPROVED_GITHUB_REPOS = [
  '0voice/expert_readed_books',
  'EbookFoundation/free-programming-books',
  'justjavac/free-programming-books-zh_CN',
  'CyC2018/CS-Notes',
  'jwasham/coding-interview-university',
  'hehonghui/awesome-english-ebooks',
  'kanasimi/work_crawler',
];

const BOOK_FILE_PATTERN = /(?:book|ebook|epub|pdf|mobi|txt|编程|书籍|reading|readed)/i;
const BOOK_FILE_EXTENSION_PATTERN = /\.(?:md|pdf|epub|mobi|txt|html?)$/i;
const IGNORED_FILE_PATTERN = /(?:^|\/)readme(?:\.[^/]*)?$/i;

const hasCjk = (text: string) => /[\u3400-\u9fff]/u.test(text);

const isQueryTooShort = (query: string) => {
  const trimmed = query.trim();
  if (hasCjk(trimmed)) return [...trimmed].length < 2;
  return trimmed.length < 3;
};

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

const uniqueSearchQueries = (queries: Array<string | undefined>) => {
  const seen = new Set<string>();
  return queries.flatMap((query) => {
    const trimmed = query?.trim();
    if (!trimmed) return [];
    const key = trimmed.toLowerCase();
    if (seen.has(key) || isQueryTooShort(trimmed)) return [];
    seen.add(key);
    return [trimmed];
  });
};

const getGitHubMatchQueries = (intent: AIBookSearchIntent) =>
  uniqueSearchQueries([
    intent.searchQueries.github,
    intent.query,
    intent.title,
    ...intent.books.flatMap((book) => [
      book.titleZh && book.author ? `${book.titleZh} ${book.author}` : book.titleZh,
      book.titleEn && book.author ? `${book.titleEn} ${book.author}` : book.titleEn,
      book.titleZh,
      book.titleEn,
    ]),
  ]);

const getQueryTokens = (query: string) =>
  query
    .toLowerCase()
    .split(/[\s\-_/.:：，,]+/u)
    .map((token) => token.trim())
    .filter(
      (token) => token.length >= 2 && !['book', 'books', 'ebook', 'epub', 'pdf'].includes(token),
    );

const matchesBookFile = (path: string, query: string) => {
  if (IGNORED_FILE_PATTERN.test(path)) return false;
  const lowerPath = path.toLowerCase();
  const tokens = getQueryTokens(query);
  const hasQueryMatch = tokens.length > 0 && tokens.some((token) => lowerPath.includes(token));
  return hasQueryMatch && (BOOK_FILE_PATTERN.test(path) || BOOK_FILE_EXTENSION_PATTERN.test(path));
};

const isGitHubRateLimited = (response: Response) =>
  (response.status === 403 || response.status === 429) &&
  response.headers.get('x-ratelimit-remaining') === '0';

const formatGitHubResetTime = (response: Response) => {
  const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(resetSeconds) || resetSeconds <= 0) return undefined;
  return new Date(resetSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const throwIfGitHubRateLimited = (response: Response) => {
  if (!isGitHubRateLimited(response)) return;
  const resetTime = formatGitHubResetTime(response);
  throw new Error(
    resetTime ? `GitHub API 已限流，约 ${resetTime} 恢复` : 'GitHub API 已限流，稍后再试',
  );
};

const isGitHubRateLimitError = (error: unknown) =>
  error instanceof Error && error.message.includes('GitHub API 已限流');

const normalizeTreeResult = (
  repo: string,
  path: string,
  intent: AIBookSearchIntent,
): AIBookSearchResult => {
  const encodedPath = encodePath(path);
  const externalUrl = `https://github.com/${repo}/blob/HEAD/${encodedPath}`;
  return {
    id: `github:${repo}:${path}`,
    title: path.split('/').at(-1) ?? path,
    authors: [repo.split('/')[0] ?? 'GitHub'],
    source: 'github',
    risk: 'external-warning',
    tier: 1,
    downloadLinks: [],
    sourceLinks: [
      {
        source: 'github',
        url: externalUrl,
        label: 'GitHub',
        risk: 'external-warning',
      },
    ],
    availability: 'external-search',
    matchedQuery: intent.searchQueries.github,
    externalUrl,
  };
};

const searchRepoTree = async (repo: string, intent: AIBookSearchIntent) => {
  const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`);
  throwIfGitHubRateLimited(response);
  if (!response.ok) return [];

  const data = (await response.json()) as {
    tree?: Array<{ path?: string; type?: string }>;
  };
  const queries = getGitHubMatchQueries(intent);

  return (data.tree ?? [])
    .filter(
      (item) =>
        item.type === 'blob' &&
        item.path &&
        queries.some((query) => matchesBookFile(item.path ?? '', query)),
    )
    .slice(0, 5)
    .map((item) => normalizeTreeResult(repo, item.path ?? '', intent));
};

const discoverRepos = async (query: string) => {
  const params = new URLSearchParams({
    q: `${query} books`,
    sort: 'stars',
    per_page: '3',
  });
  const response = await fetch(`https://api.github.com/search/repositories?${params.toString()}`);
  throwIfGitHubRateLimited(response);
  if (!response.ok) return [];

  const data = (await response.json()) as {
    items?: Array<{ full_name?: string }>;
  };
  return (data.items ?? []).map((item) => item.full_name).filter((repo): repo is string => !!repo);
};

export const searchGitHubBooks = async (
  intent: AIBookSearchIntent,
): Promise<AIBookSearchResult[]> => {
  const query = intent.searchQueries.github || intent.query;
  if (isQueryTooShort(query)) return [];

  const discoveredRepos = await discoverRepos(query);
  const repos = [...APPROVED_GITHUB_REPOS, ...discoveredRepos];
  const repoResults = await Promise.allSettled(repos.map((repo) => searchRepoTree(repo, intent)));
  const rateLimitFailure = repoResults.find(
    (result) => result.status === 'rejected' && isGitHubRateLimitError(result.reason),
  );
  if (rateLimitFailure?.status === 'rejected') throw rateLimitFailure.reason;

  return repoResults.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
};
