import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderAIAskBox from '@/app/reader/components/ai/ReaderAIAskBox';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isAndroidApp: false, hasSafeAreaInset: false } }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ systemUIVisible: false, statusBarHeight: 0, safeAreaInsets: {} }),
}));

vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    acquireBackKeyInterception: vi.fn(),
    releaseBackKeyInterception: vi.fn(),
  }),
}));

const renderAskBox = (props: Partial<React.ComponentProps<typeof ReaderAIAskBox>> = {}) => {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const onSpoilerProtectionChange = vi.fn();

  render(
    <ReaderAIAskBox
      source='selection'
      suggestions={['解释这段']}
      spoilerProtection={true}
      onSpoilerProtectionChange={onSpoilerProtectionChange}
      onSubmit={onSubmit}
      onClose={onClose}
      {...props}
    />,
  );

  return { onSubmit, onClose, onSpoilerProtectionChange };
};

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
});

afterEach(() => cleanup());

describe('ReaderAIAskBox', () => {
  it('explains the answer scope through the spoiler protection switch and hides current position', () => {
    renderAskBox();

    expect(
      screen.getByText('防剧透开启时，只根据你已读到的位置回答；关闭后可能包含未读内容。'),
    ).toBeTruthy();
    expect(screen.queryByText(/当前位置/)).toBeNull();
  });

  it('lets the spoiler explanation span the full dialog width below the header controls', () => {
    renderAskBox();

    const description = screen.getByText(
      '防剧透开启时，只根据你已读到的位置回答；关闭后可能包含未读内容。',
    );
    expect(description.className).toContain('w-full');
    expect(description.className).not.toContain('mt-1');
  });

  it('uses compact dialog spacing', () => {
    renderAskBox();

    const content = screen.getByRole('heading', { name: '问问这本书' }).closest('section');
    expect(content?.className).toContain('p-2');
    expect(content?.className).not.toContain('p-3');
    expect(content?.className).not.toContain('p-4');
  });

  it('anchors the composer to the bottom in a compact sheet', () => {
    renderAskBox({ suggestions: ['前面发生了什么？', '这个人物是谁？', '总结本章到这里'] });

    const content = screen.getByRole('heading', { name: '问问这本书' }).closest('section');
    const composer = screen.getByLabelText('输入你的问题').closest('form');

    expect(content?.className).toContain('flex');
    expect(content?.className).toContain('min-h-full');
    expect(composer?.className).toContain('mt-auto');
    expect(composer?.className).not.toContain('mt-4');
  });

  it('uses the shared Dialog bottom-sheet shell', () => {
    renderAskBox();

    const dialog = screen.getByRole('dialog', { name: '问问这本书' });
    expect(dialog.className).toContain('modal');
    expect(dialog.querySelector('.dialog-overlay')).toBeTruthy();
    expect(dialog.querySelector('.modal-box')).toBeTruthy();
    expect(dialog.querySelector('.drag-handle')).toBeTruthy();
    expect(screen.queryByLabelText('Close')).toBeNull();
  });

  it('does not render a full-width focus ring around the drag handle', () => {
    renderAskBox();

    const dragHandle = screen.getByLabelText('下拉关闭 AI 提问框');
    const dragHandlePill = dragHandle.querySelector('span');

    expect(dragHandle.className).not.toContain('focus-visible:ring');
    expect(dragHandlePill?.className).toContain('group-focus-visible:ring');
  });

  it('uses enough snap height to keep the bottom-anchored composer visible', () => {
    renderAskBox({ suggestions: ['前面发生了什么？', '这个人物是谁？', '总结本章到这里'] });

    const modalBox = screen.getByRole('dialog', { name: '问问这本书' }).querySelector('.modal-box');

    expect(modalBox).toBeTruthy();
    expect(parseFloat((modalBox as HTMLElement).style.height)).toBeCloseTo(52, 3);
  });

  it('fills a suggested question into the input without submitting or closing the sheet', () => {
    const { onSubmit, onClose } = renderAskBox();

    fireEvent.click(screen.getByRole('button', { name: '使用建议问题：解释这段' }));

    expect((screen.getByLabelText('输入你的问题') as HTMLTextAreaElement).value).toBe('解释这段');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a polite suggestion loading hint while keeping manual input available', () => {
    renderAskBox({ suggestionsLoading: true, suggestions: [] });

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('正在猜你想问什么');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(screen.getAllByTestId('reader-ai-suggestion-loading-dot')).toHaveLength(3);
    expect(screen.getByLabelText('输入你的问题').hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: '使用建议问题：解释这段' })).toBeTruthy();
  });

  it('hides the suggestion loading hint when generated suggestions arrive', () => {
    renderAskBox({ suggestionsLoading: false, suggestions: ['为什么这样写？'] });

    expect(screen.queryByText(/正在猜你想问什么/)).toBeNull();
    expect(screen.getByRole('button', { name: '使用建议问题：为什么这样写？' })).toBeTruthy();
  });
});
