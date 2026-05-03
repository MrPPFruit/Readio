import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Thread } from '@/components/assistant/Thread';

const assistantState = vi.hoisted(() => ({
  messages: [] as { role: 'user' | 'assistant' }[],
  isRunning: false,
  isComposerEmpty: true,
}));

vi.mock('@assistant-ui/react', () => ({
  ActionBarPrimitive: {
    Root: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
    Reload: ({ children, ...props }: { children?: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
    Copy: ({ children, ...props }: { children?: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
  },
  AssistantIf: ({
    children,
    condition,
  }: {
    children?: ReactNode;
    condition: (state: never) => boolean;
  }) => {
    const state = {
      thread: {
        isEmpty: assistantState.messages.length === 0,
        isRunning: assistantState.isRunning,
      },
      message: { status: { type: 'complete' }, isCopied: false },
    };
    return condition(state as never) ? <>{children}</> : null;
  },
  BranchPickerPrimitive: {
    Root: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
    Previous: ({ children, ...props }: { children?: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
    Next: ({ children, ...props }: { children?: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
    Number: () => <span>1</span>,
    Count: () => <span>1</span>,
  },
  ComposerPrimitive: {
    Root: ({ children, ...props }: { children?: ReactNode }) => <form {...props}>{children}</form>,
    Input: (props: Record<string, unknown>) => (
      <textarea aria-label='Ask about this book' {...props} />
    ),
    Send: ({ children, ...props }: { children?: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
    Cancel: ({ children, ...props }: { children?: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
  },
  MessagePrimitive: {
    Root: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
    Parts: () => <span>message</span>,
  },
  ThreadPrimitive: {
    Root: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
    Empty: ({ children }: { children?: ReactNode }) =>
      assistantState.messages.length === 0 ? <>{children}</> : null,
    Viewport: ({ children, ...props }: { children?: ReactNode }) => (
      <div {...props}>{children}</div>
    ),
    Messages: () => <div>messages</div>,
    ScrollToBottom: ({ children, ...props }: { children?: ReactNode }) => (
      <button {...props}>{children}</button>
    ),
  },
  useAssistantState: (selector: (state: never) => unknown) =>
    selector({
      composer: { isEmpty: assistantState.isComposerEmpty },
      thread: { isRunning: assistantState.isRunning },
    } as never),
  useThread: (selector: (state: never) => unknown) =>
    selector({ messages: assistantState.messages, isRunning: assistantState.isRunning } as never),
  useThreadViewport: (selector: (state: never) => unknown) =>
    selector({ isAtBottom: true } as never),
}));

vi.mock('@/components/assistant/MarkdownText', () => ({
  MarkdownText: () => <span>markdown</span>,
}));

beforeEach(() => {
  assistantState.messages = [];
  assistantState.isRunning = false;
  assistantState.isComposerEmpty = true;
});

afterEach(cleanup);

describe('Thread', () => {
  it('renders a useful empty active conversation state with composer', () => {
    render(<Thread hasActiveConversation isLoadingHistory={false} />);

    expect(screen.getByText('这个对话还没有内容')).toBeTruthy();
    expect(screen.getByLabelText('Ask about this book')).toBeTruthy();
  });

  it('renders a history load error instead of a blank active conversation', () => {
    render(
      <Thread
        hasActiveConversation
        isLoadingHistory={false}
        historyError='Unable to load conversation history'
      />,
    );

    expect(screen.getByText('Unable to load conversation history')).toBeTruthy();
  });
});
