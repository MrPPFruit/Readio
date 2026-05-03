import { ViewSettings } from '@/types/book';
import { SystemSettings } from '@/types/settings';
import { EnvConfigType } from '@/services/environment';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { getStyles } from '@/utils/style';

const PAGINATION_RECALCULATING_SETTINGS = new Set<keyof ViewSettings>([
  'defaultFontSize',
  'minimumFontSize',
  'fontWeight',
  'defaultFont',
  'defaultCJKFont',
  'serifFont',
  'sansSerifFont',
  'monospaceFont',
  'lineHeight',
  'paragraphMargin',
  'wordSpacing',
  'letterSpacing',
  'textIndent',
  'fullJustification',
  'hyphenation',
  'marginTopPx',
  'marginBottomPx',
  'marginLeftPx',
  'marginRightPx',
  'gapPercent',
  'maxColumnCount',
  'maxInlineSize',
  'maxBlockSize',
  'writingMode',
  'doubleBorder',
  'showHeader',
  'showFooter',
  'showBarsOnScroll',
  'showMarginsOnScroll',
  'showTTSBar',
]);

export const saveViewSettings = async <K extends keyof ViewSettings>(
  envConfig: EnvConfigType,
  bookKey: string,
  key: K,
  value: ViewSettings[K],
  skipGlobal = false,
  applyStyles = true,
) => {
  if (key === 'scrolled' || key === 'noContinuousScroll') return;

  const { settings, setSettings, saveSettings } = useSettingsStore.getState();
  const {
    bookKeys,
    getView,
    getViewState,
    getViewSettings,
    setPaginationRecalculating,
    setViewSettings,
  } = useReaderStore.getState();
  const { getConfig, saveConfig } = useBookDataStore.getState();

  const applyViewSettings = async (bookKey: string) => {
    const viewSettings = getViewSettings(bookKey);
    const viewState = getViewState(bookKey);
    if (bookKey && viewSettings && viewSettings[key] !== value) {
      if (PAGINATION_RECALCULATING_SETTINGS.has(key)) {
        setPaginationRecalculating(bookKey, true);
      }
      viewSettings[key] = value;
      setViewSettings(bookKey, viewSettings);
      if (applyStyles) {
        const view = getView(bookKey);
        view?.renderer.setStyles?.(getStyles(viewSettings));
      }
      const config = getConfig(bookKey);
      if (viewState?.isPrimary && config) {
        await saveConfig(envConfig, bookKey, config, settings);
      }
    }
  };

  const isSettingsGlobal = getViewSettings(bookKey)?.isGlobal ?? true;
  if (isSettingsGlobal && !skipGlobal) {
    settings.globalViewSettings[key] = value;
    setSettings(settings);

    for (const bookKey of bookKeys) {
      await applyViewSettings(bookKey);
    }
    await saveSettings(envConfig, settings);
  } else if (bookKey) {
    await applyViewSettings(bookKey);
  }
};

export const saveSysSettings = async <K extends keyof SystemSettings>(
  envConfig: EnvConfigType,
  key: K,
  value: SystemSettings[K],
) => {
  const { settings, setSettings, saveSettings } = useSettingsStore.getState();
  if (settings[key] !== value) {
    settings[key] = value;
    setSettings(settings);
    await saveSettings(envConfig, settings);
  }
};
