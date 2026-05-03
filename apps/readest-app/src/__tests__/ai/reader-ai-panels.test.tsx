import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  it('shows compact spoiler protection in the ask box header', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '问问这本书' });
    const switchControl = within(dialog).getByRole('switch', {
      name: '防剧透已开启，只根据当前阅读进度回答',
    });

    expect(switchControl.getAttribute('aria-checked')).toBe('true');
    expect(switchControl.textContent).toContain('防剧透');
    expect(switchControl.textContent).toContain('开');
    expect(switchControl.textContent).not.toContain('只根据你已读到的位置回答');
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

  it('shows compact spoiler protection state in the answer panel header', () => {
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        spoilerProtection={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'AI 阅读助手' });
    const switchControl = within(dialog).getByRole('switch', {
      name: '防剧透已关闭，可能包含未读内容',
    });

    expect(switchControl.getAttribute('aria-checked')).toBe('false');
    expect(switchControl.textContent).toContain('防剧透');
    expect(switchControl.textContent).toContain('关');
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

    expect(document.activeElement).toBe(
      screen.getByRole('switch', { name: '防剧透已开启，只根据当前阅读进度回答' }),
    );
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

    expect(document.activeElement).toBe(
      screen.getByRole('switch', { name: '防剧透已开启，只根据当前阅读进度回答' }),
    );
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

  it('keeps the original question visible and shows follow-up turns inline', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-1', role: 'user', content: '前面发生了什么？', createdAt: 1 },
          { id: 'assistant-1', role: 'assistant', content: '第一次回答', createdAt: 2 },
          { id: 'user-2', role: 'user', content: '再解释简单一点', createdAt: 3 },
          { id: 'assistant-2', role: 'assistant', content: '第二次回答', createdAt: 4 },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const originalQuestion = screen.getByRole('region', { name: '原始问题' });
    expect(within(originalQuestion).getByText('前面发生了什么？')).toBeTruthy();
    expect(within(originalQuestion).queryByText('再解释简单一点')).toBeNull();

    const conversationHistory = screen.getByRole('region', { name: 'AI 对话历史' });
    expect(within(conversationHistory).getByText('第一次回答')).toBeTruthy();
    expect(within(conversationHistory).getByText('追问')).toBeTruthy();
    expect(within(conversationHistory).getByText('再解释简单一点')).toBeTruthy();
    expect(within(conversationHistory).getByText('第二次回答')).toBeTruthy();
  });

  it('shows selected passage separately from the original question', () => {
    const selectedMessages = [
      {
        id: 'user-selection',
        role: 'user' as const,
        content: '解释这段',
        quotedText: '亚恩·考特曼望着窗外逐渐沉下去的夕阳。',
        createdAt: 1,
      },
      {
        id: 'assistant-selection',
        role: 'assistant' as const,
        content: '这是回答。',
        createdAt: 2,
      },
    ];

    render(
      <ReaderAIAnswerPanel messages={selectedMessages} onSubmit={vi.fn()} onClose={vi.fn()} />,
    );

    const originalQuestion = screen.getByRole('region', { name: '原始问题' });
    expect(within(originalQuestion).getByText('选中的原文')).toBeTruthy();
    expect(
      within(originalQuestion).getByText('「亚恩·考特曼望着窗外逐渐沉下去的夕阳。」'),
    ).toBeTruthy();
    expect(within(originalQuestion).getByText('解释这段')).toBeTruthy();
  });

  it('renders assistant answers as markdown instead of raw formatting symbols', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-markdown', role: 'user', content: '解释人物', createdAt: 1 },
          {
            id: 'assistant-markdown',
            role: 'assistant',
            content: '### 在故事中的表现\n\n- **序列3半神**\n- 魔药名称正是**海王**',
            createdAt: 2,
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const conversationHistory = screen.getByRole('region', { name: 'AI 对话历史' });
    expect(within(conversationHistory).getByRole('heading', { level: 3 }).textContent).toBe(
      '在故事中的表现',
    );
    expect(within(conversationHistory).getByText('序列3半神').tagName).toBe('STRONG');
    expect(conversationHistory.textContent).not.toContain('###');
    expect(conversationHistory.textContent).not.toContain('**');
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

  it('keeps a dynamic loading answer status inside the current assistant turn', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-loading', role: 'user', content: '解释这一页', createdAt: 1 },
          { id: 'assistant-loading', role: 'assistant', content: '', createdAt: 2 },
        ]}
        loading
        generationStatus='connecting'
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const conversationHistory = screen.getByRole('region', { name: 'AI 对话历史' });
    const status = within(conversationHistory).getByRole('status');
    expect(status.textContent).toContain('正在连接 AI 模型');
    expect(within(status).getAllByTestId('reader-ai-thinking-dot')).toHaveLength(3);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('does not show follow-up suggestions before generated suggestions arrive', () => {
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByLabelText('使用建议问题：再解释简单一点')).toBeNull();
    expect(screen.queryByLabelText('使用建议问题：和前文有什么关系？')).toBeNull();
    expect(screen.queryByLabelText('使用建议问题：总结到这里')).toBeNull();
  });

  it('shows a suggestion loading status without rendering fake suggestion choices', () => {
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        suggestionsLoading
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('正在生成追问建议');
    expect(screen.queryByLabelText('使用建议问题：再解释简单一点')).toBeNull();
  });

  it('keeps long follow-up suggestions readable instead of truncating them', () => {
    const longSuggestion = '这段话和前文克莱恩在灰雾之上的发现有什么关系？';
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        suggestions={[longSuggestion]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const suggestionButton = screen.getByLabelText(`使用建议问题：${longSuggestion}`);
    expect(suggestionButton.textContent).toBe(longSuggestion);
    expect(suggestionButton.querySelector('.truncate')).toBeNull();
  });

  it('stacks answer follow-up suggestions instead of showing half-visible horizontal chips', () => {
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        suggestions={[
          'Klein在序列4：欺骗者阶段有哪些新能力和风险？',
          '塔罗牌会在后续冲突中起到什么作用？',
          '目前这条主线和灰雾有什么关系？',
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const suggestionList = screen.getByLabelText('追问建议');
    expect(suggestionList.className).toContain('space-y-2');
    expect(suggestionList.className).not.toContain('overflow-x-auto');
    expect(
      screen.getByLabelText('使用建议问题：塔罗牌会在后续冲突中起到什么作用？').className,
    ).toContain('w-full');
  });

  it('renders answer sources and delegates source navigation', () => {
    const onSourceClick = vi.fn();
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source',
            role: 'assistant',
            content: '这是回答。',
            createdAt: 2,
            sources: [
              {
                id: 'selection-source',
                chapterTitle: '选中的原文',
                pageNumber: 12,
                cfi: 'epubcfi(/6/2)',
                snippet: '亚恩看见夕阳。',
                confidence: 'exact',
              },
              {
                id: 'rag-source',
                chapterTitle: '第五章 线索',
                pageNumber: 38,
                snippet: '灰雾之上的线索再次出现。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSourceClick={onSourceClick}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const sources = screen.getByRole('region', { name: '参考来源' });
    expect(within(sources).getByText('第 12 页 · 选中的原文')).toBeTruthy();
    expect(within(sources).getByText('约第 38 页 · 第五章 线索')).toBeTruthy();

    fireEvent.click(within(sources).getByRole('button', { name: /跳转到来源：第 12 页/ }));
    expect(onSourceClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selection-source', cfi: 'epubcfi(/6/2)' }),
    );
  });

  it('shows accessible indexing progress when provided', () => {
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        indexingProgress={{ current: 2, total: 4, phase: 'chunking' }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('status').textContent).toContain('正在结构化本书内容');
    const progressbar = screen.getByRole('progressbar', { name: '结构化进度' });
    expect(progressbar.getAttribute('aria-valuenow')).toBe('50');
  });

  it('does not show indexing progress by default', () => {
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByRole('progressbar', { name: '结构化进度' })).toBeNull();
  });

  it('shows an AI setup action in the answer panel', () => {
    const onClick = vi.fn();
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        setupAction={{ label: '去设置 AI', onClick }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '去设置 AI' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('submits ask box questions through the unified composer', () => {
    const onSubmit = vi.fn();
    render(<ReaderAIAskBox source='control' onSubmit={onSubmit} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('输入你的问题'), { target: { value: '  总结本章  ' } });
    fireEvent.click(screen.getByRole('button', { name: '提问' }));

    expect(onSubmit).toHaveBeenCalledWith('总结本章');
  });

  it('stacks ask box suggestions instead of showing half-visible horizontal chips', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    const suggestionList = screen.getByLabelText('建议问题');
    expect(suggestionList.className).toContain('space-y-2');
    expect(suggestionList.className).not.toContain('overflow-x-auto');
    expect(screen.getByLabelText('使用建议问题：前面发生了什么？').className).toContain('w-full');
    expect(screen.getByLabelText('使用建议问题：这个人物是谁？')).toBeTruthy();
    expect(screen.getByLabelText('使用建议问题：总结本章到这里')).toBeTruthy();
  });
});
