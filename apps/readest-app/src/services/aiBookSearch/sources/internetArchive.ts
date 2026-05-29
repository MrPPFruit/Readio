import type { AIBookFormat, AIBookSearchIntent, AIBookSearchResult } from '../types';

interface InternetArchiveFile {
  name?: string;
  format?: string;
}

interface InternetArchiveDoc {
  identifier?: string;
  title?: string;
  creator?: string | string[];
  year?: number;
  language?: string | string[];
  description?: string;
  files?: InternetArchiveFile[];
}

interface InternetArchiveResponse {
  response?: {
    docs?: InternetArchiveDoc[];
  };
}

const toStringArray = (value: string | string[] | undefined) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const normalizeLanguage = (language: string | undefined) => {
  const lowerLanguage = language?.toLowerCase();
  if (lowerLanguage === 'eng' || lowerLanguage === 'english') return 'en';
  if (lowerLanguage === 'chi' || lowerLanguage === 'zho' || lowerLanguage === 'chinese')
    return 'zh';
  return language;
};

const getFormatFromArchiveFile = (file: InternetArchiveFile): AIBookFormat | undefined => {
  const name = file.name?.toLowerCase() ?? '';
  const format = file.format?.toLowerCase() ?? '';
  if (name.endsWith('.epub') || format.includes('epub')) return 'epub';
  if (name.endsWith('.pdf') || format.includes('pdf')) return 'pdf';
  if (name.endsWith('.mobi') || format.includes('mobi')) return 'mobi';
  if (name.endsWith('.txt') || format.includes('text')) return 'txt';
  if (name.endsWith('.html') || name.endsWith('.htm') || format.includes('html')) return 'html';
  return undefined;
};

const escapeArchiveQueryPhrase = (query: string) => query.replace(/["\\]/gu, '\\$&');

const getArchiveFileFormats = (files: InternetArchiveFile[] | undefined) => [
  ...new Set(
    (files ?? []).flatMap((file) => {
      const format = getFormatFromArchiveFile(file);
      return format ? [format] : [];
    }),
  ),
];

export const searchInternetArchive = async (
  intent: AIBookSearchIntent,
): Promise<AIBookSearchResult[]> => {
  const query = intent.searchQueries.archive || intent.query;
  const params = new URLSearchParams({
    q: `title:("${escapeArchiveQueryPhrase(query)}") AND mediatype:(texts)`,
    output: 'json',
    rows: '10',
    fl: 'identifier,title,creator,year,language,description,files',
  });
  const response = await fetch(`https://archive.org/advancedsearch.php?${params.toString()}`);
  if (!response.ok) return [];

  const data = (await response.json()) as InternetArchiveResponse;
  return (data.response?.docs ?? []).flatMap((doc) => {
    const identifier = doc.identifier?.trim();
    const title = doc.title?.trim();
    if (!identifier || !title) return [];
    const externalUrl = `https://archive.org/details/${identifier}`;
    const formats = getArchiveFileFormats(doc.files);

    return [
      {
        id: `internet-archive:${identifier}`,
        title,
        authors: toStringArray(doc.creator),
        source: 'internet-archive' as const,
        description: doc.description,
        language: normalizeLanguage(toStringArray(doc.language)[0]),
        year: doc.year,
        risk: 'external-warning' as const,
        tier: 2 as const,
        formats,
        downloadLinks: [],
        sourceLinks: [
          {
            source: 'internet-archive' as const,
            url: externalUrl,
            label: 'Internet Archive',
            risk: 'external-warning' as const,
          },
        ],
        availability: 'read-online' as const,
        matchedQuery: query,
        externalUrl,
      },
    ];
  });
};
