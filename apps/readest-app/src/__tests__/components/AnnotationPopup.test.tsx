import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AnnotationPopup from '@/app/reader/components/annotator/AnnotationPopup';
import { EnvProvider } from '@/context/EnvContext';

vi.mock('@/services/environment', async () => {
  const actual = await vi.importActual('@/services/environment');

  return {
    ...actual,
    default: {
      getAppService: vi.fn().mockResolvedValue({ init: vi.fn().mockResolvedValue(undefined) }),
    },
  };
});

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const Icon = () => <span aria-hidden='true'>I</span>;

afterEach(() => cleanup());

describe('AnnotationPopup', () => {
  it('uses compact spacing for selection action buttons', () => {
    render(
      <EnvProvider>
        <AnnotationPopup
          bookKey='book-1'
          dir='ltr'
          isVertical={false}
          buttons={[
            { tooltipText: 'Copy', labelText: 'Copy', Icon, onClick: vi.fn() },
            { tooltipText: 'Highlight', labelText: 'Highlight', Icon, onClick: vi.fn() },
            { tooltipText: 'Note', labelText: 'Note', Icon, onClick: vi.fn() },
            { tooltipText: 'Ask AI', labelText: 'Ask AI', Icon, onClick: vi.fn() },
          ]}
          notes={[]}
          position={{ point: { x: 20, y: 20 }, dir: 'down' }}
          trianglePosition={{ point: { x: 30, y: 30 }, dir: 'down' }}
          highlightOptionsVisible={false}
          selectedStyle='underline'
          selectedColor='yellow'
          popupWidth={120}
          popupHeight={48}
          onHighlight={vi.fn()}
          onDismiss={vi.fn()}
        />
      </EnvProvider>,
    );

    const copyButton = screen.getByRole('button', { name: 'Copy' });
    const buttons = copyButton.closest('.selection-buttons');
    const classNames = buttons?.className.split(/\s+/) ?? [];
    const buttonClassNames = copyButton.className.split(/\s+/);
    expect(classNames).toContain('gap-0.5');
    expect(classNames).toContain('p-0');
    expect(classNames).not.toContain('gap-1');
    expect(classNames).not.toContain('gap-2');
    expect(classNames).not.toContain('p-0.5');
    expect(classNames).not.toContain('p-1.5');
    expect(classNames).not.toContain('p-2');
    expect(buttonClassNames).toContain('min-h-9');
    expect(buttonClassNames).toContain('min-w-9');
    expect(buttonClassNames).not.toContain('min-h-10');
    expect(buttonClassNames).not.toContain('min-w-10');

    const popup = buttons?.closest('.selection-popup') as HTMLElement | null;
    expect(popup?.style.width).toBe('120px');
  });
});
