import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderAIButton from '@/app/reader/components/ai/ReaderAIButton';

const mocks = vi.hoisted(() => ({
  appService: {
    isMobile: true,
    hasSafeAreaInset: false,
    isIOSApp: false,
  },
  hoveredBookKey: 'book-1' as string | null,
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

function renderButton(onClick = vi.fn()) {
  render(<ReaderAIButton bookKey='book-1' onClick={onClick} />);
  return onClick;
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

afterEach(() => {
  cleanup();
  document
    .querySelectorAll('.footerbar-progress-mobile, .footerbar-font-mobile, .footerbar-color-mobile')
    .forEach((panel) => panel.remove());
});

describe('ReaderAIButton positioning', () => {
  it('shows the floating AI entry by default with an accessible dialog trigger', () => {
    renderButton();

    const button = screen.getByRole('button', { name: '打开 AI 阅读助手' });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it.each([
    ['progress', 'footerbar-progress-mobile', 160, '224px'],
    ['font', 'footerbar-font-mobile', 152, '216px'],
    ['color', 'footerbar-color-mobile', 300, '364px'],
  ])(
    'aligns the AI button bottom to the measured mobile %s footer panel height when taller than expected',
    async (tab, panelClassName, panelHeight, expectedOffset) => {
      const panel = document.createElement('div');
      panel.className = panelClassName;
      panel.getBoundingClientRect = vi.fn(() => ({
        top: 844 - 64 - panelHeight,
        bottom: 844 - 64,
        left: 0,
        right: 390,
        width: 390,
        height: panelHeight,
        x: 0,
        y: 844 - 64 - panelHeight,
        toJSON: () => ({}),
      }));
      document.body.appendChild(panel);
      mocks.footerActionTab = tab;
      const onClick = renderButton();

      const button = screen.getByRole('button', { name: '打开 AI 阅读助手' });
      const container = button.parentElement as HTMLElement;

      await waitFor(() => expect(container.style.bottom).toContain(expectedOffset));
      expect(container.style.bottom).toContain('safe-area-inset-bottom');
      fireEvent.click(button);
      expect(onClick).toHaveBeenCalledTimes(1);
    },
  );

  it('stays visible on mobile while a footer panel is open even after hover state clears', () => {
    mocks.hoveredBookKey = null;
    mocks.footerActionTab = 'font';
    const panel = document.createElement('div');
    panel.className = 'footerbar-font-mobile';
    Object.defineProperty(panel, 'offsetHeight', { value: 158 });
    document.body.appendChild(panel);

    renderButton();

    expect(screen.getByRole('button', { name: '打开 AI 阅读助手' })).toBeTruthy();
  });

  it.each([
    ['progress', '207px'],
    ['font', '204px'],
    ['color', '347px'],
  ])('uses the final mobile %s panel position on the first open frame', (tab, expectedOffset) => {
    mocks.footerActionTab = tab;

    renderButton();
    const container = screen.getByRole('button', { name: '打开 AI 阅读助手' })
      .parentElement as HTMLElement;

    expect(container.style.bottom).toContain(expectedOffset);
    expect(container.style.bottom).not.toContain('64px');
  });

  it('does not move the AI button downward when the panel is measured shorter during animation', async () => {
    const panel = document.createElement('div');
    panel.className = 'footerbar-progress-mobile';
    panel.getBoundingClientRect = vi.fn(() => ({
      top: 680,
      bottom: 780,
      left: 0,
      right: 390,
      width: 390,
      height: 100,
      x: 0,
      y: 680,
      toJSON: () => ({}),
    }));
    document.body.appendChild(panel);
    mocks.footerActionTab = 'progress';

    renderButton();
    const container = screen.getByRole('button', { name: '打开 AI 阅读助手' })
      .parentElement as HTMLElement;

    expect(container.style.bottom).toContain('207px');
    await waitFor(() => expect(panel.getBoundingClientRect).toHaveBeenCalled());
    expect(container.style.bottom).toContain('207px');
  });

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

  it('does not open on pointer down before the ask sheet is mounted', () => {
    const onClick = renderButton();

    fireEvent.pointerDown(screen.getByRole('button', { name: '打开 AI 阅读助手' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('opens once on click after pointer down', () => {
    const onClick = renderButton();
    const button = screen.getByRole('button', { name: '打开 AI 阅读助手' });

    fireEvent.pointerDown(button);
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ignores non-primary pointer down on desktop', () => {
    const onClick = renderButton();

    fireEvent.pointerDown(screen.getByRole('button', { name: '打开 AI 阅读助手' }), { button: 2 });

    expect(onClick).not.toHaveBeenCalled();
  });
});
