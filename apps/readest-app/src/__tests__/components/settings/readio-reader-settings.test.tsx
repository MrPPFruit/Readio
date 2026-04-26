import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ControlPanel from '@/components/settings/ControlPanel';
import FontPanel from '@/components/settings/FontPanel';
import LayoutPanel from '@/components/settings/LayoutPanel';

const readioFeaturesMock = vi.hoisted(() => ({
  readioFeatures: {
    advancedSettings: false,
    annotations: false,
    notebook: false,
    proofreading: false,
  },
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/config/features', () => readioFeaturesMock);

vi.mock('@/services/constants', () => ({
  CJK_EXCLUDE_PATTENS: /$^/,
  CJK_FONTS_PATTENS: /.*/,
  CJK_SANS_SERIF_FONTS: ['Noto Sans CJK SC'],
  CJK_SERIF_FONTS: ['Noto Serif CJK SC'],
  IOS_FONTS: [],
  LINUX_FONTS: [],
  MACOS_FONTS: [],
  MONOSPACE_FONTS: ['Mono'],
  NON_FREE_FONTS: [],
  SANS_SERIF_FONTS: ['Sans'],
  SERIF_FONTS: ['Serif'],
  WINDOWS_FONTS: [],
  MIGHT_BE_RTL_LANGS: ['zh'],
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      isAndroidApp: true,
      isMobileApp: true,
      appPlatform: 'android',
      hasOrientationLock: false,
    },
  }),
}));

const customFontStoreMock = vi.hoisted(() => {
  const customFontFamilies: string[] = [];
  return {
    customFontFamilies,
    getFontFamilies: vi.fn(() => customFontFamilies),
  };
});

const settingsStoreMock = vi.hoisted(() => ({
  setFontPanelView: vi.fn(),
}));

const viewSettings = {
  defaultFont: 'Serif',
  defaultFontSize: 18,
  minimumFontSize: 12,
  overrideFont: true,
  defaultCJKFont: 'Noto Serif CJK SC',
  serifFont: 'Serif',
  sansSerifFont: 'Sans',
  monospaceFont: 'Mono',
  fontWeight: 400,
  paragraphMargin: 1,
  lineHeight: 1.6,
  wordSpacing: 0,
  letterSpacing: 0,
  textIndent: 2,
  fullJustification: true,
  hyphenation: false,
  marginTopPx: 24,
  marginBottomPx: 24,
  marginLeftPx: 16,
  marginRightPx: 16,
  compactMarginTopPx: 12,
  compactMarginBottomPx: 12,
  compactMarginLeftPx: 12,
  compactMarginRightPx: 12,
  gapPercent: 8,
  maxColumnCount: 1,
  maxInlineSize: 640,
  maxBlockSize: 960,
  writingMode: 'auto',
  overrideLayout: true,
  useBookLayout: false,
  doubleBorder: false,
  borderColor: 'black',
  showHeader: true,
  showFooter: true,
  showBarsOnScroll: false,
  showMarginsOnScroll: false,
  showRemainingTime: false,
  showRemainingPages: false,
  showProgressInfo: true,
  showCurrentTime: false,
  use24HourClock: true,
  showCurrentBatteryStatus: false,
  showBatteryPercentage: false,
  tapToToggleFooter: false,
  progressStyle: 'fraction',
  screenOrientation: 'auto',
  noContinuousScroll: false,
  scrollingOverlap: 0,
  hideScrollbar: false,
  volumeKeysToFlip: false,
  showPaginationButtons: false,
  disableClick: false,
  fullscreenClickArea: false,
  swapClickArea: false,
  disableDoubleClick: true,
  enableAnnotationQuickActions: false,
  annotationQuickAction: 'copy',
  copyToNotebook: false,
  animated: true,
  isEink: false,
  isColorEink: false,
  allowScript: false,
  invertImgColorInDark: false,
  overrideColor: false,
  backgroundTextureId: 'none',
  backgroundOpacity: 0.6,
  backgroundSize: 'cover',
  highlightOpacity: 0.3,
  codeHighlighting: false,
  codeLanguage: 'auto-detect',
  readingRulerEnabled: false,
  readingRulerLines: 2,
  readingRulerOpacity: 0.5,
  readingRulerColor: 'transparent',
  vertical: false,
  scrolled: false,
};

const renderer = {
  setAttribute: vi.fn(),
  removeAttribute: vi.fn(),
  setStyles: vi.fn(),
};

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => ({
      language: { isCJK: true },
      renderer,
      book: { dir: 'ltr' },
    }),
    getViewSettings: () => viewSettings,
    getGridInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    setViewSettings: vi.fn(),
    recreateViewer: vi.fn(),
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({
      bookDoc: { metadata: { language: 'zh' } },
      book: { format: 'EPUB' },
    }),
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      globalViewSettings: viewSettings,
      autoScreenBrightness: true,
      globalReadSettings: {
        customThemes: [],
        customHighlightColors: {
          red: '#f87171',
          yellow: '#facc15',
          green: '#4ade80',
          blue: '#60a5fa',
          violet: '#a78bfa',
        },
        userHighlightColors: [],
        defaultHighlightLabels: {},
      },
    },
    fontPanelView: 'main-fonts',
    setFontPanelView: settingsStoreMock.setFontPanelView,
  }),
}));

vi.mock('@/store/customFontStore', () => ({
  useCustomFontStore: () => ({
    fonts: customFontStoreMock.customFontFamilies,
    getFontFamilies: customFontStoreMock.getFontFamilies,
  }),
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/utils/misc', () => ({
  getOSPlatform: () => 'android',
  isCJKEnv: () => true,
  stubTranslation: (text: string) => text,
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/hooks/useResetSettings', () => ({
  useResetViewSettings: () => vi.fn(),
}));

