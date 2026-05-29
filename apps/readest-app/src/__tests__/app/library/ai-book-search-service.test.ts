import { afterEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, tauriFetchMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  tauriFetchMock: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: generateTextMock,
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: tauriFetchMock,
}));

import { canDirectDownloadAIBookFile, downloadAIBookFile } from '@/services/aiBookSearch/download';
import {
  AGGREGATION_SEARCH_DOMAINS,
  buildAggregationSearchUrl,
} from '@/services/aiBookSearch/domainRegistry';
import {
  parseAIBookSearchIntentFallback,
  searchAIBooks,
  searchAIBooksTier1,
  searchAIBooksTier2,
} from '@/services/aiBookSearch/searchService';
import { dedupeAIBookResults, removeExistingAIBookResults } from '@/services/aiBookSearch/dedupe';
import type { AIBookSearchProgressEvent, AIBookSearchResult } from '@/services/aiBookSearch/types';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { searchGitHubBooks } from '@/services/aiBookSearch/sources/github';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const statusJsonResponse = (status: number, body: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  generateTextMock.mockReset();
  tauriFetchMock.mockReset();
});

describe('ai book search service', () => {
  const gutendexFrankensteinResponse = () =>
    jsonResponse({
      results: [
        {
          id: 84,
          title: 'Frankenstein; Or, The Modern Prometheus',
          authors: [{ name: 'Mary Wollstonecraft Shelley' }],
          languages: ['en'],
          copyright: false,
          formats: {
            'application/epub+zip': 'https://www.gutenberg.org/ebooks/84.epub3.images',
            'text/plain; charset=utf-8': 'https://www.gutenberg.org/files/84/84-0.txt',
          },
        },
      ],
    });

  it('normalizes Gutendex downloadable EPUB and TXT formats', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) return gutendexFrankensteinResponse();
      return jsonResponse({ docs: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchAIBooks('frankenstein', DEFAULT_AI_SETTINGS);

    const result = results[0];
    expect(result).toMatchObject({
      title: 'Frankenstein; Or, The Modern Prometheus',
      source: 'gutendex',
      risk: 'direct-open',
    });
    expect(result?.downloadLinks.map((link) => link.format)).toEqual(['epub', 'txt']);
  });

  it('keeps basic fallback progress free of AI-only wording', async () => {
    const progressEvents: AIBookSearchProgressEvent[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) return gutendexFrankensteinResponse();
      return jsonResponse({ docs: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchAIBooksTier1('frankenstein', DEFAULT_AI_SETTINGS, {
      onProgress: (event) => progressEvents.push(event),
    });

    const messages = progressEvents.map((event) => event.message).join('\n');
    expect(messages).toContain('正在准备基础搜索关键词');
    expect(messages).toContain('正在整理重复结果');
    expect(messages).not.toMatch(/AI|理解/);
  });

  it('waits long enough for Gutendex direct downloads before skipping the source', async () => {
    vi.useFakeTimers();
    const progressEvents: AIBookSearchProgressEvent[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) {
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(gutendexFrankensteinResponse()), 9000);
        });
      }
      return Promise.resolve(jsonResponse({ docs: [] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const responsePromise = searchAIBooksTier1('frankenstein', DEFAULT_AI_SETTINGS, {
      onProgress: (event) => progressEvents.push(event),
    });
    await vi.advanceTimersByTimeAsync(9000);
    const response = await responsePromise;

    const result = response.results[0];
    expect(result).toMatchObject({
      source: 'gutendex',
      risk: 'direct-open',
    });
    expect(result?.downloadLinks.map((link) => link.format)).toEqual(['epub', 'txt']);
    expect(progressEvents.map((event) => event.message).join('\n')).not.toContain(
      'Gutendex 连接超时',
    );
  });

  it('normalizes Open Library metadata as an external source result', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) return jsonResponse({ results: [] });
      return jsonResponse({
        docs: [
          {
            key: '/works/OL45883W',
            title: 'The Left Hand of Darkness',
            author_name: ['Ursula K. Le Guin'],
            language: ['eng'],
            first_publish_year: 1969,
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchAIBooks('left hand of darkness', DEFAULT_AI_SETTINGS);

    const result = results[0];
    expect(result).toMatchObject({
      title: 'The Left Hand of Darkness',
      source: 'open-library',
      risk: 'external-warning',
      externalUrl: 'https://openlibrary.org/works/OL45883W',
    });
    expect(result?.downloadLinks).toEqual([]);
  });

  it('deduplicates matching title and author across sources while keeping downloadable links first', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) {
        return jsonResponse({
          results: [
            {
              id: 11,
              title: 'Pride and Prejudice',
              authors: [{ name: 'Jane Austen' }],
              languages: ['en'],
              copyright: false,
              formats: {
                'application/epub+zip': 'https://www.gutenberg.org/ebooks/11.epub3.images',
              },
            },
          ],
        });
      }
      return jsonResponse({
        docs: [
          {
            key: '/works/OL66554W',
            title: 'Pride and Prejudice',
            author_name: ['Jane Austen'],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchAIBooks('pride and prejudice', DEFAULT_AI_SETTINGS);

    const result = results[0];
    expect(results).toHaveLength(1);
    expect(result?.source).toBe('gutendex');
    expect(result?.downloadLinks).toHaveLength(1);
  });

  it('deduplicates merged source links for duplicate results', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) return jsonResponse({ results: [] });
      return jsonResponse({
        docs: [
          {
            key: '/works/OL1W',
            title: 'Duplicate Book',
            author_name: ['Same Author'],
          },
          {
            key: '/works/OL1W',
            title: 'Duplicate Book',
            author_name: ['Same Author'],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchAIBooks('duplicate book', DEFAULT_AI_SETTINGS);

    expect(results).toHaveLength(1);
    expect(results[0]?.sourceLinks).toHaveLength(1);
  });

  it('falls back to deterministic search when AI provider parsing is unavailable', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [], docs: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await searchAIBooks('中文 公版 epub', DEFAULT_AI_SETTINGS);

    expect(fetchMock).toHaveBeenCalled();
  });

  it('uses only verified aggregation search domains and blocks known unsafe domains', () => {
    expect(AGGREGATION_SEARCH_DOMAINS.map((domain) => domain.host)).toEqual([
      'z-library.bz',
      'annas-archive.is',
      'annas-archive.gs',
      'annas-archive.li',
      'libgen.li',
    ]);
    expect(AGGREGATION_SEARCH_DOMAINS.some((domain) => domain.host === 'z-lib.is')).toBe(false);
    expect(buildAggregationSearchUrl('z-library', '三体 刘慈欣')).toBe(
      'https://z-library.bz/s/?q=%E4%B8%89%E4%BD%93+%E5%88%98%E6%85%88%E6%AC%A3',
    );
    expect(buildAggregationSearchUrl('missing', 'book')).toBeUndefined();
  });

  it('follows safe same-host Gutenberg redirects when downloading public domain books', async () => {
    const result: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein; Or, The Modern Prometheus',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };
    const link = result.downloadLinks[0];
    if (!link) throw new Error('Expected download link');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.redirect === 'error') throw new TypeError('fetch failed');
      return new Response(new Blob(['book'], { type: 'application/epub+zip' }), {
        status: 200,
        headers: { 'Content-Type': 'application/epub+zip' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = await downloadAIBookFile(result, link);

    expect(file.name).toBe('84.epub3.images.epub');
    expect(file.type).toBe('application/epub+zip');
  });

  it('uses Tauri HTTP fetch for direct downloads in the Android app', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'tauri');
    const result: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein; Or, The Modern Prometheus',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };
    const link = result.downloadLinks[0];
    if (!link) throw new Error('Expected download link');
    tauriFetchMock.mockResolvedValue(
      new Response(new Blob(['book'], { type: 'application/epub+zip' }), {
        status: 200,
        headers: { 'Content-Type': 'application/epub+zip' },
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('CORS blocked');
      }),
    );

    const file = await downloadAIBookFile(result, link);

    expect(file.type).toBe('application/epub+zip');
    expect(tauriFetchMock).toHaveBeenCalledWith(link.url);
  });

  it('blocks redirected direct downloads when the final URL leaves open-source hosts', async () => {
    const result: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein; Or, The Modern Prometheus',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };
    const link = result.downloadLinks[0];
    if (!link) throw new Error('Expected download link');
    const response = new Response(new Blob(['book'], { type: 'application/epub+zip' }), {
      status: 200,
      headers: { 'Content-Type': 'application/epub+zip' },
    });
    Object.defineProperty(response, 'url', { value: 'https://example.com/book.epub' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(downloadAIBookFile(result, link)).rejects.toThrow(
      'Downloaded response is not from an allowed source',
    );
  });

  it('blocks direct downloads from aggregation sources even when a direct link is present', async () => {
    const result: AIBookSearchResult = {
      id: 'aggregation:zlibrary',
      title: 'Aggregated Book',
      authors: [],
      source: 'aggregation',
      risk: 'direct-open',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://z-library.bz/d/book.epub',
          risk: 'direct-open',
          source: 'aggregation',
        },
      ],
      sourceLinks: [],
      externalUrl: 'https://z-library.bz/s/?q=book',
    };
    const link = result.downloadLinks[0];
    if (!link) throw new Error('Expected download link');

    await expect(downloadAIBookFile(result, link)).rejects.toThrow(
      'Direct download is not allowed for this source',
    );
  });

  it('blocks direct downloads from non-open source domains', async () => {
    const result: AIBookSearchResult = {
      id: 'external:1',
      title: 'Unknown Book',
      authors: [],
      source: 'aggregation',
      risk: 'external-warning',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://example.com/book.epub',
          risk: 'external-warning',
        },
      ],
      sourceLinks: [
        {
          source: 'aggregation',
          url: 'https://example.com/search?q=book',
          risk: 'external-warning',
        },
      ],
      externalUrl: 'https://example.com/search?q=book',
    };

    const link = result.downloadLinks[0];
    if (!link) throw new Error('Expected download link');
    await expect(downloadAIBookFile(result, link)).rejects.toThrow(
      'Direct download is not allowed for this source',
    );
  });

  it('creates prototype-level fallback intent with language-specific book fields', () => {
    const intent = parseAIBookSearchIntentFallback('三体 刘慈欣 epub');

    expect(intent).toMatchObject({
      query: '三体 刘慈欣',
      language: 'zh',
      formats: ['epub'],
      searchQueries: {
        archive: '三体 刘慈欣',
        openLibrary: '三体 刘慈欣',
        github: '三体 刘慈欣',
      },
    });
    expect(intent.books[0]).toMatchObject({
      titleZh: '三体 刘慈欣',
      author: '刘慈欣',
    });
  });

  it('removes format words from fallback source queries while preserving requested formats', () => {
    const intent = parseAIBookSearchIntentFallback('Frankenstein epub pdf');

    expect(intent).toMatchObject({
      query: 'Frankenstein',
      title: 'Frankenstein',
      formats: ['epub', 'pdf'],
      searchQueries: {
        archive: 'Frankenstein',
        openLibrary: 'Frankenstein',
        github: 'Frankenstein',
      },
    });
    expect(intent.books[0]).toMatchObject({ titleEn: 'Frankenstein' });
  });

  it('returns tier 1 results with progress events and prototype metadata fields', async () => {
    const progressEvents: AIBookSearchProgressEvent[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) {
        return jsonResponse({
          results: [
            {
              id: 84,
              title: 'Frankenstein; Or, The Modern Prometheus',
              authors: [{ name: 'Mary Wollstonecraft Shelley' }],
              languages: ['en'],
              copyright: false,
              formats: {
                'application/epub+zip': 'https://www.gutenberg.org/ebooks/84.epub3.images',
                'image/jpeg': 'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg',
              },
            },
          ],
        });
      }
      if (url.includes('openlibrary.org')) return jsonResponse({ docs: [] });
      return jsonResponse({ tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await searchAIBooksTier1('frankenstein epub', DEFAULT_AI_SETTINGS, {
      onProgress: (event) => progressEvents.push(event),
    });

    expect(response.intent.searchQueries.github).toBe('frankenstein');
    expect(response.results[0]).toMatchObject({
      title: 'Frankenstein; Or, The Modern Prometheus',
      source: 'gutendex',
      tier: 1,
      coverUrl: 'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg',
      isPublicDomain: true,
    });
    expect(response.results[0]?.sourceLinks[0]).toMatchObject({
      source: 'gutendex',
      url: 'https://www.gutenberg.org/ebooks/84',
      risk: 'external-warning',
    });
    expect(progressEvents.map((event) => event.step)).toContain('tier1-sources');
  });

  it('returns tier 2 results without duplicating existing tier 1 results', async () => {
    const existing: AIBookSearchResult[] = [
      {
        id: 'gutendex:84',
        title: 'Frankenstein; Or, The Modern Prometheus',
        authors: ['Mary Wollstonecraft Shelley'],
        source: 'gutendex',
        risk: 'direct-open',
        tier: 1,
        downloadLinks: [],
        sourceLinks: [],
        externalUrl: 'https://www.gutenberg.org/ebooks/84',
      },
    ];
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        response: {
          docs: [
            {
              identifier: 'frankenstein_mary_shelley',
              title: 'Frankenstein; Or, The Modern Prometheus',
              creator: ['Mary Wollstonecraft Shelley'],
              year: 1818,
            },
            {
              identifier: 'frankenstein_1818_edition',
              title: 'Frankenstein 1818 Edition',
              creator: ['Mary Wollstonecraft Shelley'],
              year: 1818,
            },
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('frankenstein');
    const response = await searchAIBooksTier2(
      'frankenstein',
      intent,
      existing,
      DEFAULT_AI_SETTINGS,
    );

    expect(response.results.map((result) => result.id)).not.toContain(
      'internet-archive:frankenstein_mary_shelley',
    );
    expect(response.results[0]).toMatchObject({
      id: 'internet-archive:frankenstein_1818_edition',
      source: 'internet-archive',
      tier: 2,
      risk: 'external-warning',
    });
  });

  it('escapes quotes in Internet Archive title queries', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({ response: { docs: [] } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('the "left" hand');
    await searchAIBooksTier2(intent.query, intent, [], DEFAULT_AI_SETTINGS);

    expect(fetchMock).toHaveBeenCalled();
    const requestUrl = fetchMock.mock.calls[0]?.[0];
    if (!requestUrl) throw new Error('Expected Internet Archive request');
    expect(new URL(requestUrl.toString()).searchParams.get('q')).toContain(
      'title:("the \\"left\\" hand")',
    );
  });

  it('normalizes Internet Archive file formats without repeating file links as source rows', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        response: {
          docs: [
            {
              identifier: 'lefthanddarkness00legu',
              title: 'The Left Hand of Darkness',
              creator: ['Ursula K. Le Guin'],
              year: 1969,
              language: ['English'],
              description: 'A science fiction novel.',
              files: [
                { name: 'lefthanddarkness00legu.epub', format: 'EPUB' },
                { name: 'lefthanddarkness00legu.pdf', format: 'PDF' },
                { name: 'lefthanddarkness00legu_meta.xml', format: 'Metadata' },
              ],
            },
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('left hand darkness');
    const response = await searchAIBooksTier2(
      'left hand darkness',
      intent,
      [],
      DEFAULT_AI_SETTINGS,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        'fl=identifier%2Ctitle%2Ccreator%2Cyear%2Clanguage%2Cdescription%2Cfiles',
      ),
    );
    expect(response.results[0]).toMatchObject({
      id: 'internet-archive:lefthanddarkness00legu',
      language: 'en',
      availability: 'read-online',
      downloadLinks: [],
      formats: ['epub', 'pdf'],
    });
    expect(response.results[0]?.sourceLinks).toEqual([
      expect.objectContaining({
        source: 'internet-archive',
        url: 'https://archive.org/details/lefthanddarkness00legu',
        risk: 'external-warning',
      }),
    ]);
  });

  it('filters noisy Internet Archive deep-search results before returning tier 2 results', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        response: {
          docs: [
            {
              identifier: 'left_hand',
              title: 'The Left Hand of Darkness',
              creator: ['Ursula K. Le Guin'],
              language: ['eng'],
            },
            {
              identifier: 'left_hand_study',
              title: 'The Left Hand of Darkness Study Guide',
              creator: ['Notes Author'],
              language: ['eng'],
            },
          ],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('left hand darkness');
    const response = await searchAIBooksTier2(
      'left hand darkness',
      intent,
      [],
      DEFAULT_AI_SETTINGS,
    );

    expect(response.results.map((result) => result.id)).toEqual(['internet-archive:left_hand']);
  });

  it('normalizes Open Library cover without exposing Internet Archive as a tier 1 source link', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('archive.org')) throw new Error('Tier 1 should not query Internet Archive');
      if (url.includes('gutendex.com')) return jsonResponse({ results: [] });
      if (url.includes('api.github.com')) return jsonResponse({ tree: [], items: [] });
      return jsonResponse({
        docs: [
          {
            key: '/works/OL45883W',
            title: 'The Left Hand of Darkness',
            author_name: ['Ursula K. Le Guin'],
            language: ['eng'],
            first_publish_year: 1969,
            cover_i: 8231856,
            ia: ['lefthanddarkness00legu'],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await searchAIBooksTier1('left hand of darkness', DEFAULT_AI_SETTINGS);

    expect(response.results[0]).toMatchObject({
      source: 'open-library',
      coverUrl: 'https://covers.openlibrary.org/b/id/8231856-M.jpg',
      availability: 'read-online',
    });
    expect(response.results[0]?.sourceLinks).toEqual([
      expect.objectContaining({
        source: 'open-library',
        url: 'https://openlibrary.org/works/OL45883W',
      }),
    ]);
  });

  it('uses the original query for tier 1 Open Library search even when AI intent provides a translated query', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) return jsonResponse({ results: [] });
      if (url.includes('api.github.com')) return jsonResponse({ tree: [], items: [] });
      return jsonResponse({ docs: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('三体 刘慈欣');
    intent.searchQueries.openLibrary = 'The Three-Body Problem Liu Cixin';
    await searchAIBooksTier1(intent.query, DEFAULT_AI_SETTINGS, { initialIntent: intent });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('q=%E4%B8%89%E4%BD%93+%E5%88%98%E6%85%88%E6%AC%A3'),
    );
  });

  it('does not let AI narrow Latin-title searches to Chinese-only Gutendex results', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify({
        query: 'Frankenstein',
        title: 'Frankenstein',
        language: 'zh',
        books: [{ title_en: 'Frankenstein', author: 'Mary Shelley' }],
        search_queries: {
          openlibrary: 'Frankenstein',
          archive: 'Frankenstein',
          github: 'Frankenstein',
        },
      }),
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) {
        if (url.includes('languages=zh')) return jsonResponse({ results: [] });
        return jsonResponse({
          results: [
            {
              id: 84,
              title: 'Frankenstein; Or, The Modern Prometheus',
              authors: [{ name: 'Mary Wollstonecraft Shelley' }],
              languages: ['en'],
              copyright: false,
              formats: {
                'application/epub+zip': 'https://www.gutenberg.org/ebooks/84.epub3.images',
                'text/plain; charset=utf-8': 'https://www.gutenberg.org/files/84/84-0.txt',
              },
            },
          ],
        });
      }
      return jsonResponse({ docs: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await searchAIBooksTier1('Frankenstein', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.intent.language).toBe('both');
    expect(response.results[0]).toMatchObject({
      source: 'gutendex',
      risk: 'direct-open',
    });
    expect(response.results[0]?.downloadLinks.map((link) => link.format)).toEqual(['epub', 'txt']);
  });

  it('cleans AI intent source queries and book titles while preserving requested formats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ results: [], docs: [], tree: [], items: [] })),
    );
    generateTextMock.mockResolvedValueOnce({
      text: `\`\`\`json
{
  "query": "三体 刘慈欣 epub",
  "title": "三体 刘慈欣 epub",
  "language": "zh",
  "formats": ["epub"],
  "books": [{ "title_zh": "三体 epub", "title_en": "The Three-Body Problem epub", "author": "刘慈欣" }],
  "search_queries": {
    "openlibrary": "The Three-Body Problem Liu Cixin epub",
    "archive": "三体 刘慈欣 epub",
    "github": "三体 刘慈欣 epub"
  }
}
\`\`\``,
    });

    const response = await searchAIBooksTier1('三体 刘慈欣 epub', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.intent).toMatchObject({
      query: '三体 刘慈欣',
      title: '三体 刘慈欣',
      formats: ['epub'],
    });
    expect(response.intent.books[0]).toEqual({
      titleZh: '三体',
      titleEn: 'The Three-Body Problem',
      author: '刘慈欣',
    });
    expect(response.intent.searchQueries).toMatchObject({
      openLibrary: 'The Three-Body Problem Liu Cixin',
      archive: '三体 刘慈欣',
      github: '三体 刘慈欣',
    });
  });

  it('falls back to deterministic intent when AI returns invalid JSON', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'not json' });
    const fetchMock = vi.fn(async () =>
      jsonResponse({ results: [], docs: [], tree: [], items: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await searchAIBooksTier1('三体 刘慈欣 epub', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.intent).toMatchObject({
      query: '三体 刘慈欣',
      language: 'zh',
      formats: ['epub'],
      searchQueries: {
        openLibrary: '三体 刘慈欣',
        archive: '三体 刘慈欣',
        github: '三体 刘慈欣',
      },
    });
  });

  it('treats explicit English edition requests as English target language even when the query contains Chinese', () => {
    const intent = parseAIBookSearchIntentFallback('红楼梦 英文版');

    expect(intent.language).toBe('en');
  });

  it('prefers English results when intent language is English even if the original query contains Chinese', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/chinese-red-chamber',
              title: '红楼梦',
              author_name: ['曹雪芹'],
              language: ['chi'],
              cover_i: 2,
            },
            {
              key: '/works/english-red-chamber',
              title: 'Dream of the Red Chamber',
              author_name: ["Ts'ao, Hsueh-ch'in"],
              language: ['eng'],
              cover_i: 1,
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('红楼梦 英文版');
    const response = await searchAIBooksTier1(intent.query, DEFAULT_AI_SETTINGS, {
      initialIntent: {
        ...intent,
        title: 'Dream of the Red Chamber',
        language: 'en',
        books: [{ titleZh: '红楼梦', titleEn: 'Dream of the Red Chamber', author: '曹雪芹' }],
        searchQueries: {
          openLibrary: 'Dream of the Red Chamber',
          archive: 'Dream of the Red Chamber',
          github: 'Dream of the Red Chamber',
        },
      },
    });

    expect(response.results.map((result) => result.id)).toEqual([
      'open-library:/works/english-red-chamber',
    ]);
    expect(response.results[0]?.aiScore).toBeGreaterThanOrEqual(90);
  });

  it('prefers Chinese exact-title results over translated editions for Chinese queries', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/english',
              title: 'Dream of the red chamber',
              author_name: ["Ts'ao, Hsüeh-ch'in"],
              language: ['eng'],
              first_publish_year: 1958,
              cover_i: 1,
            },
            {
              key: '/works/chinese',
              title: '红楼梦',
              author_name: ['曹雪芹', '高鹗'],
              language: ['chi'],
              first_publish_year: 2001,
              cover_i: 2,
            },
            {
              key: '/works/commentary',
              title: '破解天书《红楼梦》',
              author_name: ['Changsheng Feng'],
              language: ['chi'],
              first_publish_year: 2008,
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: '红楼梦',
          language: 'both',
          books: [{ title_zh: '红楼梦', title_en: 'Dream of the Red Chamber', author: '曹雪芹' }],
          search_queries: { openlibrary: '红楼梦', archive: '红楼梦', github: '红楼梦' },
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [
            { id: 'open-library:/works/english', score: 87, reason: 'Translated title match' },
            { id: 'open-library:/works/chinese', score: 8, reason: 'Underscored original title' },
            {
              id: 'open-library:/works/commentary',
              score: 12,
              reason: 'Underscored Chinese related edition',
            },
          ],
        }),
      });

    const response = await searchAIBooksTier1('红楼梦', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.results.map((result) => result.id)).toEqual([
      'open-library:/works/chinese',
      'open-library:/works/commentary',
    ]);
    expect(response.results[0]).toMatchObject({ title: '红楼梦', language: 'zh' });
    expect(response.results[0]?.aiScore).toBeGreaterThan(response.results[1]?.aiScore ?? 0);
  });

  it('does not surface same-language results that do not match the original query', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/chinese-red-chamber',
              title: '红楼梦',
              author_name: ['曹雪芹'],
              language: ['chi'],
              cover_i: 2,
            },
          ],
        });
      }
      if (url.includes('api.github.com/search/repositories')) return jsonResponse({ items: [] });
      if (url.includes('api.github.com/repos/0voice/expert_readed_books/git/trees')) {
        return jsonResponse({
          tree: [{ path: '书籍/redis设计与实现(第二版).pdf', type: 'blob' }],
        });
      }
      if (url.includes('api.github.com/repos/')) return jsonResponse({ tree: [] });
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: '红楼梦',
          language: 'both',
          books: [{ title_zh: '红楼梦', title_en: 'Dream of the Red Chamber', author: '曹雪芹' }],
          search_queries: { openlibrary: '红楼梦', archive: '红楼梦', github: '书籍' },
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [
            {
              id: 'open-library:/works/chinese-red-chamber',
              score: 95,
              reason: 'Original title match',
            },
            {
              id: 'github:0voice/expert_readed_books:书籍/redis设计与实现(第二版).pdf',
              score: 5,
              reason: 'Same language but unrelated title',
            },
          ],
        }),
      });

    const response = await searchAIBooksTier1('红楼梦', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.results.map((result) => result.id)).toEqual([
      'open-library:/works/chinese-red-chamber',
    ]);
  });

  it('orders exact native-title matches before mixed translated titles for Chinese queries', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/mixed-red-chamber',
              title: 'Dream of Red Mansions 红楼梦',
              author_name: ['曹雪芹'],
              language: ['chi'],
              cover_i: 1,
            },
            {
              key: '/works/chinese-red-chamber',
              title: '红楼梦',
              author_name: ['曹雪芹'],
              language: ['chi'],
              cover_i: 2,
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: '红楼梦',
          language: 'both',
          books: [{ title_zh: '红楼梦', title_en: 'Dream of the Red Chamber', author: '曹雪芹' }],
          search_queries: { openlibrary: '红楼梦', archive: '红楼梦', github: '红楼梦' },
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [
            {
              id: 'open-library:/works/mixed-red-chamber',
              score: 99,
              reason: 'Mixed translated title match',
            },
            {
              id: 'open-library:/works/chinese-red-chamber',
              score: 99,
              reason: 'Exact original title match',
            },
          ],
        }),
      });

    const response = await searchAIBooksTier1('红楼梦', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.results.map((result) => result.id)).toEqual([
      'open-library:/works/chinese-red-chamber',
      'open-library:/works/mixed-red-chamber',
    ]);
  });

  it('keeps the original Chinese query language even when AI intent rewrites the query in English', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/english-red-chamber',
              title: 'Dream of the Red Chamber',
              author_name: ["Ts'ao, Hsueh-ch'in"],
              language: ['eng'],
              cover_i: 1,
            },
            {
              key: '/works/chinese-red-chamber',
              title: '红楼梦',
              author_name: ['曹雪芹'],
              language: ['chi'],
              cover_i: 2,
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: 'Dream of the Red Chamber',
          title: 'Dream of the Red Chamber',
          language: 'zh',
          books: [{ title_zh: '红楼梦', title_en: 'Dream of the Red Chamber', author: '曹雪芹' }],
          search_queries: {
            openlibrary: '红楼梦',
            archive: '红楼梦',
            github: '红楼梦',
          },
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [
            {
              id: 'open-library:/works/english-red-chamber',
              score: 95,
              reason: 'AI overvalued the translated title',
            },
            {
              id: 'open-library:/works/chinese-red-chamber',
              score: 5,
              reason: 'AI undervalued the original title',
            },
          ],
        }),
      });

    const response = await searchAIBooksTier1('红楼梦', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.intent.query).toBe('红楼梦');
    expect(response.results.map((result) => result.id)).toEqual([
      'open-library:/works/chinese-red-chamber',
    ]);
    expect(response.results[0]?.aiScore).toBeGreaterThanOrEqual(90);
  });

  it('prefers the original English query language even when AI overvalues the Chinese original title', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/chinese-red-chamber',
              title: '红楼梦',
              author_name: ['曹雪芹'],
              language: ['chi'],
              cover_i: 2,
            },
            {
              key: '/works/english-red-chamber',
              title: 'Dream of the Red Chamber',
              author_name: ["Ts'ao, Hsueh-ch'in"],
              language: ['eng'],
              cover_i: 1,
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: 'Dream of the Red Chamber',
          title: 'Dream of the Red Chamber',
          language: 'both',
          books: [{ title_zh: '红楼梦', title_en: 'Dream of the Red Chamber', author: '曹雪芹' }],
          search_queries: {
            openlibrary: 'Dream of the Red Chamber',
            archive: 'Dream of the Red Chamber',
            github: 'Dream of the Red Chamber',
          },
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [
            {
              id: 'open-library:/works/chinese-red-chamber',
              score: 95,
              reason: 'AI overvalued the Chinese original title',
            },
            {
              id: 'open-library:/works/english-red-chamber',
              score: 5,
              reason: 'AI undervalued the queried English title',
            },
          ],
        }),
      });

    const response = await searchAIBooksTier1('Dream of the Red Chamber', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.results.map((result) => result.id)).toEqual([
      'open-library:/works/english-red-chamber',
    ]);
    expect(response.results[0]?.aiScore).toBeGreaterThanOrEqual(90);
  });

  it('applies AI batch scoring and emits scoring progress', async () => {
    const progressEvents: AIBookSearchProgressEvent[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/right',
              title: 'The Three-Body Problem',
              author_name: ['Cixin Liu'],
              language: ['eng'],
            },
            {
              key: '/works/wrong',
              title: 'Three Body Almanac',
              author_name: ['Reference Author'],
              language: ['eng'],
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: '三体 刘慈欣',
          language: 'zh',
          books: [{ title_zh: '三体', title_en: 'The Three-Body Problem', author: '刘慈欣' }],
          search_queries: {
            openlibrary: 'The Three-Body Problem Cixin Liu',
            archive: '三体 刘慈欣',
            github: '三体 刘慈欣',
          },
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [
            {
              id: 'open-library:/works/right',
              score: 95,
              reason: 'Exact translated title and author match',
            },
            { id: 'open-library:/works/wrong', score: 8, reason: 'Noise' },
          ],
        }),
      });

    const response = await searchAIBooksTier1(
      '三体 刘慈欣',
      {
        ...DEFAULT_AI_SETTINGS,
        enabled: true,
        providerApiKeys: { openrouter: 'test-key' },
      },
      { onProgress: (event) => progressEvents.push(event) },
    );

    expect(response.results.map((result) => result.id)).toEqual(['open-library:/works/right']);
    expect(response.results[0]).toMatchObject({
      aiScore: 95,
      aiReason: 'Exact translated title and author match',
    });
    expect(progressEvents.map((event) => event.step)).toContain('ai-scoring');
  });

  it('passes an abort signal to AI scoring so unavailable providers cannot block source results', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/alice',
              title: 'Alice Adventures in Wonderland',
              author_name: ['Lewis Carroll'],
              language: ['eng'],
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const intent = parseAIBookSearchIntentFallback('alice');
    generateTextMock.mockResolvedValueOnce({
      text: JSON.stringify({
        results: [{ id: 'open-library:/works/alice', score: 93, reason: 'Exact title match' }],
      }),
    });

    const response = await searchAIBooksTier1(
      'alice',
      {
        ...DEFAULT_AI_SETTINGS,
        enabled: true,
        providerApiKeys: { openrouter: 'test-key' },
      },
      { initialIntent: intent },
    );

    expect(response.results[0]).toMatchObject({ id: 'open-library:/works/alice', aiScore: 95 });
    expect(generateTextMock.mock.calls[0]?.[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('parses JSON-array AI scoring responses', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/right',
              title: 'The Three-Body Problem',
              author_name: ['Cixin Liu'],
              language: ['eng'],
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: '三体 刘慈欣',
          language: 'zh',
          books: [{ title_zh: '三体', title_en: 'The Three-Body Problem', author: '刘慈欣' }],
          search_queries: {
            openlibrary: 'The Three-Body Problem Cixin Liu',
            archive: '三体 刘慈欣',
            github: '三体 刘慈欣',
          },
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify([
          { id: 'open-library:/works/right', score: 92, reason: 'Translated title match' },
        ]),
      });

    const response = await searchAIBooksTier1('三体 刘慈欣', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.results[0]).toMatchObject({ aiScore: 92, aiReason: 'Translated title match' });
  });

  it('parses line-delimited AI scoring items', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/right',
              title: 'The Three-Body Problem',
              author_name: ['Cixin Liu'],
              language: ['eng'],
            },
            {
              key: '/works/wrong',
              title: 'Three Body Almanac',
              author_name: ['Reference Author'],
              language: ['eng'],
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: '三体 刘慈欣',
          language: 'zh',
          books: [{ title_zh: '三体', title_en: 'The Three-Body Problem', author: '刘慈欣' }],
          search_queries: {
            openlibrary: 'The Three-Body Problem Cixin Liu',
            archive: '三体 刘慈欣',
            github: '三体 刘慈欣',
          },
        }),
      })
      .mockResolvedValueOnce({
        text: [
          JSON.stringify({
            id: 'open-library:/works/right',
            score: 94,
            reason: 'Line parsed match',
          }),
          JSON.stringify({
            id: 'open-library:/works/wrong',
            score: 9,
            reason: 'Line parsed noise',
          }),
        ].join('\n'),
      });

    const response = await searchAIBooksTier1('三体 刘慈欣', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.results[0]).toMatchObject({ aiScore: 94, aiReason: 'Line parsed match' });
  });

  it('retries AI scoring once after malformed scoring output', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/right',
              title: 'The Three-Body Problem',
              author_name: ['Cixin Liu'],
              language: ['eng'],
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: '三体 刘慈欣',
          language: 'zh',
          books: [{ title_zh: '三体', title_en: 'The Three-Body Problem', author: '刘慈欣' }],
          search_queries: {
            openlibrary: 'The Three-Body Problem Cixin Liu',
            archive: '三体 刘慈欣',
            github: '三体 刘慈欣',
          },
        }),
      })
      .mockResolvedValueOnce({ text: 'not json' })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          results: [
            { id: 'open-library:/works/right', score: 91, reason: 'Recovered after retry' },
          ],
        }),
      });

    const response = await searchAIBooksTier1('三体 刘慈欣', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(response.results[0]).toMatchObject({ aiScore: 91, aiReason: 'Recovered after retry' });
  });

  it('limits each AI scoring request to 20 candidates', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: Array.from({ length: 25 }, (_, index) => ({
            key: `/works/book-${index}`,
            title: `Book ${index}`,
            author_name: ['Library Author'],
            language: ['eng'],
          })),
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: 'book',
          language: 'en',
          books: [{ title_en: 'Book', author: 'Library Author' }],
          search_queries: { openlibrary: 'book', archive: 'book', github: 'book' },
        }),
      })
      .mockResolvedValue({ text: JSON.stringify({ results: [] }) });

    await searchAIBooksTier1('book', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    const scoringPrompt = generateTextMock.mock.calls[1]?.[0]?.prompt;
    expect(scoringPrompt).toContain('Book 19');
    expect(scoringPrompt).not.toContain('Book 20');
  });

  it('falls back to deterministic scoring when AI scoring fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/three-body',
              title: 'The Three-Body Problem',
              author_name: ['Cixin Liu'],
              language: ['eng'],
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    generateTextMock
      .mockResolvedValueOnce({
        text: JSON.stringify({
          query: '三体 刘慈欣',
          language: 'zh',
          books: [{ title_zh: '三体', title_en: 'The Three-Body Problem', author: '刘慈欣' }],
          search_queries: {
            openlibrary: 'The Three-Body Problem Cixin Liu',
            archive: '三体 刘慈欣',
            github: '三体 刘慈欣',
          },
        }),
      })
      .mockRejectedValueOnce(new Error('scoring unavailable'));

    const response = await searchAIBooksTier1('三体 刘慈欣', {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'test-key' },
    });

    expect(response.results[0]).toMatchObject({
      id: 'open-library:/works/three-body',
      aiScore: response.results[0]?.score,
    });
  });

  it('improves deterministic quality with language affinity, cross-language dedupe, and noise penalties', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return jsonResponse({
          docs: [
            {
              key: '/works/en',
              title: 'The Three-Body Problem',
              author_name: ['Cixin Liu'],
              language: ['eng'],
            },
            { key: '/works/zh', title: '三体', author_name: ['刘慈欣'], language: ['chi'] },
            {
              key: '/works/noise',
              title: 'Three Body Problem Study Guide',
              author_name: ['Notes Author'],
              language: ['eng'],
            },
          ],
        });
      }
      return jsonResponse({ results: [], tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('三体 刘慈欣');
    intent.books = [{ titleZh: '三体', titleEn: 'The Three-Body Problem', author: '刘慈欣' }];
    intent.searchQueries.openLibrary = 'The Three-Body Problem Cixin Liu';
    const response = await searchAIBooksTier1(intent.query, DEFAULT_AI_SETTINGS, {
      initialIntent: intent,
    });

    expect(response.results.map((result) => result.id)).toEqual(['open-library:/works/zh']);
  });

  it('searches approved GitHub repositories and exposes query-matching book files as source links', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/repos/justjavac/free-programming-books-zh_CN/git/trees/')) {
        return jsonResponse({
          tree: [
            {
              path: 'programming/javascript-books.md',
              type: 'blob',
              url: 'https://api.github.com/repos/justjavac/free-programming-books-zh_CN/git/blobs/1',
            },
            {
              path: 'README.md',
              type: 'blob',
              url: 'https://api.github.com/repos/justjavac/free-programming-books-zh_CN/git/blobs/2',
            },
          ],
        });
      }
      return jsonResponse({ tree: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('JavaScript');
    const results = await searchGitHubBooks(intent);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        '/repos/justjavac/free-programming-books-zh_CN/git/trees/HEAD?recursive=1',
      ),
    );
    expect(results[0]).toMatchObject({
      id: 'github:justjavac/free-programming-books-zh_CN:programming/javascript-books.md',
      title: 'javascript-books.md',
      source: 'github',
      risk: 'external-warning',
      availability: 'external-search',
      sourceLinks: [
        {
          source: 'github',
          url: 'https://github.com/justjavac/free-programming-books-zh_CN/blob/HEAD/programming/javascript-books.md',
          label: 'GitHub',
          risk: 'external-warning',
        },
      ],
    });
  });

  it('uses user-facing title variants when matching GitHub book files', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/repos/0voice/expert_readed_books/git/trees/')) {
        return jsonResponse({
          tree: [
            { path: '小说类/三体全集 - 刘慈欣.epub', type: 'blob' },
            { path: '小说类/球状闪电 - 刘慈欣.epub', type: 'blob' },
          ],
        });
      }
      return jsonResponse({ tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('The Three-Body Problem Cixin Liu');
    intent.books = [{ titleZh: '三体', titleEn: 'The Three-Body Problem', author: '刘慈欣' }];
    intent.searchQueries.github = 'The Three-Body Problem Cixin Liu';

    const results = await searchGitHubBooks(intent);

    expect(results.map((result) => result.title)).toContain('三体全集 - 刘慈欣.epub');
  });

  it('emits a visible GitHub rate-limit progress event instead of silently returning zero results', async () => {
    const progressEvents: AIBookSearchProgressEvent[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('api.github.com')) {
        return statusJsonResponse(
          403,
          { message: 'API rate limit exceeded for this IP.' },
          {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1779115862',
          },
        );
      }
      if (url.includes('gutendex.com')) return jsonResponse({ results: [] });
      return jsonResponse({ docs: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchAIBooksTier1('三体', DEFAULT_AI_SETTINGS, {
      onProgress: (event) => progressEvents.push(event),
    });

    expect(
      progressEvents.some((event) => event.source === 'github' && event.message.includes('GitHub')),
    ).toBe(true);
    expect(
      progressEvents.some((event) => event.source === 'github' && event.message.includes('限流')),
    ).toBe(true);
  });

  it('surfaces GitHub tree rate limits after repository discovery succeeds', async () => {
    const progressEvents: AIBookSearchProgressEvent[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/search/repositories')) return jsonResponse({ items: [] });
      if (url.includes('api.github.com')) {
        return statusJsonResponse(
          403,
          { message: 'API rate limit exceeded for this IP.' },
          {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1779115862',
          },
        );
      }
      if (url.includes('gutendex.com')) return jsonResponse({ results: [] });
      return jsonResponse({ docs: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await searchAIBooksTier1('三体', DEFAULT_AI_SETTINGS, {
      onProgress: (event) => progressEvents.push(event),
    });

    expect(
      progressEvents.some((event) => event.source === 'github' && event.message.includes('限流')),
    ).toBe(true);
  });

  it('skips noisy GitHub short queries before fetching', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ tree: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('三');
    const results = await searchGitHubBooks(intent);

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('filters weak GitHub book-file matches that do not contain query tokens', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/repos/EbookFoundation/free-programming-books/git/trees/')) {
        return jsonResponse({
          tree: [
            { path: 'books/free-programming-books.md', type: 'blob' },
            { path: 'books/javascript-books.md', type: 'blob' },
          ],
        });
      }
      return jsonResponse({ tree: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('javascript');
    const results = await searchGitHubBooks(intent);

    expect(results.map((result) => result.title)).toEqual(['javascript-books.md']);
  });

  it('discovers GitHub repositories and searches their trees', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('/search/repositories')) {
        return jsonResponse({
          items: [
            {
              full_name: 'example/public-domain-books',
              html_url: 'https://github.com/example/public-domain-books',
              description: 'Public domain JavaScript books',
            },
          ],
        });
      }
      if (url.includes('/repos/example/public-domain-books/git/trees/')) {
        return jsonResponse({ tree: [{ path: 'javascript-guide.md', type: 'blob' }] });
      }
      return jsonResponse({ tree: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const intent = parseAIBookSearchIntentFallback('javascript');
    const results = await searchGitHubBooks(intent);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/search/repositories'));
    expect(results.map((result) => result.id)).toContain(
      'github:example/public-domain-books:javascript-guide.md',
    );
  });

  it('keeps tier 1 results when one source times out', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('openlibrary.org')) {
        return new Promise<Response>(() => undefined);
      }
      if (url.includes('gutendex.com')) {
        return jsonResponse({
          results: [
            {
              id: 84,
              title: 'Frankenstein; Or, The Modern Prometheus',
              authors: [{ name: 'Mary Wollstonecraft Shelley' }],
              languages: ['en'],
              copyright: false,
              formats: {
                'application/epub+zip': 'https://www.gutenberg.org/ebooks/84.epub3.images',
              },
            },
          ],
        });
      }
      return jsonResponse({ tree: [], items: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const responsePromise = searchAIBooksTier1('frankenstein', DEFAULT_AI_SETTINGS);
    await vi.advanceTimersByTimeAsync(8000);
    const response = await responsePromise;
    vi.useRealTimers();

    expect(response.results.map((result) => result.id)).toContain('gutendex:84');
  });

  it('keeps tier 1 results when one source fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('gutendex.com')) throw new Error('source unavailable');
      if (url.includes('api.github.com')) return jsonResponse({ tree: [], items: [] });
      return jsonResponse({
        docs: [
          {
            key: '/works/OL45883W',
            title: 'The Left Hand of Darkness',
            author_name: ['Ursula K. Le Guin'],
          },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await searchAIBooksTier1('left hand of darkness', DEFAULT_AI_SETTINGS);

    expect(response.results[0]).toMatchObject({
      source: 'open-library',
      title: 'The Left Hand of Darkness',
    });
  });

  it('merges download links while deduplicating duplicate book results', () => {
    const direct: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      score: 40,
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [
        {
          source: 'gutendex',
          url: 'https://www.gutenberg.org/ebooks/84',
          risk: 'external-warning',
        },
      ],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };
    const external: AIBookSearchResult = {
      ...direct,
      id: 'open-library:/works/frankenstein',
      source: 'open-library',
      risk: 'external-warning',
      score: 100,
      downloadLinks: [],
      sourceLinks: [
        {
          source: 'open-library',
          url: 'https://openlibrary.org/works/frankenstein',
          risk: 'external-warning',
        },
      ],
      externalUrl: 'https://openlibrary.org/works/frankenstein',
    };

    const results = dedupeAIBookResults([external, direct]);

    expect(results).toHaveLength(1);
    expect(results[0]?.downloadLinks).toEqual(direct.downloadLinks);
    expect(results[0]?.sourceLinks.map((link) => link.source)).toEqual([
      'open-library',
      'gutendex',
    ]);
  });

  it('collapses repeated same-source rows and same-format downloads for duplicate Gutenberg editions', () => {
    const primaryEdition: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein; Or, The Modern Prometheus',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      score: 80,
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [
        {
          source: 'gutendex',
          url: 'https://www.gutenberg.org/ebooks/84',
          label: 'Project Gutenberg',
          risk: 'external-warning',
        },
      ],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };
    const alternateEdition: AIBookSearchResult = {
      ...primaryEdition,
      id: 'gutendex:42324',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/42324.epub3.images',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [
        {
          source: 'gutendex',
          url: 'https://www.gutenberg.org/ebooks/42324',
          label: 'Project Gutenberg',
          risk: 'external-warning',
        },
      ],
      externalUrl: 'https://www.gutenberg.org/ebooks/42324',
    };

    const results = dedupeAIBookResults([primaryEdition, alternateEdition]);

    expect(results).toHaveLength(1);
    expect(results[0]?.sourceLinks).toEqual([
      expect.objectContaining({
        source: 'gutendex',
        label: 'Project Gutenberg',
        url: 'https://www.gutenberg.org/ebooks/84',
      }),
    ]);
    expect(results[0]?.downloadLinks).toEqual([
      expect.objectContaining({
        format: 'epub',
        source: 'gutendex',
        url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
      }),
    ]);
  });

  it('does not treat Project Gutenberg landing pages as direct downloads', () => {
    const result: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/84',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };

    expect(canDirectDownloadAIBookFile(result, result.downloadLinks[0]!)).toBe(false);
  });

  it('blocks non-HTTPS direct downloads from allowed hosts', () => {
    const result: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      downloadLinks: [
        {
          format: 'epub',
          url: 'http://www.gutenberg.org/ebooks/84.epub3.images',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };

    expect(canDirectDownloadAIBookFile(result, result.downloadLinks[0]!)).toBe(false);
  });

  it('removes existing cross-language tier 2 duplicates using the search intent', () => {
    const existing: AIBookSearchResult = {
      id: 'github:three-body-problem',
      title: 'The Three-Body Problem',
      authors: ['Cixin Liu'],
      source: 'github',
      risk: 'external-warning',
      downloadLinks: [],
      sourceLinks: [],
      externalUrl: 'https://github.com/example/three-body-problem',
    };
    const tier2Duplicate: AIBookSearchResult = {
      id: 'internet-archive:santi',
      title: '三体',
      authors: ['刘慈欣'],
      source: 'internet-archive',
      risk: 'external-warning',
      downloadLinks: [],
      sourceLinks: [],
      externalUrl: 'https://archive.org/details/santi',
    };
    const intent = {
      ...parseAIBookSearchIntentFallback('三体 刘慈欣'),
      books: [{ titleZh: '三体', titleEn: 'The Three-Body Problem', author: '刘慈欣' }],
    };

    expect(removeExistingAIBookResults([tier2Duplicate], [existing], intent)).toEqual([]);
  });

  it('rejects HTML responses for allowed direct-download hosts', async () => {
    const result: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
          risk: 'direct-open',
          source: 'gutendex',
        },
      ],
      sourceLinks: [],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html></html>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }),
      ),
    );

    await expect(downloadAIBookFile(result, result.downloadLinks[0]!)).rejects.toThrow(
      'Downloaded response is not a book file',
    );
  });

  it('blocks direct download when link-level risk is not direct-open', async () => {
    const result: AIBookSearchResult = {
      id: 'gutendex:84',
      title: 'Frankenstein',
      authors: ['Mary Shelley'],
      source: 'gutendex',
      risk: 'direct-open',
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
          risk: 'blocked',
          source: 'gutendex',
        },
      ],
      sourceLinks: [],
      externalUrl: 'https://www.gutenberg.org/ebooks/84',
    };
    const link = result.downloadLinks[0];
    if (!link) throw new Error('Expected download link');

    await expect(downloadAIBookFile(result, link)).rejects.toThrow(
      'Direct download is not allowed for this source',
    );
  });
});
