import type { AIBookSearchIntent, AIBookSearchResult } from '../types';

interface OpenLibraryDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  language?: string[];
  first_publish_year?: number;
  cover_i?: number;
  ia?: string[];
}

interface OpenLibraryResponse {
  docs?: OpenLibraryDoc[];
}

const buildOpenLibraryUrl = (intent: AIBookSearchIntent) => {
  const params = new URLSearchParams({ q: intent.query, limit: '10' });
  return `https://openlibrary.org/search.json?${params.toString()}`;
};

const normalizeLanguage = (languages: string[] | undefined) => {
  const language = languages?.[0];
  if (language === 'eng') return 'en';
  if (language === 'chi' || language === 'zho') return 'zh';
  return language;
};

export const searchOpenLibrary = async (
  intent: AIBookSearchIntent,
): Promise<AIBookSearchResult[]> => {
  const response = await fetch(buildOpenLibraryUrl(intent));
  if (!response.ok) return [];

  const data = (await response.json()) as OpenLibraryResponse;
  return (data.docs ?? []).flatMap((doc) => {
    const title = doc.title?.trim();
    const key = doc.key?.trim();
    if (!title || !key) return [];

    const externalUrl = `https://openlibrary.org${key}`;
    return [
      {
        id: `open-library:${key}`,
        title,
        authors: doc.author_name ?? [],
        source: 'open-library' as const,
        language: normalizeLanguage(doc.language),
        year: doc.first_publish_year,
        risk: 'external-warning' as const,
        tier: 1 as const,
        coverUrl: doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          : undefined,
        downloadLinks: [],
        sourceLinks: [
          {
            source: 'open-library' as const,
            url: externalUrl,
            label: 'Open Library',
            risk: 'external-warning' as const,
          },
        ],
        availability: doc.ia?.length ? ('read-online' as const) : ('unknown' as const),
        matchedQuery: intent.searchQueries.openLibrary,
        externalUrl,
      },
    ];
  });
};
