import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AnnotationToolButton from '@/app/reader/components/annotator/AnnotationToolButton';
import {
  annotationToolButtons,
  annotationToolQuickActions,
} from '@/app/reader/components/annotator/AnnotationTools';
import BookMenu from '@/app/reader/components/sidebar/BookMenu';
import HeaderBar from '@/app/reader/components/HeaderBar';
import { ColorPanel } from '@/app/reader/components/footerbar/ColorPanel';
import { FontLayoutPanel } from '@/app/reader/components/footerbar/FontLayoutPanel';

const readioFeaturesMock = vi.hoisted(() => ({
  readioFeatures: {
    auth: false,
    cloudSync: false,
    commerce: false,
    ai: false,
    opds: false,
    tts: false,
    annotations: false,
    notebook: false,
    proofreading: false,
    translation: false,
    parallelRead: false,
    speedReading: false,
    updater: false,
    telemetry: false,
    advancedSettings: false,
    localLibrary: true,
    localImport: true,
    reader: true,
    progress: true,
    basicReaderSettings: true,
    readerAI: true,
  },
}));

const { saveViewSettingsMock } = vi.hoisted(() => ({
  saveViewSettingsMock: vi.fn(),
}));

const settingsMock = vi.hoisted(() => ({
  settings: {
    discordRichPresenceEnabled: false,
    kosync: { enabled: true },
    readwise: { enabled: true },
    hardcover: { enabled: true },
    screenBrightness: 50,
    globalReadSettings: {
      highlightStyle: 'yellow',
      highlightStyles: {
        yellow: '#ffff00',
      },
    },
  },
  setSettingsDialogOpen: vi.fn(),
  setSettingsDialogBookKey: vi.fn(),
}));

const readerStoreMock = vi.hoisted(() => ({
  bookKeys: ['book-1', 'book-2'],
  hoveredBookKey: 'book-1',
  getViewSettings: vi.fn(() => ({
    sortedTOC: false,
    enableAnnotationQuickActions: true,
    annotationQuickAction: 'highlight',
    zoomLevel: 100,
    zoomMode: 'fit-page',
    spreadMode: 'none',
    keepCoverSpread: false,
    invertImgColorInDark: false,
    applyThemeToPDF: false,
    scrolled: false,
    paragraphMode: { enabled: false },
    defaultFontSize: 16,
    marginTopPx: 44,
    marginBottomPx: 22,
    marginLeftPx: 22,
    marginRightPx: 22,
    gapPercent: 5,
    lineHeight: 1.6,
  })),
  getView: vi.fn(() => ({
    renderer: {
      getContents: () => [],
      setAttribute: vi.fn(),
    },
  })),
  recreateViewer: vi.fn(),
  setHoveredBookKey: vi.fn(),
  setViewSettings: vi.fn(),
  setPaginationRecalculating: vi.fn(),
  getViewState: vi.fn(() => ({ syncing: false })),
  getProgress: vi.fn(() => null),
}));

const bookDataStoreMock = vi.hoisted(() => ({
  getConfig: vi.fn(() => ({ hardcoverSyncEnabled: true })),
  setConfig: vi.fn(),
  saveConfig: vi.fn(),
  getBookData: vi.fn(() => ({
    isFixedLayout: false,
    book: { format: 'EPUB' },
    bookDoc: { rendition: { layout: 'reflowable' }, sections: [], dir: 'ltr' },
  })),
}));

vi.mock('@/config/features', () => readioFeaturesMock);

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({}),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      isMobile: true,
      isMobileApp: true,
      isAndroidApp: true,
      isDesktopApp: false,
      hasWindow: false,
      hasWindowBar: false,
      hasTrafficLight: false,
      hasSafeAreaInset: false,
      hasRoundedWindow: false,
      supportsCanvasContext2DFilter: false,
    },
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => settingsMock,
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => readerStoreMock,
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({
    getVisibleLibrary: () => [
      {
        hash: 'book-2',
        format: 'EPUB',
        title: 'Parallel Book',
        downloadedAt: 1,
        coverImageUrl: '',
      },
    ],
  }),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    sideBarBookKey: 'book-1',
    isSideBarVisible: false,
    getIsSideBarVisible: () => false,
  }),
}));

