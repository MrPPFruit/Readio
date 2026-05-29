import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LibraryHeader from '@/app/library/components/LibraryHeader';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: {
      isMobile: true,
      hasSafeAreaInset: false,
      hasTrafficLight: false,
      hasWindowBar: false,
    },
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    systemUIVisible: true,
    statusBarHeight: 0,
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  }),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({
    currentBookshelf: [],
  }),
}));

vi.mock('@/hooks/useTrafficLight', () => ({
  useTrafficLight: () => ({ isTrafficLightVisible: false }),
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/hooks/useShortcuts', () => ({
  default: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/config/features', () => ({
  readioFeatures: {
    opds: false,
  },
}));

vi.mock('@/components/WindowButtons', () => ({
  default: () => null,
}));

vi.mock('@/app/library/components/ViewMenu', () => ({
  default: () => <div />,
}));

vi.mock('@/app/library/components/SettingsMenu', () => ({
  default: () => <div />,
}));

afterEach(cleanup);

describe('LibraryHeader', () => {
  it('keeps the top import action outside the absolute search-field overlay', () => {
    render(
      <LibraryHeader
        isSelectMode={false}
        isSelectAll={false}
        onPullLibrary={vi.fn()}
        onImportBooksFromFiles={vi.fn()}
        onOpenCatalogManager={vi.fn()}
        onToggleSelectMode={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    );

    const importButton = screen.getByRole('button', { name: 'Import Books' });

    expect(importButton.closest('.absolute')).toBeNull();
  });

  it('keeps global book search out of the local library search header', () => {
    render(
      <LibraryHeader
        isSelectMode={false}
        isSelectAll={false}
        onPullLibrary={vi.fn()}
        onImportBooksFromFiles={vi.fn()}
        onOpenCatalogManager={vi.fn()}
        onToggleSelectMode={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '全网搜书' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Import Books' })).toBeTruthy();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('uses compact mobile spacing so the library search field has room before right actions', () => {
    render(
      <LibraryHeader
        isSelectMode={false}
        isSelectAll={false}
        onPullLibrary={vi.fn()}
        onImportBooksFromFiles={vi.fn()}
        onOpenCatalogManager={vi.fn()}
        onToggleSelectMode={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox');
    const searchShell = input.closest('.exclude-title-bar-mousedown');
    const headerRow = searchShell?.parentElement;
    const embeddedActions = screen
      .getByRole('button', { name: 'Import Books' })
      .closest('.shrink-0');
    const rightActions = screen.getByRole('button', { name: 'View Menu' }).closest('.gap-x-1');

    expect(headerRow?.className).toContain('gap-2');
    expect(headerRow?.className).not.toContain('space-x-6');
    expect(searchShell?.className).toContain('flex-1');
    expect(searchShell?.className).toContain('min-w-0');
    expect(searchShell?.className).toContain('pl-2');
    expect(embeddedActions?.className).toContain('space-x-1');
    expect(embeddedActions?.className).not.toContain('space-x-2');
    expect(rightActions?.className).toContain('gap-x-1');
    expect(rightActions?.className).not.toContain('gap-x-2');
  });
});