vi.mock('@/utils/style', () => ({
  getStyles: () => ({}),
}));

vi.mock('@/utils/config', () => ({
  getMaxInlineSize: () => 640,
  getDefaultMaxInlineSize: () => 640,
  getDefaultMaxBlockSize: () => 960,
}));

vi.mock('@/utils/bridge', () => ({
  getSysFontsList: vi.fn(),
  interceptKeys: vi.fn(),
  lockScreenOrientation: vi.fn(),
}));

vi.mock('@/utils/book', () => ({
  getBookDirFromWritingMode: () => 'ltr',
  getBookLangCode: () => 'zh',
}));

vi.mock('@/components/Select', () => ({
  default: ({ options }: { options: { label: string }[] }) => (
    <select>
      {options.map((option) => (
        <option key={option.label}>{option.label}</option>
      ))}
    </select>
  ),
}));

vi.mock('@/components/settings/NumberInput', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('@/components/settings/FontDropDown', () => ({
  default: ({ selected }: { selected: string }) => <button type='button'>{selected}</button>,
}));

vi.mock('@/components/settings/CustomFonts', () => ({
  default: () => <div>Custom Fonts View</div>,
}));

beforeEach(() => {
  readioFeaturesMock.readioFeatures.advancedSettings = false;
});

afterEach(cleanup);

describe('Readio reader settings', () => {
  it('keeps the font panel focused on Chinese novel essentials', () => {
    render(<FontPanel bookKey='book-1' onRegisterReset={vi.fn()} />);

    expect(screen.getByText('Override Book Font')).toBeTruthy();
    expect(screen.getByText('Default Font Size')).toBeTruthy();
    expect(screen.getByText('Minimum Font Size')).toBeTruthy();
    expect(screen.getByText('CJK Font')).toBeTruthy();
    expect(screen.getAllByText('Font Weight').length).toBeGreaterThan(0);

    expect(screen.queryByText('Font Face')).toBeNull();
    expect(screen.queryByText('Serif Font')).toBeNull();
    expect(screen.queryByText('Sans-Serif Font')).toBeNull();
    expect(screen.queryByText('Monospace Font')).toBeNull();
  });

  it('does not expose scroll mode controls', () => {
    render(<ControlPanel bookKey='book-1' onRegisterReset={vi.fn()} />);

    expect(screen.getByText('Pagination')).toBeTruthy();
    expect(screen.queryByText('Scrolled Mode')).toBeNull();
    expect(screen.queryByText('Single Section Scroll')).toBeNull();
    expect(screen.queryByText('Overlap Pixels')).toBeNull();
    expect(screen.queryByText('Hide Scrollbar')).toBeNull();
  });

  it('keeps the layout panel focused on readable Chinese novel spacing', () => {
    render(<LayoutPanel bookKey='book-1' onRegisterReset={vi.fn()} />);

    expect(screen.getByText('Writing Mode')).toBeTruthy();
    expect(screen.getByText('Paragraph Margin')).toBeTruthy();
    expect(screen.getByText('Line Spacing')).toBeTruthy();
    expect(screen.getByText('Text Indent')).toBeTruthy();
    expect(screen.getByText('Page')).toBeTruthy();
    expect(screen.getByText('Header & Footer')).toBeTruthy();

    expect(screen.queryByText('Hyphenation')).toBeNull();
    expect(screen.queryByText('Column Gap (%)')).toBeNull();
    expect(screen.queryByText('Maximum Number of Columns')).toBeNull();
    expect(screen.queryByText('Maximum Column Width')).toBeNull();
    expect(screen.queryByText('Maximum Column Height')).toBeNull();
    expect(screen.queryByText('Show Current Battery Status')).toBeNull();
    expect(screen.queryByText('Show Battery Percentage')).toBeNull();
    expect(screen.queryByText('Apply also in Scrolled Mode')).toBeNull();
    expect(screen.queryByText('Show Remaining Time')).toBeNull();
    expect(screen.queryByText('Show Remaining Pages')).toBeNull();
    expect(screen.queryByText('Show Current Time')).toBeNull();
    expect(screen.queryByText('Use 24 Hour Clock')).toBeNull();
  });

  it('shows advanced font controls when advanced settings are enabled', () => {
    readioFeaturesMock.readioFeatures.advancedSettings = true;

    render(<FontPanel bookKey='book-1' onRegisterReset={vi.fn()} />);

    expect(screen.getByText('Font Face')).toBeTruthy();
    expect(screen.getByText('Serif Font')).toBeTruthy();
    expect(screen.getByText('Sans-Serif Font')).toBeTruthy();
    expect(screen.getByText('Monospace Font')).toBeTruthy();
  });

  it('shows advanced layout controls when advanced settings are enabled', () => {
    readioFeaturesMock.readioFeatures.advancedSettings = true;

    render(<LayoutPanel bookKey='book-1' onRegisterReset={vi.fn()} />);

    expect(screen.getByText('Hyphenation')).toBeTruthy();
    expect(screen.getByText('Column Gap (%)')).toBeTruthy();
    expect(screen.getByText('Maximum Number of Columns')).toBeTruthy();
    expect(screen.getByText('Maximum Column Width')).toBeTruthy();
    expect(screen.getByText('Maximum Column Height')).toBeTruthy();
    expect(screen.getByText('Show Current Battery Status')).toBeTruthy();
    expect(screen.getByText('Show Battery Percentage')).toBeTruthy();
    expect(screen.queryByText('Apply also in Scrolled Mode')).toBeNull();
    expect(screen.queryByText('Show Remaining Time')).toBeNull();
    expect(screen.queryByText('Show Remaining Pages')).toBeNull();
    expect(screen.queryByText('Show Current Time')).toBeNull();
  });
});