vi.mock('@/store/parallelViewStore', () => ({
  useParallelViewStore: () => ({
    parallelViews: [],
    setParallel: vi.fn(),
    unsetParallel: vi.fn(),
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => bookDataStoreMock,
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    isDarkMode: false,
    systemUIVisible: false,
    statusBarHeight: 0,
    themeMode: 'auto',
    themeColor: 'default',
    setThemeMode: vi.fn(),
    setThemeColor: vi.fn(),
  }),
}));

vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    getScreenBrightness: vi.fn(async () => 0.5),
    setScreenBrightness: vi.fn(),
  }),
}));

vi.mock('@/store/trafficLightStore', () => ({
  useTrafficLightStore: () => ({
    trafficLightInFullscreen: false,
    setTrafficLightVisibility: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTrafficLight', () => ({
  useTrafficLight: () => ({ isTrafficLightVisible: false }),
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/app/reader/hooks/useSpatialNavigation', () => ({
  useSpatialNavigation: vi.fn(),
}));

vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({ openParallelView: vi.fn() }),
}));

vi.mock('@/hooks/useKeyDownActions', () => ({
  useKeyDownActions: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  isWebAppPlatform: () => false,
}));

vi.mock('@/services/constants', () => ({
  DOWNLOAD_READEST_URL: '',
  MAX_ZOOM_LEVEL: 300,
  MIN_ZOOM_LEVEL: 50,
  ZOOM_STEP: 10,
}));

vi.mock('@/utils/nav', () => ({
  navigateToLogin: vi.fn(),
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: vi.fn(),
    onSync: vi.fn(),
    offSync: vi.fn(),
  },
}));

vi.mock('@/utils/book', () => ({
  formatLocaleDateTime: () => '',
}));

vi.mock('@/utils/config', () => ({
  getMaxInlineSize: () => 640,
}));

vi.mock('@/utils/style', () => ({
  getStyles: () => ({}),
}));

vi.mock('@/utils/window', () => ({
  tauriHandleToggleFullScreen: vi.fn(),
}));

vi.mock('@/styles/themes', () => ({
  themes: [
    {
      name: 'default',
      label: 'Default',
      colors: {
        light: { 'base-100': '#ffffff', 'base-content': '#111111' },
        dark: { 'base-100': '#111111', 'base-content': '#ffffff' },
      },
    },
  ],
}));

vi.mock('@/components/Slider', () => ({
  default: ({
    label,
    initialValue,
    min = 0,
    max = 100,
    step = 1,
    onChange,
  }: {
    label: string;
    initialValue?: number;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: number) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        type='range'
        min={min}
        max={max}
        step={step}
        defaultValue={initialValue}
        onChange={(event) => onChange?.(Number(event.currentTarget.value))}
      />
    </label>
  ),
}));

vi.mock('@/helpers/settings', () => ({
  saveSysSettings: vi.fn(),
  saveViewSettings: saveViewSettingsMock,
}));

vi.mock('@/app/reader/components/KOSyncSettings', () => ({
  setKOSyncSettingsWindowVisible: vi.fn(),
}));

vi.mock('@/app/reader/components/ReadwiseSettings', () => ({
  setReadwiseSettingsWindowVisible: vi.fn(),
}));

vi.mock('@/app/reader/components/HardcoverSettings', () => ({
  setHardcoverSettingsWindowVisible: vi.fn(),
}));

vi.mock('@/app/reader/components/ProofreadRules', () => ({
  setProofreadRulesVisibility: vi.fn(),
}));

vi.mock('@/components/AboutWindow', () => ({
  setAboutDialogVisible: vi.fn(),
}));

vi.mock('@/components/WindowButtons', () => ({
  default: () => <div data-testid='window-buttons' />,
}));

vi.mock('@/app/reader/components/TranslationToggler', () => ({
  default: () => <button aria-label='Toggle Translation'>Translate</button>,
}));

vi.mock('@/app/reader/components/BookmarkToggler', () => ({
  default: () => <button aria-label='Bookmark'>Bookmark</button>,
}));

vi.mock('@/app/reader/components/NotebookToggler', () => ({
  default: () => <button aria-label='Notebook'>Notebook</button>,
}));

vi.mock('@/app/reader/components/SettingsToggler', () => ({
  default: () => <button aria-label='Font & Layout'>Font & Layout</button>,
}));

vi.mock('@/app/reader/components/SidebarToggler', () => ({
  default: () => <button aria-label='Sidebar'>Sidebar</button>,
}));

