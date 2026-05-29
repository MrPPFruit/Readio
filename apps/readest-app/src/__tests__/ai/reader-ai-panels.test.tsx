import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ReaderAIAnswerPanel from '@/app/reader/components/ai/ReaderAIAnswerPanel';
import ReaderAIAskBox from '@/app/reader/components/ai/ReaderAIAskBox';

const mocks = vi.hoisted(() => ({
  appService: { isAndroidApp: false, hasSafeAreaInset: false },
  themeStore: { systemUIVisible: false, statusBarHeight: 0, safeAreaInsets: {} },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => mocks.themeStore,
}));

vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    acquireBackKeyInterception: vi.fn(),
    releaseBackKeyInterception: vi.fn(),
  }),
}));

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

beforeEach(() => {
  mocks.appService.hasSafeAreaInset = false;
  mocks.themeStore.systemUIVisible = false;
  mocks.themeStore.statusBarHeight = 0;
  mocks.themeStore.safeAreaInsets = {};
});

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

  it('explains the ask box scope through the spoiler protection switch', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(
      screen.getByText('防剧透开启时，只根据你已读到的位置回答；关闭后可能包含未读内容。'),
    ).toBeTruthy();
    expect(screen.queryByText(/当前位置/)).toBeNull();
  });

  it('does not show current section copy when the ask box has no section label', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByText(/当前位置/)).toBeNull();
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

  it('places the answer panel close button at the top right after spoiler protection', () => {
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        spoilerProtection={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'AI 阅读助手' });
    const actions = dialog.querySelector('[data-testid="reader-ai-answer-header-actions"]');

    expect(actions?.children[0]?.getAttribute('role')).toBe('switch');
    expect(actions?.children[1]?.getAttribute('aria-label')).toBe('关闭 AI 阅读助手');
  });

  it('uses the same top safe-area reservation as the reader header', () => {
    mocks.appService.hasSafeAreaInset = true;
    mocks.themeStore.systemUIVisible = true;
    mocks.themeStore.statusBarHeight = 32;
    render(
      <ReaderAIAnswerPanel
        messages={messages}
        gridInsets={{ top: 24, right: 0, bottom: 0, left: 0 }}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const header = screen.getByRole('banner', { name: 'AI 阅读助手顶部栏' });

    expect(header.style.paddingTop).toBe('48px');
  });

  it('closes the ask box when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: '问问这本书' });
    const backdrop = dialog.querySelector('.dialog-overlay');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not auto-focus the ask box input on mount', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByLabelText('输入你的问题');

    expect(document.activeElement).not.toBe(input);
  });

  it('focuses an accessible ask box drag handle without showing a close X', () => {
    const onClose = vi.fn();
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: '问问这本书' });
    const backdrop = dialog.querySelector('.dialog-overlay');
    expect(backdrop?.className).toContain('backdrop-blur-[1px]');
    expect(within(dialog).queryByLabelText('关闭 AI 提问框')).toBeNull();
    const handle = within(dialog).getByLabelText('下拉关闭 AI 提问框');
    expect(handle.className).toContain('touch-none');
    expect(document.activeElement).toBe(handle);

    fireEvent.mouseDown(handle, { clientY: 20, clientX: 0 });
    fireEvent.mouseUp(window, { clientY: 700, clientX: 0 });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab focus inside the ask box', () => {
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '问问这本书' });
    const input = screen.getByLabelText('输入你的问题');
    input.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });

    expect(document.activeElement).toBe(screen.getByLabelText('下拉关闭 AI 提问框'));
  });

  it('restores focus when the ask box unmounts', () => {
    render(<button type='button'>打开 AI 提问框</button>);
    const trigger = screen.getByRole('button', { name: '打开 AI 提问框' });
    trigger.focus();

    const { unmount } = render(
      <ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={vi.fn()} />,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('下拉关闭 AI 提问框'));

    unmount();

    expect(document.activeElement).toBe(trigger);
  });

  it('does not auto-focus the answer panel follow-up input on mount', () => {
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={vi.fn()} />);

    const input = screen.getByLabelText('继续追问');

    expect(document.activeElement).not.toBe(input);
  });

  it('focuses an accessible answer panel close button without showing a drag handle', () => {
    const onClose = vi.fn();
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: 'AI 阅读助手' });
    expect(within(dialog).queryByLabelText('下拉关闭 AI 阅读助手')).toBeNull();
    const closeButton = within(dialog).getByLabelText('关闭 AI 阅读助手');
    expect(closeButton.className).toContain('btn-circle');
    expect(document.activeElement).toBe(closeButton);

    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the answer panel when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'AI 阅读助手' }), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not let answer panel pointer events bubble into the reader', () => {
    const onClose = vi.fn();
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={onClose} />);

    fireEvent.pointerDown(screen.getByRole('dialog', { name: 'AI 阅读助手' }));
    fireEvent.click(screen.getByRole('dialog', { name: 'AI 阅读助手' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps Tab focus inside the answer panel', () => {
    render(<ReaderAIAnswerPanel messages={messages} onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'AI 阅读助手' });
    const input = screen.getByLabelText('继续追问');
    input.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });

    expect(document.activeElement).toBe(
      screen.getByLabelText('防剧透已开启，只根据当前阅读进度回答'),
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
        content: '这是回答 [1]。',
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

  it('renders cited markdown horizontal rules without crashing the answer panel', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-markdown-hr', role: 'user', content: '0-08是什么？', createdAt: 1 },
          {
            id: 'assistant-markdown-hr',
            role: 'assistant',
            content: '0-08是一件重要封印物 [1]\n\n---\n\n它曾经制造过关键事件 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-markdown-hr',
                chapterTitle: '关键章节',
                sectionIndex: 8,
                snippet: '0-08是一件重要封印物，也制造过关键事件。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const conversationHistory = screen.getByRole('region', { name: 'AI 对话历史' });
    expect(conversationHistory.querySelector('hr')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '查看引用 1' })).toHaveLength(2);
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

  it('renders compact numbered references in service-provided order', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source',
            role: 'assistant',
            content: '这是回答 [1]，补充线索 [2]。',
            createdAt: 2,
            sources: [
              {
                id: 'late-source',
                chapterTitle: '第九章 线索',
                sectionIndex: 9,
                pageNumber: 88,
                snippet: '后面的线索。',
                confidence: 'approximate',
              },
              {
                id: 'early-source',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                pageNumber: 38,
                snippet: '灰雾之上的线索再次出现。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const references = screen.getByRole('region', { name: '引用来源' });
    const referenceButtons = within(references).getAllByRole('button');

    expect(referenceButtons[0]?.textContent).toContain('[1]');
    expect(referenceButtons[0]?.textContent).toContain('第九章 线索');
    expect(referenceButtons[0]?.textContent).not.toContain('约略位置');
    expect(referenceButtons[0]?.textContent).not.toContain('第 88 页');
    expect(referenceButtons[0]?.textContent).not.toContain('后面的线索');
    expect(referenceButtons[1]?.textContent).toContain('[2]');
    expect(referenceButtons[1]?.textContent).toContain('第五章 线索');
  });

  it('does not show retrieved source candidates before the assistant cites them', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          {
            id: 'user-candidate-source',
            role: 'user',
            content: '塔罗会现在有哪些成员？',
            createdAt: 1,
          },
          {
            id: 'assistant-candidate-source',
            role: 'assistant',
            content: '正在组织回答。',
            createdAt: 2,
            sources: [
              {
                id: 'candidate-source',
                chapterTitle: '候选章节',
                sectionIndex: 269,
                snippet: '这只是检索候选内容。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('region', { name: '引用来源' })).toBeNull();
    expect(screen.queryByText('候选章节')).toBeNull();
  });

  it('only shows source rows that are cited in the assistant answer', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          {
            id: 'user-current-source',
            role: 'user',
            content: '塔罗会现在有哪些成员？',
            createdAt: 1,
          },
          {
            id: 'assistant-current-source',
            role: 'assistant',
            content: '“世界”在当前聚会首次亮相 [1]。克莱恩的早期经历来自更早章节 [3]。',
            createdAt: 2,
            sources: [
              {
                id: 'current-world-source',
                chapterTitle: '第五十一章 五人聚会',
                sectionIndex: 269,
                snippet: '新成员“世界”正式亮相。',
                confidence: 'approximate',
              },
              {
                id: 'unused-source',
                chapterTitle: '未被引用章节',
                sectionIndex: 20,
                snippet: '这条检索结果没有被回答实际引用。',
                confidence: 'approximate',
              },
              {
                id: 'old-source',
                chapterTitle: '第十四章 通灵者',
                sectionIndex: 14,
                snippet: '克莱恩早期经历。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const references = screen.getByRole('region', { name: '引用来源' });
    const referenceButtons = within(references).getAllByRole('button');

    expect(referenceButtons).toHaveLength(2);
    expect(referenceButtons[0]?.textContent).toContain('[1]');
    expect(referenceButtons[0]?.textContent).toContain('第五十一章 五人聚会');
    expect(referenceButtons[1]?.textContent).toContain('[2]');
    expect(referenceButtons[1]?.textContent).toContain('第十四章 通灵者');
    expect(references.textContent).not.toContain('未被引用章节');
  });

  it('keeps citation numbers aligned with same-position source order', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-tie', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-tie',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'z-service-first',
                chapterTitle: '同页第一条',
                sectionIndex: 3,
                sortIndex: 300,
                cfi: 'epubcfi(/6/2)',
                snippet: '服务排序中的第一条。',
                contextText: '前文。\n服务排序中的第一条。\n后文。',
                confidence: 'approximate',
              },
              {
                id: 'a-service-second',
                chapterTitle: '同页第二条',
                sectionIndex: 3,
                sortIndex: 300,
                cfi: 'epubcfi(/6/4)',
                snippet: '服务排序中的第二条。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看引用 1' }));

    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    expect(within(preview).getByText('同页第一条')).toBeTruthy();
    expect(within(preview).getByText('服务排序中的第一条。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '跳转查看原文' })).toBeNull();
  });

  it('renumbers cited sources compactly in the order they appear in the answer', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-renumbered-source', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-renumbered-source',
            role: 'assistant',
            content: '第一条依据 [3]，第二条依据 [6]。',
            createdAt: 2,
            sources: Array.from({ length: 6 }, (_, index) => ({
              id: `source-${index + 1}`,
              chapterTitle: `章节 ${index + 1}`,
              sectionIndex: index,
              snippet: `片段 ${index + 1}`,
              confidence: 'approximate' as const,
            })),
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '查看引用 3' })).toBeNull();
    expect(screen.queryByRole('button', { name: '查看引用 6' })).toBeNull();
    const firstInlineCitation = screen.getByRole('button', { name: '查看引用 1' });
    const secondInlineCitation = screen.getByRole('button', { name: '查看引用 2' });
    expect(firstInlineCitation).toBeTruthy();
    expect(secondInlineCitation).toBeTruthy();
    expect(firstInlineCitation.className).toContain('min-h-8');
    expect(firstInlineCitation.className).toContain('min-w-8');

    const references = screen.getByRole('region', { name: '引用来源' });
    const referenceButtons = within(references).getAllByRole('button');
    expect(referenceButtons).toHaveLength(2);
    expect(referenceButtons[0]?.textContent).toContain('[1]');
    expect(referenceButtons[0]?.textContent).toContain('章节 3');
    expect(referenceButtons[1]?.textContent).toContain('[2]');
    expect(referenceButtons[1]?.textContent).toContain('章节 6');
  });

  it('renders consecutive citations from one source preview as a single reference row', () => {
    const previewText = '第一段引用。第二段引用。第三段引用。';
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-grouped-source', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-grouped-source',
            role: 'assistant',
            content: '这三点来自同一段连续原文 [1][2][3]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-grouped-1',
                chapterTitle: '同一章节',
                sectionIndex: 5,
                previewText,
                snippet: '第一段引用。',
                highlightSpans: [{ start: 0, end: 5, quote: '第一段引用', source: 'chunk' }],
                confidence: 'approximate',
              },
              {
                id: 'source-grouped-2',
                chapterTitle: '同一章节',
                sectionIndex: 5,
                previewText,
                snippet: '第二段引用。',
                highlightSpans: [{ start: 6, end: 11, quote: '第二段引用', source: 'chunk' }],
                confidence: 'approximate',
              },
              {
                id: 'source-grouped-3',
                chapterTitle: '同一章节',
                sectionIndex: 5,
                previewText,
                snippet: '第三段引用。',
                highlightSpans: [{ start: 12, end: 17, quote: '第三段引用', source: 'chunk' }],
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const references = screen.getByRole('region', { name: '引用来源' });
    expect(within(references).getAllByRole('button')).toHaveLength(1);
    expect(within(references).getByRole('button').textContent).toContain('[1]');
    expect(within(references).getByRole('button').textContent).toContain('同一章节');

    fireEvent.click(screen.getByRole('button', { name: '查看引用 1' }));
    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    expect(within(preview).getByText('第一段引用')).toBeTruthy();
    expect(within(preview).getByText('第二段引用')).toBeTruthy();
    expect(within(preview).getByText('第三段引用')).toBeTruthy();
  });

  it('groups adjacent citation markers from overlapping same-section previews', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-overlap-source', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-overlap-source',
            role: 'assistant',
            content: '这两条证据来自同一段连续原文 [1][2]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-overlap-1',
                chapterTitle: '同一章节',
                sectionIndex: 5,
                startOffset: 0,
                endOffset: 12,
                previewStartOffset: 0,
                previewText: '第一句引用。第二句引用。',
                snippet: '第一句引用。',
                highlightSpans: [{ start: 0, end: 6, quote: '第一句引用。', source: 'chunk' }],
                confidence: 'approximate',
              },
              {
                id: 'source-overlap-2',
                chapterTitle: '同一章节',
                sectionIndex: 5,
                startOffset: 6,
                endOffset: 18,
                previewStartOffset: 6,
                previewText: '第二句引用。第三句引用。',
                snippet: '第三句引用。',
                highlightSpans: [{ start: 6, end: 12, quote: '第三句引用。', source: 'chunk' }],
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: '查看引用 1' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '查看引用 2' })).toBeNull();
    const references = screen.getByRole('region', { name: '引用来源' });
    expect(within(references).getAllByRole('button')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '查看引用 1' }));
    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    expect(within(preview).getByText(/第一句引用。/)).toBeTruthy();
    expect(within(preview).getByText(/第二句引用。/)).toBeTruthy();
    expect(within(preview).getByText(/第三句引用。/)).toBeTruthy();
    const highlights = preview.querySelectorAll('[data-testid="reader-ai-source-highlight"]');
    expect([...highlights].map((highlight) => highlight.textContent).join('')).toBe(
      '第一句引用。第三句引用。',
    );
  });

  it('does not group overlapping source previews when the overlap text does not match', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-mismatch-source', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-mismatch-source',
            role: 'assistant',
            content: '这两条证据来自不同原文片段 [1][2]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-mismatch-1',
                chapterTitle: '同一章节',
                sectionIndex: 5,
                previewStartOffset: 0,
                previewText: '第一句引用。第二句引用。',
                snippet: '第一句引用。',
                confidence: 'approximate',
              },
              {
                id: 'source-mismatch-2',
                chapterTitle: '同一章节',
                sectionIndex: 5,
                previewStartOffset: 6,
                previewText: '错位的文字。第三句引用。',
                snippet: '第三句引用。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '查看引用 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看引用 2' })).toBeTruthy();
    const references = screen.getByRole('region', { name: '引用来源' });
    expect(within(references).getAllByRole('button')).toHaveLength(2);
  });

  it('renders span-level source highlights from highlightSpans', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-span', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-span',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-span',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                snippet: '旧片段不应决定高亮',
                previewText: '克莱恩抬头看向灰雾之上的线索再次出现。',
                highlightSpans: [
                  { start: 7, end: 18, quote: '灰雾之上的线索再次出现', source: 'chunk' },
                ],
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));

    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    const highlightedSpan = within(preview).getByText('灰雾之上的线索再次出现');
    expect(highlightedSpan.className).toContain('bg-warning/25');
    expect(preview.textContent).toContain('克莱恩抬头看向灰雾之上的线索再次出现。');
  });

  it('does not highlight an entire long chunk when a tighter sentence is available', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-tight', role: 'user', content: '解释能力', createdAt: 1 },
          {
            id: 'assistant-source-tight',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-tight',
                chapterTitle: '第六十五章 非凡者资料',
                sectionIndex: 65,
                previewText:
                  '前文铺垫。序列8的“读心者”是“观众”的全面提升，他的观察不再仅限于表面细节，而是深入到气场、以太体等神秘领域。后文继续。',
                snippet:
                  '序列8的“读心者”是“观众”的全面提升，他的观察不再仅限于表面细节，而是深入到气场、以太体等神秘领域。',
                highlightSpans: [
                  {
                    start: 5,
                    end: 55,
                    quote:
                      '序列8的“读心者”是“观众”的全面提升，他的观察不再仅限于表面细节，而是深入到气场、以太体等神秘领域',
                    source: 'chunk',
                  },
                ],
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));

    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    const highlights = preview.querySelectorAll('[data-testid="reader-ai-source-highlight"]');
    expect([...highlights].map((highlight) => highlight.textContent).join('')).toBe(
      '序列8的“读心者”是“观众”的全面提升，他的观察不再仅限于表面细节，而是深入到气场、以太体等神秘领域',
    );
    expect([...highlights].map((highlight) => highlight.textContent).join('')).not.toContain(
      '前文铺垫',
    );
    expect([...highlights].map((highlight) => highlight.textContent).join('')).not.toContain(
      '后文继续',
    );
  });

  it('does not expose provisional citation previews while the current answer is still being verified', () => {
    const previewText =
      'Letter 1\n\nTo Mrs. Saville, England.\n\nI feel a cold northern breeze play upon my cheeks, which braces my nerves and fills me with delight.';
    render(
      <ReaderAIAnswerPanel
        messages={[
          {
            id: 'user-source-pending',
            role: 'user',
            content: '这段寒风带来了什么感受？',
            createdAt: 1,
          },
          {
            id: 'assistant-source-pending',
            role: 'assistant',
            content: '北方寒风让叙述者振奋，并充满喜悦。[1]',
            createdAt: 2,
            sources: [
              {
                id: 'source-pending',
                chapterTitle: 'Letter 1',
                sectionIndex: 1,
                previewText,
                snippet: previewText.slice(0, 120),
                highlightSpans: [
                  { start: 0, end: previewText.length, quote: previewText, source: 'chunk' },
                ],
                confidence: 'approximate',
              },
            ],
          },
        ]}
        loading
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '查看引用 1' })).toBeNull();
    expect(screen.queryByRole('region', { name: '引用来源' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: '原文上下文预览' })).toBeNull();
  });

  it('does not highlight whitespace between highlight spans', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-gap', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-gap',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-gap',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                previewText: '第一句引用。\n\n第二句引用。',
                snippet: '第一句引用。第二句引用。',
                highlightSpans: [
                  { start: 0, end: 13, quote: '第一句引用。\n\n第二句引用', source: 'chunk' },
                ],
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));

    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    const highlights = preview.querySelectorAll('[data-testid="reader-ai-source-highlight"]');
    const highlightedText = [...highlights].map((highlight) => highlight.textContent).join('|');
    expect(highlights).toHaveLength(2);
    expect(highlightedText).toBe('第一句引用。|第二句引用');
    expect(highlights[0]?.textContent).not.toContain('\n');
    expect(highlights[1]?.textContent).not.toContain('\n');
    expect([...highlights].every((highlight) => !highlight.className.includes('py-1'))).toBe(true);
    expect(
      preview.querySelectorAll('[data-testid="reader-ai-source-highlight-space"]'),
    ).toHaveLength(0);
  });

  it('scrolls the first span-level source highlight into view when opening preview', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });

    try {
      render(
        <ReaderAIAnswerPanel
          messages={[
            { id: 'user-source-scroll', role: 'user', content: '解释这段', createdAt: 1 },
            {
              id: 'assistant-source-scroll',
              role: 'assistant',
              content: '这是回答 [1]。',
              createdAt: 2,
              sources: [
                {
                  id: 'source-scroll',
                  chapterTitle: '第五章 线索',
                  sectionIndex: 5,
                  previewText: '开头。需要定位的引用。结尾。',
                  snippet: '需要定位的引用',
                  highlightSpans: [{ start: 3, end: 10, quote: '需要定位的引用', source: 'chunk' }],
                  confidence: 'approximate',
                },
              ],
            },
          ]}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        value: originalScrollIntoView,
        configurable: true,
      });
    }
  });

  it('scrolls the start anchor of a long source highlight instead of centering the whole highlight', () => {
    const scrolledElements: HTMLElement[] = [];
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: vi.fn(function (this: HTMLElement) {
        scrolledElements.push(this);
      }),
      configurable: true,
    });

    try {
      const quote = '这是一个很长很长的引用内容，用来模拟真实章节预览里跨越多行的大段高亮。'.repeat(
        8,
      );
      render(
        <ReaderAIAnswerPanel
          messages={[
            { id: 'user-source-anchor', role: 'user', content: '解释这段', createdAt: 1 },
            {
              id: 'assistant-source-anchor',
              role: 'assistant',
              content: '这是回答 [1]。',
              createdAt: 2,
              sources: [
                {
                  id: 'source-anchor',
                  chapterTitle: '第五章 线索',
                  sectionIndex: 5,
                  previewText: `开头。${quote}结尾。`,
                  snippet: quote,
                  highlightSpans: [{ start: 3, end: 3 + quote.length, quote, source: 'chunk' }],
                  confidence: 'approximate',
                },
              ],
            },
          ]}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));

      const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
      const highlight = within(preview).getByTestId('reader-ai-source-highlight');
      const scrolledElement = scrolledElements[0];
      expect(scrolledElement).toBeTruthy();
      expect(scrolledElement).not.toBe(highlight);
      expect(scrolledElement?.getAttribute('data-testid')).toBe('reader-ai-source-highlight-start');
      expect(scrolledElement?.nextSibling).toBe(highlight);
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        value: originalScrollIntoView,
        configurable: true,
      });
    }
  });

  it('scrolls the first paragraph-level source highlight into view when highlight spans are unavailable', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoView,
      configurable: true,
    });

    try {
      render(
        <ReaderAIAnswerPanel
          messages={[
            { id: 'user-source-paragraph-scroll', role: 'user', content: '解释这段', createdAt: 1 },
            {
              id: 'assistant-source-paragraph-scroll',
              role: 'assistant',
              content: '这是回答 [1]。',
              createdAt: 2,
              sources: [
                {
                  id: 'source-paragraph-scroll',
                  chapterTitle: '第五章 线索',
                  sectionIndex: 5,
                  snippet: '需要定位的段落。',
                  contextText: '开头段落。\n需要定位的段落。\n结尾段落。',
                  confidence: 'approximate',
                },
              ],
            },
          ]}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        value: originalScrollIntoView,
        configurable: true,
      });
    }
  });

  it('opens a source context reading preview without delegating source navigation', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-peek', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-peek',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-peek',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                cfi: 'epubcfi(/6/2)',
                snippet: '灰雾之上的线索再次出现。',
                contextText: '克莱恩抬头看向灰雾。\n灰雾之上的线索再次出现。\n他暂时记下这个现象。',
                atSpoilerBoundary: true,
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));

    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    expect(within(preview).getByText('第五章 线索')).toBeTruthy();
    expect(within(preview).getByText('克莱恩抬头看向灰雾。')).toBeTruthy();
    const citedParagraph = within(preview).getByText('灰雾之上的线索再次出现。');
    expect(citedParagraph.className).toContain('bg-warning/25');
    expect(citedParagraph.className).not.toContain('underline');
    expect(within(preview).getByText('已到达你的当前阅读进度')).toBeTruthy();
    expect(within(preview).getByText('预览已限制在当前阅读进度内。')).toBeTruthy();
  });

  it('highlights source preview paragraphs when the source snippet spans line breaks', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-highlight', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-highlight',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-highlight',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                snippet: '第一段末尾。\n第二段开头',
                contextText: '第一段末尾。\n第二段开头继续。\n第三段没有引用。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));

    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    expect(within(preview).getByText('第一段末尾。').className).toContain('bg-warning/25');
    expect(within(preview).getByText('第二段开头继续。').className).toContain('bg-warning/25');
    expect(within(preview).getByText('第三段没有引用。').className).not.toContain('bg-warning/25');
  });

  it('uses the shared Dialog bottom-sheet shell for the source preview', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-sheet', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-sheet',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-sheet',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                snippet: '灰雾之上的线索再次出现。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const sourceButton = screen.getByRole('button', { name: /查看引用 1：/ });
    fireEvent.click(sourceButton);

    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    expect(preview.className).toContain('modal');
    expect(preview.querySelector('.dialog-overlay')).toBeTruthy();
    expect(preview.querySelector('.modal-box')).toBeTruthy();
    expect(preview.querySelector('.drag-handle')).toBeTruthy();
    expect(preview.getAttribute('aria-modal')).toBe('true');
    expect(within(preview).getByRole('region', { name: '原文上下文内容' })).toBeTruthy();
    expect(within(preview).queryByRole('button', { name: '关闭原文上下文预览' })).toBeNull();
    const handle = within(preview).getByRole('button', { name: '下拉关闭原文上下文预览' });
    expect(handle.className).toContain('touch-none');
    expect(document.activeElement).toBe(handle);

    fireEvent.click(handle);

    expect(screen.queryByRole('dialog', { name: '原文上下文预览' })).toBeNull();
    expect(document.activeElement).toBe(sourceButton);
  });

  it('moves focus into the source preview and restores focus when it closes', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-focus', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-focus',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-focus',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                snippet: '灰雾之上的线索再次出现。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const sourceButton = screen.getByRole('button', { name: /查看引用 1：/ });
    fireEvent.click(sourceButton);

    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    const previewCloseButton = within(preview).getByRole('button', {
      name: '下拉关闭原文上下文预览',
    });
    expect(document.activeElement).toBe(previewCloseButton);

    fireEvent.click(previewCloseButton);

    expect(screen.queryByRole('dialog', { name: '原文上下文预览' })).toBeNull();
    expect(document.activeElement).toBe(sourceButton);
  });

  it('keeps Tab focus inside the source preview while it is open', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-tab', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-tab',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-tab',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                snippet: '灰雾之上的线索再次出现。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));
    const preview = screen.getByRole('dialog', { name: '原文上下文预览' });
    const previewCloseButton = within(preview).getByRole('button', {
      name: '下拉关闭原文上下文预览',
    });
    const previewBody = within(preview).getByRole('region', { name: '原文上下文内容' });
    const answerPanelCloseButton = screen.getByRole('button', { name: '关闭 AI 阅读助手' });

    answerPanelCloseButton.focus();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'AI 阅读助手' }), { key: 'Tab' });
    expect(document.activeElement).toBe(previewCloseButton);

    previewBody.focus();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'AI 阅读助手' }), { key: 'Tab' });
    expect(document.activeElement).toBe(previewCloseButton);

    previewCloseButton.focus();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'AI 阅读助手' }), {
      key: 'Tab',
      shiftKey: true,
    });
    expect(document.activeElement).toBe(previewBody);
    expect(document.activeElement).not.toBe(answerPanelCloseButton);
  });

  it('closes the source preview before closing the answer panel on Escape', () => {
    const onClose = vi.fn();
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-source-escape', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-source-escape',
            role: 'assistant',
            content: '这是回答 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-escape',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                snippet: '灰雾之上的线索再次出现。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /查看引用 1：/ }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'AI 阅读助手' }), { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: '原文上下文预览' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('turns inline citation marks into source peek buttons', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-citation', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-citation',
            role: 'assistant',
            content: '这条线索很关键 [1]，但还不能剧透后文。',
            createdAt: 2,
            sources: [
              {
                id: 'source-citation',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                snippet: '灰雾之上的线索再次出现。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看引用 1' }));

    expect(screen.getByRole('dialog', { name: '原文上下文预览' })).toBeTruthy();
  });

  it('renders cited assistant markdown line breaks without crashing', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-citation-break', role: 'user', content: '总结这章', createdAt: 1 },
          {
            id: 'assistant-citation-break',
            role: 'assistant',
            content: '第一行回答。\n第二行带引用 [1]。',
            createdAt: 2,
            sources: [
              {
                id: 'source-citation-break',
                chapterTitle: '第五十一章 五人聚会',
                sectionIndex: 210,
                snippet: '塔罗会加入了新成员。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/第一行回答/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看引用 1' })).toBeTruthy();
  });

  it('does not turn citation-like text inside code into source buttons', () => {
    render(
      <ReaderAIAnswerPanel
        messages={[
          { id: 'user-code-citation', role: 'user', content: '解释这段', createdAt: 1 },
          {
            id: 'assistant-code-citation',
            role: 'assistant',
            content: '普通引用 [1]\n\n`array[1]`',
            createdAt: 2,
            sources: [
              {
                id: 'source-code-citation',
                chapterTitle: '第五章 线索',
                sectionIndex: 5,
                snippet: '灰雾之上的线索再次出现。',
                confidence: 'approximate',
              },
            ],
          },
        ]}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button', { name: '查看引用 1' })).toHaveLength(1);
    expect(screen.getByText('array[1]').tagName).toBe('CODE');
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

  it('fills an ask box suggestion on pointer up without submitting or closing the panel', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<ReaderAIAskBox source='control' onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.pointerUp(screen.getByLabelText('使用建议问题：前面发生了什么？'));

    expect((screen.getByLabelText('输入你的问题') as HTMLTextAreaElement).value).toBe(
      '前面发生了什么？',
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not let inner ask box pointer events bubble to the backdrop', () => {
    const onClose = vi.fn();
    render(<ReaderAIAskBox source='control' onSubmit={vi.fn()} onClose={onClose} />);

    fireEvent.pointerDown(screen.getByRole('dialog', { name: '问问这本书' }));
    fireEvent.click(screen.getByRole('dialog', { name: '问问这本书' }));

    expect(onClose).not.toHaveBeenCalled();
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
