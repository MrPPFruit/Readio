import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AIBookSearchDialog, {
  AI_BOOK_SEARCH_LITERARY_QUOTES,
} from '@/app/library/components/AIBookSearchDialog';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { buildAggregationSearchUrl } from '@/services/aiBookSearch/domainRegistry';
import type {
  AIBookSearchOptions,
  AIBookSearchProgressEvent,
  AIBookSearchResult,
  AIBookSearchResponse,
} from '@/services/aiBookSearch/types';
import { eventDispatcher } from '@/utils/event';

const directResult: AIBookSearchResult = {
  id: 'gutendex:84',
  title: 'Frankenstein; Or, The Modern Prometheus',
  authors: ['Mary Wollstonecraft Shelley'],
  source: 'gutendex',
  language: 'en',
  year: 1818,
  licenseLabel: 'Public domain',
  description: 'A public-domain gothic novel.',
  coverUrl: 'https://www.gutenberg.org/cache/epub/84/pg84.cover.medium.jpg',
  formats: ['epub'],
  aiScore: 94,
  aiReason: 'Exact title and public-domain match',
  risk: 'direct-open',
  downloadLinks: [
    {
      format: 'epub',
      url: 'https://www.gutenberg.org/ebooks/84.epub3.images',
      filename: 'frankenstein.epub',
      source: 'gutendex',
      risk: 'direct-open',
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

const externalResult: AIBookSearchResult = {
  id: 'open-library:/works/OL45883W',
  title: 'The Left Hand of Darkness',
  authors: ['Ursula K. Le Guin'],
  source: 'open-library',
  year: 1969,
  language: 'en',
  description: 'A classic science fiction novel.',
  formats: ['html'],
  aiScore: 88,
  aiReason: 'Strong title match from Open Library',
  risk: 'external-warning',
  downloadLinks: [],
  sourceLinks: [
    {
      source: 'open-library',
      url: 'https://openlibrary.org/works/OL45883W',
      label: 'Open Library',
      risk: 'external-warning',
    },
  ],
  externalUrl: 'https://openlibrary.org/works/OL45883W',
};

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, values?: Record<string, string | number>) =>
    text.replace(/{{(\w+)}}/g, (_, key) => `${values?.[key] ?? ''}`),
}));

const CONFIGURED_AI_SETTINGS = {
  ...DEFAULT_AI_SETTINGS,
  enabled: true,
  providerApiKeys: { openrouter: 'healthy-openrouter-key' },
};

const tier1Response: AIBookSearchResponse = {
  intent: {
    query: 'frankenstein epub',
    title: 'frankenstein epub',
    language: 'en',
    books: [{ titleEn: 'Frankenstein' }],
    searchQueries: {
      openLibrary: 'frankenstein epub',
      archive: 'frankenstein epub',
      github: 'frankenstein epub',
    },
  },
  results: [directResult, externalResult],
};

const archiveResult: AIBookSearchResult = {
  id: 'internet-archive:left_hand_archive',
  title: 'The Left Hand of Darkness Archive Edition',
  authors: ['Ursula K. Le Guin'],
  source: 'internet-archive',
  tier: 2,
  language: 'en',
  year: 1976,
  risk: 'external-warning',
  formats: ['pdf'],
  downloadLinks: [],
  sourceLinks: [
    {
      source: 'internet-archive',
      url: 'https://archive.org/details/left_hand_archive',
      label: 'Internet Archive',
      risk: 'external-warning',
    },
  ],
  externalUrl: 'https://archive.org/details/left_hand_archive',
};

const searchAIBooksTier1Mock = vi.hoisted(() => vi.fn());
const searchAIBooksTier2Mock = vi.hoisted(() => vi.fn());
const downloadAIBookFileMock = vi.hoisted(() => vi.fn());
const openExternalUrlMock = vi.hoisted(() => vi.fn());
const healthCheckMock = vi.hoisted(() => vi.fn());
const logDiagnosticErrorMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const logDiagnosticEventMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const setActiveSettingsItemIdMock = vi.hoisted(() => vi.fn());
const setSettingsDialogOpenMock = vi.hoisted(() => vi.fn());
const libraryMocks = vi.hoisted(() => ({
  visibleLibrary: [] as import('@/types/book').Book[],
}));
const historyMocks = vi.hoisted(() => ({
  records: [] as import('@/services/aiBookSearch/history').AIBookSearchHistoryRecord[],
  list: vi.fn(),
  save: vi.fn(),
  deleteOne: vi.fn(),
  deleteMany: vi.fn(),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

vi.mock('@/services/aiBookSearch/searchService', () => ({
  searchAIBooksTier1: searchAIBooksTier1Mock,
  searchAIBooksTier2: searchAIBooksTier2Mock,
}));

vi.mock('@/services/aiBookSearch/history', () => ({
  listAIBookSearchHistory: historyMocks.list,
  saveAIBookSearchHistorySnapshot: historyMocks.save,
  deleteAIBookSearchHistoryRecord: historyMocks.deleteOne,
  deleteAIBookSearchHistoryRecords: historyMocks.deleteMany,
}));

vi.mock('@/services/ai/providers', () => ({
  getAIProvider: vi.fn(() => ({
    healthCheck: healthCheckMock,
  })),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      setActiveSettingsItemId: setActiveSettingsItemIdMock,
      setSettingsDialogOpen: setSettingsDialogOpenMock,
    }),
  },
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({
    visibleLibrary: libraryMocks.visibleLibrary,
  }),
}));

vi.mock('@/services/aiBookSearch/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/aiBookSearch/download')>();
  return {
    ...actual,
    downloadAIBookFile: downloadAIBookFileMock,
  };
});

vi.mock('@/utils/open', () => ({
  openExternalUrl: openExternalUrlMock,
}));

vi.mock('@/services/diagnostics/logger', () => ({
  logDiagnosticError: logDiagnosticErrorMock,
  logDiagnosticEvent: logDiagnosticEventMock,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: { isAndroidApp: true },
  }),
}));

vi.mock('@/utils/bridge', () => ({
  interceptKeys: vi.fn(),
}));

