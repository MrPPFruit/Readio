import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ReaderAIAnswerPanel from '@/app/reader/components/ai/ReaderAIAnswerPanel';
import ReaderAIAskBox from '@/app/reader/components/ai/ReaderAIAskBox';

const messages = [
  {
    id: 'user-message',
    role: 'user' as const,
    content: '总结当前章节',
    createdAt: 1,
  },
  {
    id: 'assistant-message',
    role: 'assistant' as const,
    content: '请先在设置中启用 AI',
    createdAt: 2,
  },
];

afterEach(cleanup);

describe('Reader AI panels', () => {
  it('shows spoiler protection as enabled by default in the ask box', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(
      screen
        .getByRole('switch', { name: '防剧透已开启，只根据当前阅读进度回答' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(screen.getByText('防剧透已开启')).toBeTruthy();
  });

  it('lets the user turn off spoiler protection in the ask box', () => {
    const onSpoilerProtectionChange = vi.fn();
    render(
      <ReaderAIAskBox
        source='control'
        spoilerProtection={true}
        onSpoilerProtectionChange={onSpoilerProtectionChange}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('防剧透已开启，只根据当前阅读进度回答'));

    expect(onSpoilerProtectionChange).toHaveBeenCalledWith(false);
  });

  it('shows spoiler protection state in the answer panel', () => {
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        spoilerProtection={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole('switch', { name: '防剧透已关闭，可能包含未读内容' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(screen.getByText('允许后文')).toBeTruthy();
  });

  it('closes the ask box when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: '问问这本书' });
    const backdrop = dialog.parentElement;
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not auto-focus the ask box input on mount', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByLabelText('输入你的问题');

    expect(document.activeElement).not.toBe(input);
  });

  it('focuses the ask box close button on mount', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByLabelText('关闭 AI 提问框'));
  });

  it('keeps Tab focus inside the ask box', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '问问这本书' });
    const input = screen.getByLabelText('输入你的问题');
    input.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });

    expect(document.activeElement).toBe(screen.getByLabelText('关闭 AI 提问框'));
  });

  it('restores focus when the ask box unmounts', () => {
    render(<button type='button'>打开 AI 提问框</button>);
    const trigger = screen.getByRole('button', { name: '打开 AI 提问框' });
    trigger.focus();

    const { unmount } = render(
      <ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('关闭 AI 提问框'));

    unmount();

    expect(document.activeElement).toBe(trigger);
  });

  it('does not auto-focus the answer panel follow-up input on mount', () => {
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByLabelText('继续追问');

    expect(document.activeElement).not.toBe(input);
  });

  it('focuses the answer panel close button on mount', () => {
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(document.activeElement).toBe(screen.getByLabelText('关闭 AI 阅读助手'));
  });

  it('closes the answer panel when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'AI 阅读助手' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab focus inside the answer panel', () => {
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'AI 阅读助手' });
    const input = screen.getByLabelText('继续追问');
    input.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });

    expect(document.activeElement).toBe(screen.getByLabelText('关闭 AI 阅读助手'));
  });

  it('restores focus when the answer panel unmounts', () => {
    render(<button type='button'>打开 AI 阅读助手</button>);
    const trigger = screen.getByRole('button', { name: '打开 AI 阅读助手' });
    trigger.focus();

    const { unmount } = render(
      <ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('关闭 AI 阅读助手'));

    unmount();

    expect(document.activeElement).toBe(trigger);
  });

  it('submits answer panel follow-up questions through the unified composer', () => {
    const onSubmit = vi.fn();
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('继续追问'), { target: { value: '  再简单一点  ' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));

    expect(onSubmit).toHaveBeenCalledWith('再简单一点');
    expect((screen.getByLabelText('继续追问') as HTMLTextAreaElement).value).toBe('');
  });

  it('disables the answer panel composer while loading', () => {
    render(
      <ReaderAIAnswerPanel messages={messages} loading onSubmit={vi.fn()} onClose={vi.fn()} />,
    );

    expect((screen.getByLabelText('继续追问') as HTMLTextAreaElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: '正在生成回答' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('submits ask box questions through the unified composer', () => {
    const onSubmit = vi.fn();
    render(<ReaderAIAskBox source='control' onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('输入你的问题'), { target: { value: '  总结本章  ' } });
    fireEvent.click(screen.getByRole('button', { name: '提问' }));

    expect(onSubmit).toHaveBeenCalledWith('总结本章');
  });

  it('shows a horizontal suggestion rail in the ask box', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByLabelText('使用建议问题：前面发生了什么？')).toBeTruthy();
    expect(screen.getByLabelText('使用建议问题：这个人物是谁？')).toBeTruthy();
    expect(screen.getByLabelText('使用建议问题：总结本章到这里')).toBeTruthy();
  });
});
