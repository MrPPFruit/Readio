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
});