vi.mock('@/components/HighlighterIcon', () => ({
  HighlighterIcon: () => <span data-testid='quick-action-brush'>Brush</span>,
}));

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: class ResizeObserver {
    observe() {}
    disconnect() {}
  },
});

Object.defineProperty(window, 'innerWidth', {
  writable: true,
  value: 400,
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('Readio reader simplification', () => {
  it('keeps copy, highlight, annotate, and AI in text-selection tools', () => {
    expect(annotationToolButtons.map((button) => button.type)).toEqual([
      'copy',
      'highlight',
      'annotate',
      'ai',
    ]);
    expect(annotationToolQuickActions.map((button) => button.type)).toEqual(['copy', 'highlight']);
  });

  it('shows text labels under the compact selection tool icons', () => {
    render(
      <AnnotationToolButton
        showTooltip
        tooltipText='Copy'
        labelText='复制'
        Icon={() => <span>Icon</span>}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.getByText('复制')).toBeTruthy();
  });

  it('hides disabled reader sidebar menu items', () => {
    render(<BookMenu />);

    for (const label of [
      'Parallel Read',
      'Enter Parallel Read',
      'Exit Parallel Read',
      'KOReader Sync',
      'Readwise Sync',
      'Hardcover Sync',
      'Proofread',
      'Export Annotations',
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('simplifies the reader header actions', () => {
    render(
      <HeaderBar
        bookKey='book-1'
        bookTitle='Local Book'
        isTopLeft={false}
        isHoveredAnim={false}
        gridInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        screenInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        onCloseBook={vi.fn()}
        onGoToLibrary={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Toggle Translation' })).toBeNull();
    expect(screen.queryByTestId('quick-action-brush')).toBeNull();
    expect(screen.queryByRole('button', { name: 'View Options' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Font & Layout' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Notebook' })).toBeTruthy();
  });

  it('moves theme mode choices into the bottom color panel', () => {
    render(<ColorPanel actionTab='color' bottomOffset='64px' forceMobileLayout />);

    expect(screen.getByText('Theme')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Light Mode/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dark Mode/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Auto Mode/ })).toBeTruthy();
  });

  it('keeps a compact full font settings entry in the bottom font panel', () => {
    render(
      <FontLayoutPanel
        bookKey='book-1'
        actionTab='font'
        bottomOffset='64px'
        marginIconSize={20}
        forceMobileLayout
      />,
    );

    expect(screen.queryByRole('button', { name: /Scrolled Mode/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Paragraph Mode/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /More Settings/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Font & Layout' })).toBeTruthy();
  });

  it('routes font size and line spacing changes through view settings updates', () => {
    render(
      <FontLayoutPanel
        bookKey='book-1'
        actionTab='font'
        bottomOffset='64px'
        marginIconSize={20}
        forceMobileLayout
      />,
    );

    fireEvent.change(screen.getByLabelText('Font Size'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Line Spacing'), { target: { value: '18' } });

    expect(saveViewSettingsMock).toHaveBeenCalledWith({}, 'book-1', 'defaultFontSize', 20);
    expect(saveViewSettingsMock).toHaveBeenCalledWith({}, 'book-1', 'lineHeight', 1.8);
  });

  it('routes page margin changes through pagination-affecting view settings updates', () => {
    render(
      <FontLayoutPanel
        bookKey='book-1'
        actionTab='font'
        bottomOffset='64px'
        marginIconSize={20}
        forceMobileLayout
      />,
    );

    fireEvent.change(screen.getByLabelText('Page Margin'), { target: { value: '60' } });

    expect(saveViewSettingsMock).toHaveBeenCalledWith(
      {},
      'book-1',
      'marginTopPx',
      53,
      false,
      false,
    );
    expect(saveViewSettingsMock).toHaveBeenCalledWith(
      {},
      'book-1',
      'marginBottomPx',
      26.5,
      false,
      false,
    );
    expect(saveViewSettingsMock).toHaveBeenCalledWith(
      {},
      'book-1',
      'marginLeftPx',
      26.5,
      false,
      false,
    );
    expect(saveViewSettingsMock).toHaveBeenCalledWith(
      {},
      'book-1',
      'marginRightPx',
      26.5,
      false,
      false,
    );
    expect(saveViewSettingsMock).toHaveBeenCalledWith({}, 'book-1', 'gapPercent', 6, false, false);
    expect(readerStoreMock.setPaginationRecalculating).not.toHaveBeenCalled();
  });
});
