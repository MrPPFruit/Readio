import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: null, envConfig: {} }),
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/components/command-palette', () => ({
  useCommandPalette: () => ({ open: vi.fn() }),
}));

vi.mock('@/services/environment', () => ({
  getCommandPaletteShortcut: () => 'mod+k',
}));

vi.mock('@/utils/rtl', () => ({
  getDirFromUILanguage: () => 'ltr',
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    setFontPanelView: vi.fn(),
    setSettingsDialogOpen: vi.fn(),
    activeSettingsItemId: null,
    setActiveSettingsItemId: vi.fn(),
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ systemUIVisible: false, statusBarHeight: 0, safeAreaInsets: null }),
}));

vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    acquireBackKeyInterception: vi.fn(),
    releaseBackKeyInterception: vi.fn(),
  }),
}));

vi.mock('@/components/settings/FontPanel', () => ({ default: () => <div>Font Panel</div> }));
vi.mock('@/components/settings/LayoutPanel', () => ({ default: () => <div>Layout Panel</div> }));
vi.mock('@/components/settings/ColorPanel', () => ({ default: () => <div>Color Panel</div> }));
vi.mock('@/components/settings/ControlPanel', () => ({ default: () => <div>Control Panel</div> }));
vi.mock('@/components/settings/LangPanel', () => ({ default: () => <div>Language Panel</div> }));
vi.mock('@/components/settings/TTSPanel', () => ({ default: () => <div>TTS Panel</div> }));
vi.mock('@/components/settings/MiscPanel', () => ({ default: () => <div>Custom Panel</div> }));
vi.mock('@/components/settings/DialogMenu', () => ({ default: () => <div>Dialog Menu</div> }));
vi.mock('@/components/settings/AIPanel', () => ({ default: () => <div>AI Settings Panel</div> }));

import SettingsDialog from '@/components/settings/SettingsDialog';

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}

class MutationObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}

describe('SettingsDialog Readio AI settings gating', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('MutationObserver', MutationObserverMock);
    localStorage.clear();
  });

  it('keeps the AI settings tab enabled for reader AI in production', () => {
    localStorage.setItem('lastConfigPanel', 'AI');

    render(<SettingsDialog bookKey='' />);

    expect(screen.getByRole('button', { name: 'AI Assistant' })).toBeTruthy();
    expect(screen.getByText('AI Settings Panel')).toBeTruthy();
  });
});
