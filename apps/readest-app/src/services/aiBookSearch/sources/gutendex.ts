import type { AIBookDownloadLink, AIBookSearchIntent, AIBookSearchResult } from '../types';

interface GutendexAuthor {
  name?: string;
}

interface GutendexBook {
  id: number;
  title?: string;
  authors?: GutendexAuthor[];
  languages?: string[];
  copyright?: boolean | null;
  formats?: Record<string, string>;
}

interface GutendexResponse {
  results?: GutendexBook[];
}

const FORMAT_BY_MIME: Array<{ marker: string; format: AIBookDownloadLink['format'] }> = [
  { marker: 'application/epub+zip', format: 'epub' },
  { marker: 'application/pdf', format: 'pdf' },
  { marker: 'application/x-mobipocket-ebook', format: 'mobi' },
  { marker: 'text/plain', format: 'txt' },
  { marker: 'text/html', format: 'html' },
];

const buildGutendexUrl = (intent: AIBookSearchIntent) => {
  const params = new URLSearchParams({ search: intent.query });
  if (intent.language && intent.language !== 'both') params.set('languages', intent.language);
  return `https://gutendex.com/books?${params.toString()}`;
};

const normalizeDownloadLinks = (formats: Record<string, string> | undefined) => {
  if (!formats) return [];

  const links: AIBookDownloadLink[] = [];
  for (const [mimeType, url] of Object.entries(formats)) {
    const matched = FORMAT_BY_MIME.find(({ marker }) => mimeType.toLowerCase().includes(marker));
    if (!matched || !url) continue;
    if (links.some((link) => link.format === matched.format)) continue;
    links.push({ format: matched.format, url, mimeType, risk: 'direct-open', source: 'gutendex' });
  }
  return links;
};

const getCoverUrl = (formats: Record<string, string> | undefined) => {
  if (!formats) return undefined;
  const coverEntry = Object.entries(formats).find(([mimeType]) =>
    mimeType.toLowerCase().includes('image/'),
  );
  return coverEntry?.[1];
};

export const searchGutendex = async (intent: AIBookSearchIntent): Promise<AIBookSearchResult[]> => {
  const response = await fetch(buildGutendexUrl(intent));
  if (!response.ok) return [];

  const data = (await response.json()) as GutendexResponse;
  return (data.results ?? []).flatMap((book) => {
    const title = book.title?.trim();
    if (!title) return [];

    const downloadLinks = normalizeDownloadLinks(book.formats).filter(
      (link) => !intent.formats || intent.formats.includes(link.format),
    );
    const authors = (book.authors ?? [])
      .map((author) => author.name?.trim())
      .filter((name): name is string => !!name);
    const externalUrl = `https://www.gutenberg.org/ebooks/${book.id}`;
    const isPublicDomain = book.copyright === false;
    if (intent.publicDomainOnly && !isPublicDomain) return [];

    return [
      {
        id: `gutendex:${book.id}`,
        title,
        authors,
        source: 'gutendex' as const,
        language: book.languages?.[0],
        licenseLabel: isPublicDomain ? 'Public domain' : undefined,
        risk: downloadLinks.length > 0 ? ('direct-open' as const) : ('external-warning' as const),
        tier: 1 as const,
        coverUrl: getCoverUrl(book.formats),
        formats: downloadLinks.map((link) => link.format),
        isPublicDomain,
        availability:
          downloadLinks.length > 0 ? ('downloadable' as const) : ('read-online' as const),
        matchedQuery: intent.query,
        sourceLinks: [
          {
            source: 'gutendex' as const,
            url: externalUrl,
            label: 'Project Gutenberg',
            risk: 'external-warning' as const,
          },
        ],
        downloadLinks,
        externalUrl,
      },
    ];
  });
};