beforeEach(() => {
  libraryMocks.visibleLibrary = [];
  historyMocks.records = [];
  historyMocks.list.mockImplementation(async () => historyMocks.records);
  historyMocks.save.mockResolvedValue(undefined);
  historyMocks.deleteOne.mockImplementation(async (id: string) => {
    historyMocks.records = historyMocks.records.filter((record) => record.id !== id);
  });
  historyMocks.deleteMany.mockImplementation(async (ids: string[]) => {
    const idSet = new Set(ids);
    historyMocks.records = historyMocks.records.filter((record) => !idSet.has(record.id));
  });
  healthCheckMock.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('AIBookSearchDialog', () => {
  it('keeps a mostly foreign classic-book quote pool with reduced domestic poetry', () => {
    const worldQuotes = AI_BOOK_SEARCH_LITERARY_QUOTES.filter((quote) => quote.region === 'world');
    const chinaQuotes = AI_BOOK_SEARCH_LITERARY_QUOTES.filter((quote) => quote.region === 'china');

    expect(AI_BOOK_SEARCH_LITERARY_QUOTES.length).toBeGreaterThanOrEqual(90);
    expect(new Set(AI_BOOK_SEARCH_LITERARY_QUOTES.map((quote) => quote.text)).size).toBe(
      AI_BOOK_SEARCH_LITERARY_QUOTES.length,
    );
    expect(
      AI_BOOK_SEARCH_LITERARY_QUOTES.every(
        (quote) =>
          quote.text.length <= 72 &&
          quote.source.length <= 36 &&
          quote.text.startsWith('“') &&
          quote.text.endsWith('”'),
      ),
    ).toBe(true);
    expect(worldQuotes.length).toBeGreaterThanOrEqual(75);
    expect(chinaQuotes.length).toBeLessThanOrEqual(18);
    expect(worldQuotes.length).toBeGreaterThan(chinaQuotes.length * 4);
    expect(
      AI_BOOK_SEARCH_LITERARY_QUOTES.some(
        (quote) => quote.period === 'modern' && quote.region === 'world',
      ),
    ).toBe(true);
    expect(
      AI_BOOK_SEARCH_LITERARY_QUOTES.some(
        (quote) => quote.period === 'modern' && quote.region === 'china',
      ),
    ).toBe(true);
    expect(AI_BOOK_SEARCH_LITERARY_QUOTES.map((quote) => quote.source)).toEqual(
      expect.arrayContaining([
        '《弗兰肯斯坦》 · 玛丽·雪莱',
        '《白鲸》 · 赫尔曼·梅尔维尔',
        '《包法利夫人》 · 福楼拜',
        '《罪与罚》 · 陀思妥耶夫斯基',
        '《变形记》 · 弗兰茨·卡夫卡',
        '《红字》 · 纳撒尼尔·霍桑',
        '《柳林风声》 · 肯尼思·格雷厄姆',
        '《绿山墙的安妮》 · 露西·蒙哥马利',
        '《我是猫》 · 夏目漱石',
        '《吉尔伽美什史诗》',
      ]),
    );
    expect(AI_BOOK_SEARCH_LITERARY_QUOTES.map((quote) => quote.text)).not.toEqual(
      expect.arrayContaining([
        '“海上没有路，路在每一次出航里。”',
        '“最黑暗的地方，也会有灵魂在发问。”',
        '“想象力让普通日子也有光。”',
        '“月亮不属于任何人，却照见每个人。”',
        '“生命如芦苇短暂，名字如泥土长存。”',
      ]),
    );
  });

  it('starts with a random literary quote and crossfades every 30 seconds without moving focus', () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.25);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('搜索书籍');
    expect(document.activeElement).toBe(input);
    const initialQuote =
      AI_BOOK_SEARCH_LITERARY_QUOTES[Math.floor(0.5 * AI_BOOK_SEARCH_LITERARY_QUOTES.length)];
    const rotatedQuote =
      AI_BOOK_SEARCH_LITERARY_QUOTES[Math.floor(0.25 * AI_BOOK_SEARCH_LITERARY_QUOTES.length)];
    expect(initialQuote).toBeDefined();
    expect(rotatedQuote).toBeDefined();
    expect(screen.getByText(initialQuote?.text ?? '')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(screen.getByText(initialQuote?.text ?? '')).toBeTruthy();

    const quoteBlock = screen.getByTestId('ai-book-search-literary-quote');
    expect(quoteBlock.className).toContain('opacity-100');
    expect(quoteBlock.getAttribute('aria-hidden')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText(initialQuote?.text ?? '')).toBeTruthy();
    expect(quoteBlock.className).toContain('opacity-0');

    act(() => {
      vi.advanceTimersByTime(199);
    });

    expect(screen.getByText(initialQuote?.text ?? '')).toBeTruthy();
    expect(quoteBlock.className).toContain('opacity-0');

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByText(initialQuote?.text ?? '')).toBeNull();
    expect(screen.getByText(rotatedQuote?.text ?? '')).toBeTruthy();
    expect(quoteBlock.className).toContain('opacity-100');
    expect(document.activeElement).toBe(input);
    expect(quoteBlock.getAttribute('aria-live')).toBeNull();
    expect(quoteBlock.getAttribute('role')).toBeNull();

    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it('shows a non-blocking AI setup notice when AI is not configured and opens AI settings', () => {
    vi.useFakeTimers();

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('搜索书籍');
    expect(document.activeElement).toBe(input);
    expect(screen.getByText('开启 AI，找书会更准')).toBeTruthy();
    expect(
      screen.getByText(
        '当前会使用基础搜索。配置 AI 后，Readio 可以更好理解书名、作者、语言和格式偏好，并帮你整理更相关的结果。',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '去设置 AI' }));

    expect(setActiveSettingsItemIdMock).toHaveBeenCalledWith('settings.ai.enableAssistant');
    expect(setSettingsDialogOpenMock).toHaveBeenCalledWith(true);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByText('开启 AI，找书会更准')).toBeNull();
  });

  it('logs search failures without leaking the raw query', async () => {
    const rawQuery = 'frankenstein private query should not leak';
    searchAIBooksTier1Mock.mockRejectedValueOnce(new Error('search provider failed'));

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: rawQuery } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() =>
      expect(logDiagnosticErrorMock).toHaveBeenCalledWith(
        'ai_book_search.search_failed',
        expect.any(Error),
        expect.objectContaining({
          provider: 'openrouter',
          model: 'google/gemini-2.5-flash-lite',
          queryLength: rawQuery.length,
          aiEnabled: false,
        }),
      ),
    );
    const calls = JSON.stringify([
      logDiagnosticErrorMock.mock.calls,
      logDiagnosticEventMock.mock.calls,
    ]);
    expect(calls).not.toContain(rawQuery);
    expect(calls).not.toContain('query should not leak');
  });

  it('logs search lifecycle counts without leaking the raw query', async () => {
    const rawQuery = 'frankenstein lifecycle private query';
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: rawQuery } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() =>
      expect(logDiagnosticEventMock).toHaveBeenCalledWith(
        'ai_book_search.search_completed',
        'info',
        expect.objectContaining({
          provider: 'openrouter',
          model: 'google/gemini-2.5-flash-lite',
          queryLength: rawQuery.length,
          resultCount: 2,
          importableCount: 1,
          aiEnabled: false,
        }),
      ),
    );
    expect(logDiagnosticEventMock).toHaveBeenCalledWith(
      'ai_book_search.search_started',
      'info',
      expect.objectContaining({
        provider: 'openrouter',
        model: 'google/gemini-2.5-flash-lite',
        queryLength: rawQuery.length,
        aiEnabled: false,
      }),
    );
    const calls = JSON.stringify(logDiagnosticEventMock.mock.calls);
    expect(calls).not.toContain(rawQuery);
    expect(calls).not.toContain('lifecycle private query');
  });

  it('hides the AI setup notice when basic search starts and shows only real non-AI progress', async () => {
    const searchProgress = deferred<AIBookSearchResponse>();
    searchAIBooksTier1Mock.mockImplementation(async () => searchProgress.promise);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    expect(screen.getByText('开启 AI，找书会更准')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(screen.queryByText('开启 AI，找书会更准')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: '正在搜索开放图书来源' })).toBeTruthy();
    expect(screen.queryByText('正在理解你的想法...')).toBeNull();
    expect(screen.queryByText(/AI 正在/)).toBeNull();

    await act(async () => {
      searchProgress.resolve(tier1Response);
      await searchProgress.promise;
    });
  });

  it('warns when configured AI model is currently unavailable without blocking search', async () => {
    healthCheckMock.mockResolvedValue(false);
    const configuredSettings = {
      ...DEFAULT_AI_SETTINGS,
      enabled: true,
      providerApiKeys: { openrouter: 'openrouter-key' },
    };

    render(
      <AIBookSearchDialog
        settings={configuredSettings}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    expect(screen.queryByText('开启 AI，找书会更准')).toBeNull();
    expect(await screen.findByText('当前 AI 模型暂时不可用')).toBeTruthy();
    expect(
      screen.getByText('Readio 会先使用基础搜索。你可以检查 API Key、模型名称或服务连接后再试。'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '检查 AI 设置' }));

    expect(setActiveSettingsItemIdMock).toHaveBeenCalledWith('settings.ai.apiKey');
    expect(setSettingsDialogOpenMock).toHaveBeenCalledWith(true);
  });

  it('uses basic search while configured AI health check is still pending', async () => {
    const healthCheck = deferred<boolean>();
    healthCheckMock.mockImplementation(async () => healthCheck.promise);
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);

    render(
      <AIBookSearchDialog
        settings={CONFIGURED_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(screen.getByRole('heading', { level: 2, name: '正在搜索开放图书来源' })).toBeTruthy();
    await waitFor(() =>
      expect(searchAIBooksTier1Mock).toHaveBeenCalledWith(
        'frankenstein epub',
        expect.objectContaining({ enabled: false }),
        expect.any(Object),
      ),
    );

    await act(async () => {
      healthCheck.resolve(true);
      await healthCheck.promise;
    });
  });

  it('renders full-screen global book search with no example prompts', () => {
    const onClose = vi.fn();

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    const surface = screen.getByRole('region', { name: '全网搜书' });
    const main = surface.querySelector('main');
    expect(surface.className).toContain('h-[100dvh]');
    expect(surface.className).toContain('w-screen');
    expect(surface.className).not.toContain('modal-box');
    expect(main?.className).toContain('pt-[max(env(safe-area-inset-top),2rem)]');
    expect(main?.className).toContain('safe-area-inset-bottom');
    expect(screen.queryByRole('heading', { name: '全网搜书' })).toBeNull();
    expect(screen.queryByRole('button', { name: '关闭 全网搜书' })).toBeNull();
    expect(screen.queryByText('想看什么书？')).toBeNull();
    expect(screen.queryByText(/刘慈欣的科幻小说/)).toBeNull();
    expect(screen.queryByText('三体 刘慈欣')).toBeNull();

    const input = screen.getByLabelText('搜索书籍');
    expect(document.activeElement).toBe(input);
    expect(input).toBe(screen.getByPlaceholderText('想读什么？书名、作者，或一个念头。'));

    const quoteBlock = screen.getByTestId('ai-book-search-literary-quote');
    expect(
      within(quoteBlock).getByTestId('ai-book-search-literary-quote-text').textContent,
    ).toMatch(/^“.+”$/);
    expect(quoteBlock.className).toContain('min-h-64');
    expect(quoteBlock.className).toContain('transition-opacity');
    expect(quoteBlock.className).toContain('motion-reduce:transition-none');
    expect(quoteBlock.getAttribute('aria-hidden')).toBe('true');
    expect(
      within(quoteBlock).getByTestId('ai-book-search-literary-quote-text').className,
    ).toContain('line-clamp-4');
    expect(quoteBlock.className).not.toContain('border');
    expect(quoteBlock.className).not.toContain('bg-base-200');

    fireEvent.keyDown(surface, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from Android browser back instead of exiting the app', () => {
    const onClose = vi.fn();
    const initialHistoryLength = window.history.length;

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    expect(window.history.length).toBe(initialHistoryLength + 1);

    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('consumes native Android Back and closes the search surface', () => {
    const onClose = vi.fn();

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    expect(eventDispatcher.dispatchSync('native-key-down', { keyName: 'Back' })).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('removes the pushed browser history entry when closing from Escape', () => {
    const onClose = vi.fn();
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole('region', { name: '全网搜书' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(historyBackSpy).toHaveBeenCalledTimes(1);

    historyBackSpy.mockRestore();
  });

  it('opens recent search history, restores cached results, and does not rerun search', async () => {
    historyMocks.records = [
      {
        id: '三体',
        query: '三体',
        normalizedQuery: '三体',
        createdAt: 100,
        updatedAt: 200,
        resultCount: 2,
        results: [directResult, externalResult],
        intent: tier1Response.intent,
        selectedSource: 'all',
        deepSearchStatus: 'idle',
        progressSummary: [{ step: 'done', message: '已从最近寻书恢复 2 条线索', timestamp: 200 }],
        schemaVersion: 1,
      },
    ];
    const historyLoad = deferred<typeof historyMocks.records>();
    historyMocks.list.mockReturnValueOnce(historyLoad.promise);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    const recentButton = screen.getByRole('button', { name: '最近寻书' });
    expect(
      recentButton.compareDocumentPosition(screen.getByLabelText('搜索书籍')) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    fireEvent.click(recentButton);

    const historySheet = await screen.findByRole('dialog', { name: '最近寻书' });
    expect(historySheet.className).toContain('modal');
    expect(historySheet.querySelector('.dialog-overlay')).toBeTruthy();
    expect(historySheet.querySelector('.modal-box')).toBeTruthy();
    expect(historySheet.querySelector('.drag-handle')).toBeTruthy();
    expect(within(historySheet).queryByRole('button', { name: 'Close' })).toBeNull();
    expect(within(historySheet).getByRole('button', { name: '下拉关闭最近寻书' })).toBeTruthy();

    await act(async () => {
      historyLoad.resolve(historyMocks.records);
      await historyLoad.promise;
    });

    expect(await within(historySheet).findByText('三体')).toBeTruthy();
    expect(within(historySheet).getByText('找到 2 本线索')).toBeTruthy();
    expect(within(historySheet).queryByText(/已上架/)).toBeNull();
    expect(within(historySheet).queryByText(/200/)).toBeNull();

    fireEvent.click(
      within(historySheet).getByRole('button', { name: '恢复寻书结果：三体，找到 2 本线索' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '最近寻书' })).toBeNull());
    expect((screen.getByLabelText('搜索书籍') as HTMLInputElement).value).toBe('三体');
    expect(screen.getByText('Frankenstein; Or, The Modern Prometheus')).toBeTruthy();
    expect(screen.getByText('The Left Hand of Darkness')).toBeTruthy();
    expect(screen.getByText('已从最近寻书恢复 2 条线索')).toBeTruthy();
    expect(searchAIBooksTier1Mock).not.toHaveBeenCalled();
    expect(searchAIBooksTier2Mock).not.toHaveBeenCalled();
  });

  it('deletes recent searches one by one and by long-press multi-select', async () => {
    historyMocks.records = [
      {
        id: '三体',
        query: '三体',
        normalizedQuery: '三体',
        createdAt: 100,
        updatedAt: 300,
        resultCount: 2,
        results: [directResult, externalResult],
        intent: tier1Response.intent,
        selectedSource: 'all',
        deepSearchStatus: 'idle',
        progressSummary: [],
        schemaVersion: 1,
      },
      {
        id: '红楼梦',
        query: '红楼梦',
        normalizedQuery: '红楼梦',
        createdAt: 90,
        updatedAt: 200,
        resultCount: 1,
        results: [externalResult],
        intent: null,
        selectedSource: 'all',
        deepSearchStatus: 'done',
        progressSummary: [],
        schemaVersion: 1,
      },
      {
        id: '小王子',
        query: '小王子',
        normalizedQuery: '小王子',
        createdAt: 80,
        updatedAt: 100,
        resultCount: 1,
        results: [directResult],
        intent: null,
        selectedSource: 'all',
        deepSearchStatus: 'idle',
        progressSummary: [],
        schemaVersion: 1,
      },
    ];

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '最近寻书' }));
    const historySheet = await screen.findByRole('dialog', { name: '最近寻书' });

    fireEvent.click(within(historySheet).getByRole('button', { name: '删除寻书记录：红楼梦' }));
    await waitFor(() => expect(historyMocks.deleteOne).toHaveBeenCalledWith('红楼梦'));
    expect(screen.getByRole('dialog', { name: '最近寻书' })).toBeTruthy();
    expect(screen.queryByText('红楼梦')).toBeNull();

    const firstRow = screen.getByTestId('ai-book-search-history-row-三体');
    fireEvent.contextMenu(firstRow);

    expect(screen.getByText('已选择 1 项')).toBeTruthy();
    expect(
      (
        screen.getByRole('checkbox', {
          name: '选择寻书记录：三体，找到 2 本线索',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择寻书记录：小王子，找到 1 本线索' }));
    expect(screen.getByText('已选择 2 项')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '删除 2 项' }));
    await waitFor(() => expect(historyMocks.deleteMany).toHaveBeenCalledWith(['三体', '小王子']));
    expect(await screen.findByText('还没有寻书记录')).toBeTruthy();
  });

  it('closes the recent search sheet before the full-screen search page', async () => {
    historyMocks.records = [
      {
        id: '三体',
        query: '三体',
        normalizedQuery: '三体',
        createdAt: 100,
        updatedAt: 200,
        resultCount: 2,
        results: [directResult, externalResult],
        intent: tier1Response.intent,
        selectedSource: 'all',
        deepSearchStatus: 'idle',
        progressSummary: [],
        schemaVersion: 1,
      },
    ];
    const onClose = vi.fn();
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    const recentButton = screen.getByRole('button', { name: '最近寻书' });
    fireEvent.click(recentButton);
    expect(await screen.findByRole('dialog', { name: '最近寻书' })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('region', { name: '全网搜书' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '最近寻书' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(historyBackSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(recentButton);

    fireEvent.click(recentButton);
    expect(await screen.findByRole('dialog', { name: '最近寻书' })).toBeTruthy();
    expect(eventDispatcher.dispatchSync('native-key-down', { keyName: 'Back' })).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '最近寻书' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(historyBackSpy).not.toHaveBeenCalled();

    historyBackSpy.mockRestore();
  });

  it('closes the detail sheet first when pressing Escape', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);
    const onClose = vi.fn();
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('Frankenstein; Or, The Modern Prometheus'));

    expect(screen.getByRole('dialog', { name: '书籍详情' })).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('region', { name: '全网搜书' }), { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '书籍详情' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(historyBackSpy).not.toHaveBeenCalled();

    historyBackSpy.mockRestore();
  });

  it('closes the detail sheet first when pressing Android Back', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);
    const onClose = vi.fn();
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('Frankenstein; Or, The Modern Prometheus'));

    expect(screen.getByRole('dialog', { name: '书籍详情' })).toBeTruthy();
    expect(eventDispatcher.dispatchSync('native-key-down', { keyName: 'Back' })).toBe(true);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '书籍详情' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(historyBackSpy).not.toHaveBeenCalled();

    historyBackSpy.mockRestore();
  });

  it('ignores repeated Escape closes before the dialog unmounts', () => {
    const onClose = vi.fn();
    const historyBackSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    const surface = screen.getByRole('region', { name: '全网搜书' });
    fireEvent.keyDown(surface, { key: 'Escape' });
    fireEvent.keyDown(surface, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(historyBackSpy).toHaveBeenCalledTimes(1);

    historyBackSpy.mockRestore();
  });

  it('uses the shared Dialog shell for the detail sheet and restores focus to the opening result', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    const resultButton = await screen.findByRole('button', {
      name: /查看 Frankenstein; Or, The Modern Prometheus 详情/,
    });
    fireEvent.click(resultButton);

    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    expect(detailSheet.className).toContain('modal');
    expect(detailSheet.querySelector('.dialog-overlay')).toBeTruthy();
    expect(detailSheet.querySelector('.modal-box')).toBeTruthy();
    expect(detailSheet.querySelector('.drag-handle')).toBeTruthy();
    expect(screen.queryByTestId('ai-book-search-detail-overlay')).toBeNull();
    expect(within(detailSheet).queryByRole('button', { name: 'Close' })).toBeNull();
    const handle = within(detailSheet).getByRole('button', { name: '下拉关闭书籍详情' });
    const lastAction = within(detailSheet).getByRole('button', {
      name: /下载 Project Gutenberg EPUB 版本/,
    });
    lastAction.focus();
    fireEvent.keyDown(detailSheet, { key: 'Tab' });
    expect(document.activeElement).toBe(handle);

    fireEvent.click(handle);
    expect(screen.queryByRole('dialog', { name: '书籍详情' })).toBeNull();
    expect(document.activeElement).toBe(resultButton);
  });

  it('opens a detail source directly with one tap on the visit button', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('The Left Hand of Darkness'));
    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });

    fireEvent.click(within(detailSheet).getByRole('button', { name: /访问 Open Library 来源/ }));

    expect(openExternalUrlMock).toHaveBeenCalledWith('https://openlibrary.org/works/OL45883W');
    expect(screen.queryByRole('alertdialog', { name: '版权提示' })).toBeNull();
  });

  it('keeps aggregation copyright notice above the search page on Escape', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);
    const onClose = vi.fn();

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByRole('button', { name: /Z-Library/ }));

    const notice = await screen.findByRole('alertdialog', { name: '版权风险提示' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' }));
    fireEvent.keyDown(notice, { key: 'Escape' });

    expect(screen.queryByRole('alertdialog', { name: '版权风险提示' })).toBeNull();
    expect(screen.getByRole('region', { name: '全网搜书' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes aggregation copyright notice before the search page on Android Back', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);
    const onClose = vi.fn();

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={onClose}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByRole('button', { name: /Z-Library/ }));

    expect(screen.getByRole('alertdialog', { name: '版权风险提示' })).toBeTruthy();
    act(() => {
      expect(eventDispatcher.dispatchSync('native-key-down', { keyName: 'Back' })).toBe(true);
    });

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: '版权风险提示' })).toBeNull(),
    );
    expect(screen.getByRole('region', { name: '全网搜书' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps successful search results visible when saving recent history fails', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);
    historyMocks.save.mockRejectedValueOnce(new Error('history quota exceeded'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(await screen.findByText('Frankenstein; Or, The Modern Prometheus')).toBeTruthy();
    expect(screen.getByText('The Left Hand of Darkness')).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: '为你整理了这些书' })).toBeTruthy();
    expect(screen.queryByText('history quota exceeded')).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: '寻书路上卡了一下' })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to save AI book search history snapshot',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('saves the current search progress buffer with recent history snapshots', async () => {
    searchAIBooksTier1Mock.mockImplementation(
      async (_query: string, _settings: unknown, options?: AIBookSearchOptions) => {
        options?.onProgress?.({
          step: 'tier1-sources',
          message: 'Open Library 找到 1 条线索',
          source: 'open-library',
          timestamp: 1,
        });
        options?.onProgress?.({ step: 'ai-scoring', message: 'AI 正在整理相关度', timestamp: 2 });
        return tier1Response;
      },
    );

    render(
      <AIBookSearchDialog
        settings={CONFIGURED_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() => expect(historyMocks.save).toHaveBeenCalledTimes(1));
    const savedInput = historyMocks.save.mock.calls[0]?.[0];
    const progressMessages = savedInput.progressEvents.map(
      (event: AIBookSearchProgressEvent) => event.message,
    );
    expect(progressMessages).toEqual([
      'AI 正在理解书名、作者和语言偏好',
      'Open Library 找到 1 条线索',
      'AI 正在整理相关度',
      '已整理出 2 个结果，其中 1 本可直接导入书架',
    ]);
  });

  it('searches books and keeps import and external actions inside the detail sheet', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: '全网搜书' })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(screen.getAllByText('正在搜索开放图书来源').length).toBeGreaterThan(0);
    expect(screen.queryByText('正在理解你的想法...')).toBeNull();
    await waitFor(() =>
      expect(searchAIBooksTier1Mock).toHaveBeenCalledWith(
        'frankenstein epub',
        DEFAULT_AI_SETTINGS,
        expect.any(Object),
      ),
    );

    const title = await screen.findByText('Frankenstein; Or, The Modern Prometheus');
    const resultCard = title.closest('article');
    if (!resultCard) throw new Error('Expected result card');

    expect(resultCard.className).toContain('overflow-hidden');
    expect(within(resultCard).queryByRole('button', { name: '导入 EPUB' })).toBeNull();
    expect(within(resultCard).queryByRole('button', { name: '打开来源' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: '书籍详情' })).toBeNull();
    expect(screen.getByText('The Left Hand of Darkness')).toBeTruthy();

    fireEvent.click(title);

    const detailSheet = await screen.findByRole('dialog', { name: '书籍详情' });
    expect(
      within(detailSheet).getByRole('button', { name: /访问 Project Gutenberg 来源/ }),
    ).toBeTruthy();
    expect(
      within(detailSheet).getByRole('button', { name: /下载 Project Gutenberg EPUB 版本/ }),
    ).toBeTruthy();
  });

  it('shows thinking logs, stats, source filters, rich cards, and deep search controls', async () => {
    searchAIBooksTier1Mock.mockImplementation(async (_query, _settings, options) => {
      options?.onProgress?.({ step: 'intent', message: '已理解你的寻书意图', timestamp: 1 });
      options?.onProgress?.({
        step: 'tier1-sources',
        message: 'GitHub API 已限流，约 11:15 PM 恢复，先展示其他书源结果',
        source: 'github',
        timestamp: 2,
      });
      options?.onProgress?.({
        step: 'tier1-sources',
        message: 'Open Library 找到 1 条线索',
        source: 'open-library',
        timestamp: 3,
      });
      options?.onProgress?.({
        step: 'tier1-sources',
        message: 'Gutendex 暂时不可用，先看其他来源',
        source: 'gutendex',
        timestamp: 4,
      });
      options?.onProgress?.({
        step: 'ai-scoring',
        message: 'AI 正在按书名、作者、语言和可导入性整理',
        timestamp: 5,
      });
      return tier1Response;
    });

    render(
      <AIBookSearchDialog
        settings={CONFIGURED_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(screen.getAllByText('正在整理结果...').length).toBeGreaterThan(0);
    expect(await screen.findByText('AI 正在按书名、作者、语言和可导入性整理')).toBeTruthy();
    expect(
      screen.getByText('AI 正在按书名、作者、语言和可导入性整理').closest('ul')?.className,
    ).toContain('text-[11px]');
    expect(
      screen.getByText('AI 正在按书名、作者、语言和可导入性整理').closest('ul')?.className,
    ).toContain('leading-4');
    expect(
      screen.queryByText('GitHub API 已限流，约 11:15 PM 恢复，先展示其他书源结果'),
    ).toBeNull();
    expect(screen.getByText('已整理出 2 个结果，其中 1 本可直接导入书架')).toBeTruthy();
    expect(await screen.findByText('已寻过部分书源')).toBeTruthy();
    expect(screen.getByText('部分完成')).toBeTruthy();
    expect(await screen.findByText('遇见结果')).toBeTruthy();
    expect(screen.getByText('可带回')).toBeTruthy();
    expect(screen.getByText('书路')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '搜索结果' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /全部 2/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /Gutendex 1/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /GitHub 0/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open Library 1/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Internet Archive 0/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /聚合站 0/ })).toBeNull();
    expect(screen.queryByText('Exact title and public-domain match')).toBeNull();
    expect(screen.getByText('相关度 94')).toBeTruthy();
    expect(screen.queryByText('AI 94')).toBeNull();
    expect(screen.getByText('EPUB')).toBeTruthy();
    expect(screen.getByRole('button', { name: /不是那个Ta？深度搜索再试试/ })).toBeTruthy();
  });

  it('updates progress copy for searching, results, no-result, and partial source states', async () => {
    const searchProgress = deferred<AIBookSearchResponse>();
    let emitProgress: ((event: AIBookSearchProgressEvent) => void) | undefined;
    searchAIBooksTier1Mock.mockImplementation(async (_query, _settings, options) => {
      emitProgress = options?.onProgress;
      return searchProgress.promise;
    });

    render(
      <AIBookSearchDialog
        settings={CONFIGURED_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(screen.getByRole('heading', { level: 2, name: '正在理解你的想法...' })).toBeTruthy();
    expect(screen.getByText('理解中')).toBeTruthy();

    await waitFor(() => expect(emitProgress).toBeTruthy());
    act(() => {
      emitProgress?.({
        step: 'tier1-sources',
        message: 'open-library returned 1 results',
        source: 'open-library',
        timestamp: 1,
      });
    });

    expect(screen.getByRole('heading', { level: 2, name: '正在为你寻书...' })).toBeTruthy();
    expect(screen.getByText('寻书中')).toBeTruthy();

    await act(async () => {
      searchProgress.resolve(tier1Response);
      await searchProgress.promise;
    });

    expect(screen.getByRole('heading', { level: 2, name: '为你整理了这些书' })).toBeTruthy();
    expect(screen.getByText('已整理')).toBeTruthy();

    cleanup();
    const emptyProgress = deferred<AIBookSearchResponse>();
    searchAIBooksTier1Mock.mockImplementation(async () => emptyProgress.promise);
    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'unknown book' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(screen.getByRole('heading', { level: 2, name: '正在搜索开放图书来源' })).toBeTruthy();
    expect(screen.queryByText('正在理解你的想法...')).toBeNull();
    await act(async () => {
      emptyProgress.resolve({ ...tier1Response, results: [] });
      await emptyProgress.promise;
    });

    expect(screen.getByRole('heading', { level: 2, name: '暂时没有遇见合适的书' })).toBeTruthy();
    expect(screen.getByText('已寻过')).toBeTruthy();

    cleanup();
    searchAIBooksTier1Mock.mockImplementation(async (_query, _settings, options) => {
      options?.onProgress?.({
        step: 'tier1-sources',
        message: 'Failed to fetch',
        source: 'gutendex',
        timestamp: 1,
      });
      return tier1Response;
    });
    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(await screen.findByRole('heading', { level: 2, name: '已寻过部分书源' })).toBeTruthy();
    expect(screen.getByText('部分完成')).toBeTruthy();
  });

  it('shows only the latest three readable progress logs and animates the active badge', async () => {
    const searchProgress = deferred<AIBookSearchResponse>();
    let emitProgress: ((event: AIBookSearchProgressEvent) => void) | undefined;
    searchAIBooksTier1Mock.mockImplementation(async (_query, _settings, options) => {
      emitProgress = options?.onProgress;
      return searchProgress.promise;
    });

    render(
      <AIBookSearchDialog
        settings={CONFIGURED_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: '三体' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));

    expect(screen.getByText('理解中').className).toContain(
      'readio-ai-search-progress-badge--active',
    );

    await waitFor(() => expect(emitProgress).toBeTruthy());
    act(() => {
      emitProgress?.({ step: 'intent', message: '已理解你的寻书意图', timestamp: 1 });
      emitProgress?.({
        step: 'tier1-sources',
        message: '正在查找 Open Library、GitHub、Gutendex',
        timestamp: 2,
      });
      emitProgress?.({
        step: 'tier1-sources',
        message: 'Open Library 找到 6 条线索',
        source: 'open-library',
        timestamp: 3,
      });
      emitProgress?.({
        step: 'tier1-sources',
        message: 'GitHub 找到 17 条线索',
        source: 'github',
        timestamp: 4,
      });
      emitProgress?.({
        step: 'tier1-sources',
        message: 'Gutendex 暂时没有结果',
        source: 'gutendex',
        timestamp: 5,
      });
      emitProgress?.({
        step: 'ai-scoring',
        message: 'AI 正在按书名、作者、语言和可导入性整理',
        timestamp: 6,
      });
    });

    expect(screen.getAllByRole('heading', { level: 2, name: '正在整理结果...' })).toHaveLength(1);
    expect(screen.getByText('整理中')).toBeTruthy();
    expect(screen.getByTestId('ai-book-search-literary-quote-text').textContent).toMatch(/^“.+”$/);
    expect(screen.queryByText('已理解你的寻书意图')).toBeNull();
    expect(screen.queryByText('正在查找 Open Library、GitHub、Gutendex')).toBeNull();
    expect(screen.queryByText('Open Library 找到 6 条线索')).toBeNull();
    expect(screen.getByText('GitHub 找到 17 条线索')).toBeTruthy();
    expect(screen.getByText('Gutendex 暂时没有结果')).toBeTruthy();
    expect(screen.getByText('AI 正在按书名、作者、语言和可导入性整理')).toBeTruthy();
  });

  it('filters results and opens a prototype-aligned detail bottom sheet', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByRole('button', { name: /Open Library 1/ }));

    expect(screen.queryByText('Frankenstein; Or, The Modern Prometheus')).toBeNull();
    expect(screen.getByText('The Left Hand of Darkness')).toBeTruthy();

    const resultCard = screen.getByText('The Left Hand of Darkness').closest('article');
    expect(resultCard?.className).toContain('overflow-hidden');
    expect(resultCard?.querySelector('.min-w-0')).toBeTruthy();
    expect(
      resultCard ? within(resultCard).queryByRole('button', { name: '打开来源' }) : null,
    ).toBeNull();

    fireEvent.click(screen.getByText('The Left Hand of Darkness'));

    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    const detailOverlay = detailSheet.querySelector('.dialog-overlay');
    const modalBox = detailSheet.querySelector('.modal-box');
    expect(detailOverlay?.className).toContain('fixed');
    expect(detailOverlay?.className).toContain('inset-0');
    expect(detailOverlay?.className).toContain('bg-base-content/20');
    expect(detailOverlay?.className).toContain('backdrop-blur-[1px]');
    expect(detailSheet).toBeTruthy();
    expect(detailSheet.className).toContain('modal');
    expect(detailSheet.getAttribute('aria-modal')).toBe('true');
    expect(modalBox?.className).toContain('bg-base-100/95');
    expect(modalBox?.className).toContain('sm:max-w-md');
    expect(screen.queryByTestId('ai-book-search-detail-overlay')).toBeNull();
    expect(within(detailSheet).queryByRole('button', { name: '关闭书籍详情' })).toBeNull();
    const dismissHandle = within(detailSheet).getByRole('button', { name: '下拉关闭书籍详情' });
    expect(dismissHandle.className).toContain('touch-none');
    expect(document.activeElement).toBe(dismissHandle);
    fireEvent.mouseDown(dismissHandle, { clientY: 20, clientX: 0 });
    fireEvent.mouseUp(window, { clientY: 700, clientX: 0 });
    expect(screen.queryByRole('dialog', { name: '书籍详情' })).toBeNull();

    fireEvent.click(screen.getByText('The Left Hand of Darkness'));
    const reopenedDetailSheet = screen.getByRole('dialog', { name: '书籍详情' });

    const detailTitle = within(reopenedDetailSheet).getByRole('heading', {
      level: 3,
      name: 'The Left Hand of Darkness',
    });
    expect(detailTitle.className).toContain('text-center');
    expect(detailTitle.className).toContain('line-clamp-2');
    expect(
      within(reopenedDetailSheet).getByText('Ursula K. Le Guin · 1969 · en').className,
    ).toContain('text-center');
    expect(
      within(reopenedDetailSheet).getByLabelText('The Left Hand of Darkness 封面'),
    ).toBeTruthy();
    expect(within(reopenedDetailSheet).getByText('简介')).toBeTruthy();
    expect(within(reopenedDetailSheet).getByText('A classic science fiction novel.')).toBeTruthy();
    expect(within(reopenedDetailSheet).getByText('AI 推荐理由')).toBeTruthy();
    expect(
      within(reopenedDetailSheet).getByText('Strong title match from Open Library'),
    ).toBeTruthy();

    const sourceRows = within(reopenedDetailSheet).getAllByText('Open Library');
    const sourceRow = sourceRows
      .map((node) => node.closest('li'))
      .find((row): row is HTMLLIElement => !!row);
    if (!sourceRow) throw new Error('Expected source row');
    expect(sourceRow.className).toContain('justify-between');
    expect(sourceRow.className).not.toContain('flex-wrap');
    expect(
      within(sourceRow).getByRole('button', { name: /访问 Open Library 来源/ }).textContent,
    ).toBe('访问');

    expect(within(reopenedDetailSheet).getAllByText('HTML').length).toBeGreaterThan(0);
    expect(within(reopenedDetailSheet).getAllByText('外部风险').length).toBeGreaterThan(0);

    const reopenedOverlay = reopenedDetailSheet.querySelector('.dialog-overlay');
    expect(reopenedOverlay).toBeTruthy();
    fireEvent.click(reopenedOverlay!);
    expect(screen.queryByRole('dialog', { name: '书籍详情' })).toBeNull();
  });

  it('hides the empty detail formats section and deduplicates archive source rows', async () => {
    const duplicatedArchiveResult: AIBookSearchResult = {
      ...archiveResult,
      formats: [],
      sourceLinks: [
        {
          source: 'internet-archive',
          url: 'https://archive.org/details/left_hand_archive',
          label: 'Internet Archive',
          risk: 'external-warning',
        },
        {
          source: 'internet-archive',
          url: 'https://archive.org/download/left_hand_archive/left_hand_archive.pdf',
          label: 'Internet Archive',
          risk: 'external-warning',
        },
      ],
    };
    searchAIBooksTier1Mock.mockResolvedValue({
      ...tier1Response,
      results: [duplicatedArchiveResult],
    });

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'left hand archive' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('The Left Hand of Darkness Archive Edition'));

    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    expect(within(detailSheet).queryByText('可用格式')).toBeNull();
    expect(
      within(detailSheet).getAllByRole('button', { name: /访问 Internet Archive 来源/ }),
    ).toHaveLength(1);
  });

  it('logs import failures without leaking title, filename, or download URL', async () => {
    const file = new File(['book'], 'frankenstein-private.epub', { type: 'application/epub+zip' });
    const onImportRemoteBook = vi.fn(async () => {
      throw new Error('import failed');
    });
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);
    downloadAIBookFileMock.mockResolvedValue(file);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={onImportRemoteBook}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('Frankenstein; Or, The Modern Prometheus'));

    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    fireEvent.click(
      within(detailSheet).getByRole('button', { name: /下载 Project Gutenberg EPUB 版本/ }),
    );

    await waitFor(() =>
      expect(logDiagnosticErrorMock).toHaveBeenCalledWith(
        'ai_book_search.import_failed',
        expect.any(Error),
        expect.objectContaining({
          resultSource: 'gutendex',
          linkSource: 'gutendex',
          linkFormat: 'epub',
          resultIdLength: directResult.id.length,
        }),
      ),
    );
    const calls = JSON.stringify(logDiagnosticErrorMock.mock.calls);
    expect(calls).not.toContain('Frankenstein; Or, The Modern Prometheus');
    expect(calls).not.toContain('frankenstein-private.epub');
    expect(calls).not.toContain('https://www.gutenberg.org/ebooks/84.epub3.images');
  });

  it('places direct downloads beside visit actions in the detail source row', async () => {
    const file = new File(['book'], 'frankenstein.epub', { type: 'application/epub+zip' });
    const onImportRemoteBook = vi.fn(async () => ({ successCount: 1, failedCount: 0 }));
    const epubLink = directResult.downloadLinks[0];
    if (!epubLink) throw new Error('Expected EPUB link');
    const multiFormatResult: AIBookSearchResult = {
      ...directResult,
      formats: ['epub', 'txt'],
      downloadLinks: [
        epubLink,
        {
          format: 'txt',
          url: 'https://www.gutenberg.org/files/84/84-0.txt',
          filename: 'frankenstein.txt',
          source: 'gutendex',
          risk: 'direct-open',
        },
      ],
    };
    searchAIBooksTier1Mock.mockResolvedValue({ ...tier1Response, results: [multiFormatResult] });
    downloadAIBookFileMock.mockResolvedValue(file);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={onImportRemoteBook}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    const title = await screen.findByText('Frankenstein; Or, The Modern Prometheus');
    const resultCard = title.closest('article');
    if (!resultCard) throw new Error('Expected result card');
    expect(within(resultCard).queryByRole('button', { name: /导入/ })).toBeNull();
    fireEvent.click(title);

    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    expect(within(detailSheet).getByText('可用格式')).toBeTruthy();
    expect(within(detailSheet).getByText('来源')).toBeTruthy();

    const sourceRow = within(detailSheet).getByText('Project Gutenberg').closest('li');
    if (!sourceRow) throw new Error('Expected source row');
    expect(sourceRow.className).toContain('justify-between');
    expect(sourceRow.className).not.toContain('flex-wrap');
    expect(sourceRow.querySelector('.min-w-0.flex-1')).toBeTruthy();

    const visitButton = within(sourceRow).getByRole('button', {
      name: /访问 Project Gutenberg 来源/,
    });
    const epubDownloadButton = within(sourceRow).getByRole('button', {
      name: /下载 Project Gutenberg EPUB 版本/,
    });
    const txtDownloadButton = within(sourceRow).getByRole('button', {
      name: /下载 Project Gutenberg TXT 版本/,
    });
    expect(visitButton.parentElement).toBe(epubDownloadButton.parentElement);
    expect(visitButton.parentElement).toBe(txtDownloadButton.parentElement);
    expect(visitButton.parentElement?.className).toContain('shrink-0');

    expect(visitButton.textContent).toBe('访问');
    expect(epubDownloadButton.textContent).toBe('EPUB');
    expect(txtDownloadButton.textContent).toBe('TXT');
    expect(epubDownloadButton.className).toContain('btn-primary');
    expect(epubDownloadButton.className).toContain('min-h-11');

    fireEvent.click(epubDownloadButton);

    await waitFor(() =>
      expect(downloadAIBookFileMock).toHaveBeenCalledWith(
        multiFormatResult,
        multiFormatResult.downloadLinks[0],
      ),
    );
    await waitFor(() => expect(onImportRemoteBook).toHaveBeenCalledWith(file));
    expect(await within(sourceRow).findByText('已上架')).toBeTruthy();
  });

  it('collapses repeated same-label source rows in the detail sheet', async () => {
    const duplicatedGutenbergResult: AIBookSearchResult = {
      ...directResult,
      sourceLinks: [
        directResult.sourceLinks[0]!,
        {
          source: 'gutendex',
          url: 'https://www.gutenberg.org/ebooks/42324',
          label: 'Project Gutenberg',
          risk: 'external-warning',
        },
      ],
    };
    searchAIBooksTier1Mock.mockResolvedValue({
      ...tier1Response,
      results: [duplicatedGutenbergResult],
    });

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('Frankenstein; Or, The Modern Prometheus'));

    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    expect(
      within(detailSheet).getAllByRole('button', { name: /访问 Project Gutenberg 来源/ }),
    ).toHaveLength(1);
  });

  it('hides detail download buttons for disallowed external links', async () => {
    const unsafeResult: AIBookSearchResult = {
      ...externalResult,
      downloadLinks: [
        {
          format: 'epub',
          url: 'https://openlibrary.org/download/unsafe.epub',
          filename: 'unsafe.epub',
          source: 'open-library',
          risk: 'external-warning',
        },
      ],
    };
    searchAIBooksTier1Mock.mockResolvedValue({ ...tier1Response, results: [unsafeResult] });

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), {
      target: { value: 'left hand of darkness' },
    });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('The Left Hand of Darkness'));

    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    const sourceRows = within(detailSheet).getAllByText('Open Library');
    const sourceRow = sourceRows
      .map((node) => node.closest('li'))
      .find((row): row is HTMLLIElement => !!row);
    if (!sourceRow) throw new Error('Expected source row');

    expect(within(sourceRow).getByRole('button', { name: /访问 Open Library 来源/ })).toBeTruthy();
    expect(
      within(sourceRow).queryByRole('button', { name: /下载 Open Library EPUB 版本/ }),
    ).toBeNull();
    expect(downloadAIBookFileMock).not.toHaveBeenCalled();
  });

  it('runs deep search once and merges tier 2 results by score', async () => {
    searchAIBooksTier1Mock.mockResolvedValue(tier1Response);
    searchAIBooksTier2Mock.mockResolvedValue({ ...tier1Response, results: [archiveResult] });

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein epub' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByRole('button', { name: /深度搜索/ }));

    await waitFor(() =>
      expect(searchAIBooksTier2Mock).toHaveBeenCalledWith(
        'frankenstein epub',
        tier1Response.intent,
        tier1Response.results,
        DEFAULT_AI_SETTINGS,
        expect.any(Object),
      ),
    );
    expect(await screen.findByText('The Left Hand of Darkness Archive Edition')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Internet Archive 1/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /聚合站 0/ })).toBeNull();
    expect(screen.getByRole('button', { name: '搜索完成' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows aggregation links only after a search and requires checkbox before opening external aggregation search', async () => {
    searchAIBooksTier1Mock.mockResolvedValue({ ...tier1Response, results: [] });

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: '三体 刘慈欣' } });
    expect(screen.queryByRole('button', { name: /Z-Library/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(await screen.findByText('暂时没有遇见合适的书。换个说法试试？')).toBeTruthy();
    expect(screen.getByText('或者使用外部聚合搜索找找')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Z-Library/ }));

    const notice = screen.getByRole('alertdialog', { name: '版权风险提示' });
    expect(notice).toBeTruthy();
    expect(notice.parentElement?.className).toContain('bg-base-content/50');
    expect(notice.parentElement?.className).toContain('items-center');
    expect(screen.getByRole('button', { name: '继续访问' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByLabelText('我已知悉以上风险，仅用于个人学习/研究'));
    fireEvent.click(screen.getByRole('button', { name: '继续访问' }));

    expect(openExternalUrlMock).toHaveBeenCalledWith(
      buildAggregationSearchUrl('z-library', '三体 刘慈欣'),
    );
  });

  it('shows prominent download progress and then marks a direct result as already on the shelf', async () => {
    const file = new File(['book'], 'frankenstein.epub', { type: 'application/epub+zip' });
    const download = deferred<File>();
    const onImportRemoteBook = vi.fn(async () => ({ successCount: 1, failedCount: 0 }));
    searchAIBooksTier1Mock.mockResolvedValue({ ...tier1Response, results: [directResult] });
    downloadAIBookFileMock.mockReturnValue(download.promise);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={onImportRemoteBook}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(await screen.findByText('Frankenstein; Or, The Modern Prometheus')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '导入 EPUB' })).toBeNull();

    fireEvent.click(screen.getByText('Frankenstein; Or, The Modern Prometheus'));
    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    const downloadButton = within(detailSheet).getByRole('button', {
      name: /下载 Project Gutenberg EPUB 版本/,
    });
    fireEvent.click(downloadButton);

    const progressButton = await within(detailSheet).findByRole('button', {
      name: /正在下载 Project Gutenberg EPUB 版本/,
    });
    expect(progressButton.hasAttribute('disabled')).toBe(true);
    expect(progressButton.getAttribute('aria-busy')).toBe('true');
    expect(
      within(progressButton).getByRole('progressbar', { name: 'Project Gutenberg EPUB 下载进度' }),
    ).toBeTruthy();

    await act(async () => {
      download.resolve(file);
      await download.promise;
    });

    await waitFor(() =>
      expect(downloadAIBookFileMock).toHaveBeenCalledWith(
        directResult,
        directResult.downloadLinks[0],
      ),
    );
    await waitFor(() => expect(onImportRemoteBook).toHaveBeenCalledWith(file));
    const importedButton = await within(detailSheet).findByRole('button', {
      name: /已上架 Project Gutenberg EPUB 版本/,
    });
    expect(importedButton.textContent).toBe('已上架');
    expect(importedButton.className).toContain('text-primary');
  });

  it('keeps the detail download button on the shelf when import reports an existing book', async () => {
    const file = new File(['book'], 'frankenstein.epub', { type: 'application/epub+zip' });
    const onImportRemoteBook = vi.fn(async () => ({ successCount: 0, failedCount: 0 }));
    searchAIBooksTier1Mock.mockResolvedValue({ ...tier1Response, results: [directResult] });
    downloadAIBookFileMock.mockResolvedValue(file);

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={onImportRemoteBook}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('Frankenstein; Or, The Modern Prometheus'));
    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });

    fireEvent.click(
      within(detailSheet).getByRole('button', { name: /下载 Project Gutenberg EPUB 版本/ }),
    );

    await waitFor(() => expect(onImportRemoteBook).toHaveBeenCalledWith(file));
    const importedButton = await within(detailSheet).findByRole('button', {
      name: /已上架 Project Gutenberg EPUB 版本/,
    });
    expect(importedButton.textContent).toBe('已上架');
    expect(importedButton.hasAttribute('disabled')).toBe(true);
  });

  it('marks existing library books as already on the shelf without downloading after search and history restore', async () => {
    libraryMocks.visibleLibrary = [
      {
        hash: 'existing-frankenstein',
        format: 'EPUB',
        title: 'Frankenstein: or, the modern prometheus',
        author: 'Shelley, Mary Wollstonecraft',
        createdAt: 1,
        updatedAt: 2,
        downloadedAt: 3,
      },
    ];
    historyMocks.records = [
      {
        id: 'frankenstein',
        query: 'frankenstein',
        normalizedQuery: 'frankenstein',
        createdAt: 100,
        updatedAt: 200,
        resultCount: 1,
        results: [directResult],
        intent: tier1Response.intent,
        selectedSource: 'all',
        deepSearchStatus: 'idle',
        progressSummary: [],
        schemaVersion: 1,
      },
    ];
    searchAIBooksTier1Mock.mockResolvedValue({ ...tier1Response, results: [directResult] });

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'frankenstein' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    fireEvent.click(await screen.findByText('Frankenstein; Or, The Modern Prometheus'));

    let detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    let shelfButton = within(detailSheet).getByRole('button', {
      name: /已上架 Project Gutenberg EPUB 版本/,
    });
    expect(shelfButton.textContent).toBe('已上架');
    expect(shelfButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(shelfButton);
    expect(downloadAIBookFileMock).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('region', { name: '全网搜书' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '最近寻书' }));
    const historySheet = await screen.findByRole('dialog', { name: '最近寻书' });
    fireEvent.click(
      within(historySheet).getByRole('button', {
        name: '恢复寻书结果：frankenstein，找到 1 本线索',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '最近寻书' })).toBeNull());
    fireEvent.click(screen.getByText('Frankenstein; Or, The Modern Prometheus'));

    detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    shelfButton = within(detailSheet).getByRole('button', {
      name: /已上架 Project Gutenberg EPUB 版本/,
    });
    expect(shelfButton.hasAttribute('disabled')).toBe(true);
    expect(downloadAIBookFileMock).not.toHaveBeenCalled();
  });

  it('opens warning sources from the detail sheet directly', async () => {
    searchAIBooksTier1Mock.mockResolvedValue({ ...tier1Response, results: [externalResult] });

    render(
      <AIBookSearchDialog
        settings={DEFAULT_AI_SETTINGS}
        onClose={vi.fn()}
        onImportRemoteBook={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索书籍'), { target: { value: 'left hand' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    expect(await screen.findByText('The Left Hand of Darkness')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开来源' })).toBeNull();

    fireEvent.click(screen.getByText('The Left Hand of Darkness'));
    const detailSheet = screen.getByRole('dialog', { name: '书籍详情' });
    fireEvent.click(within(detailSheet).getByRole('button', { name: /访问 Open Library 来源/ }));

    expect(openExternalUrlMock).toHaveBeenCalledWith('https://openlibrary.org/works/OL45883W');
    expect(screen.queryByRole('alertdialog', { name: '版权提示' })).toBeNull();
  });
});
