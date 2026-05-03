import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderAIButton from '@/app/reader/components/ai/ReaderAIButton';

const mocks = vi.hoisted(() => ({
  appService: {
    isMobile: true,
    hasSafeAreaInset: false,
    isIOSApp: false,
  },
  hoveredBookKey: 'book-1',
  footerActionTab: '',
  viewSettings: { rtl: false },
  getFooterActionTab: vi.fn((bookKey: string) =>
    bookKey === 'book-1' ? mocks.footerActionTab : '',
  ),
  getViewSettings: vi.fn(() => mocks.viewSettings),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    hoveredBookKey: mocks.hoveredBookKey,
    getFooterActionTab: mocks.getFooterActionTab,
    getViewSettings: mocks.getViewSettings,
  }),
}));

function renderButton() {
  render(<ReaderAIButton bookKey='book-1' onClick={vi.fn()} />);
}

beforeEach(() => {
  mocks.appService.isMobile = true;
  mocks.appService.hasSafeAreaInset = false;
  mocks.appService.isIOSApp = false;
  mocks.hoveredBookKey = 'book-1';
  mocks.footerActionTab = '';
  mocks.viewSettings = { rtl: false };
  window.innerWidth = 390;
  window.innerHeight = 844;
});

afterEach(cleanup);

describe('ReaderAIButton positioning', () => {
  it('shows the floating AI entry by default with an accessible dialog trigger', () => {
    renderButton();

    const button = screen.getByRole('button', { name: '打开 AI 阅读助手' });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it.each(['progress', 'font', 'color'])(
    'hides on mobile while the %s footer panel is open',
    (tab) => {
      mocks.footerActionTab = tab;

      renderButton();

      expect(screen.queryByRole('button', { name: '打开 AI 阅读助手' })).toBeNull();
    },
  );

  it('stays visible on desktop when a footer tab exists', () => {
    mocks.appService.isMobile = false;
    mocks.footerActionTab = 'color';
    window.innerWidth = 1024;
    window.innerHeight = 768;

    renderButton();

    expect(screen.getByRole('button', { name: '打开 AI 阅读助手' })).toBeTruthy();
  });

  it('uses left-side positioning for RTL books', () => {
    mocks.viewSettings = { rtl: true };

    renderButton();

    expect(
      screen.getByRole('button', { name: '打开 AI 阅读助手' }).parentElement?.className,
    ).toContain('left-4');
  });
});
