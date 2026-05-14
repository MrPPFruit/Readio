import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PiSun, PiMoon } from 'react-icons/pi';
import { TbSunMoon } from 'react-icons/tb';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useDeviceControlStore } from '@/store/deviceStore';
import { saveSysSettings } from '@/helpers/settings';
import { themes } from '@/styles/themes';
import { debounce } from '@/utils/debounce';
import Slider from '@/components/Slider';

const SCREEN_BRIGHTNESS_LIMITS = {
  MIN: 0,
  MAX: 100,
  DEFAULT: 50,
} as const;

interface ColorPanelProps {
  actionTab: string;
  bottomOffset: string;
  forceMobileLayout: boolean;
}

export const ColorPanel: React.FC<ColorPanelProps> = ({
  actionTab,
  bottomOffset,
  forceMobileLayout,
}) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { settings } = useSettingsStore();
  const {
    getScreenBrightness,
    setScreenBrightness,
    hasWriteSettingsPermission,
    requestWriteSettingsPermission,
  } = useDeviceControlStore();
  const { themeMode, themeColor, isDarkMode, setThemeMode, setThemeColor } = useThemeStore();

  const [screenBrightnessValue, setScreenBrightnessValue] = useState(
    settings.screenBrightness >= 0 ? settings.screenBrightness : SCREEN_BRIGHTNESS_LIMITS.DEFAULT,
  );
  useEffect(() => {
    if (!appService?.isMobileApp) return;
    if (actionTab !== 'color') return;

    getScreenBrightness().then((brightness) => {
      if (brightness >= 0.0 && brightness <= 1.0) {
        const screenBrightness = Math.round(brightness * 100);
        setScreenBrightnessValue(screenBrightness);
      }
    });
  }, [actionTab, appService, getScreenBrightness]);

  const debouncedSetScreenBrightness = useMemo(
    () =>
      debounce(async (value: number) => {
        saveSysSettings(envConfig, 'screenBrightness', value);
        await setScreenBrightness(value / 100);
      }, 100),
    [envConfig, setScreenBrightness],
  );

  const handleScreenBrightnessChange = useCallback(
    async (value: number) => {
      if (!appService?.isMobileApp) return;

      setScreenBrightnessValue(value);

      if (appService?.isAndroidApp) {
        const granted = await hasWriteSettingsPermission();
        if (!granted) {
          await requestWriteSettingsPermission();
          return;
        }
      }

      debouncedSetScreenBrightness(value);
    },
    [
      appService,
      debouncedSetScreenBrightness,
      hasWriteSettingsPermission,
      requestWriteSettingsPermission,
    ],
  );

  const themeModeOptions = [
    { mode: 'light' as const, label: _('Light Mode'), Icon: PiSun },
    { mode: 'dark' as const, label: _('Dark Mode'), Icon: PiMoon },
    { mode: 'auto' as const, label: _('Auto Mode'), Icon: TbSunMoon },
  ];

  const classes = clsx(
    'footerbar-color-mobile bg-base-200 absolute flex w-full flex-col items-center gap-y-5 px-4 transition-all',
    !forceMobileLayout && 'sm:hidden',
    actionTab === 'color'
      ? 'pointer-events-auto translate-y-0 pb-3 pt-5 ease-out'
      : 'pointer-events-none invisible translate-y-full overflow-hidden pb-0 pt-0 ease-in',
  );

  return (
    <div
      className={classes}
      style={{
        bottom: appService?.isAndroidApp
          ? `calc(env(safe-area-inset-bottom) + 64px)`
          : bottomOffset,
      }}
    >
      {appService?.hasScreenBrightness && (
        <Slider
          label={_('Screen Brightness')}
          initialValue={screenBrightnessValue}
          bubbleLabel={`${screenBrightnessValue}`}
          minIcon={<PiSun size={16} />}
          maxIcon={<PiSun size={24} />}
          onChange={handleScreenBrightnessChange}
          min={SCREEN_BRIGHTNESS_LIMITS.MIN}
          max={SCREEN_BRIGHTNESS_LIMITS.MAX}
          valueToPosition={(value: number, min: number, max: number): number => {
            if (value <= min) return 0;
            if (value >= max) return 100;
            // Use exponential mapping: position = 100 * ((value/max)^0.5)
            const normalized = value / max;
            const position = Math.pow(normalized, 0.5) * 100;
            return position;
          }}
          positionToValue={(position: number, min: number, max: number): number => {
            if (position <= 0) return min;
            if (position >= 100) return max;
            // Inverse of the above: value = max * (position/100)^2
            const normalized = position / 100;
            const value = Math.pow(normalized, 2) * max;
            return Math.max(min, Math.min(max, value));
          }}
        />
      )}

      <div className='w-full'>
        <div className='flex items-center justify-between px-2 py-1'>
          <span className='text-sm font-medium'>{_('Theme')}</span>
        </div>
        <div className='grid grid-cols-3 gap-2 px-2 py-1'>
          {themeModeOptions.map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type='button'
              onClick={() => setThemeMode(mode)}
              className={clsx(
                'btn btn-ghost bg-base-100 h-auto min-h-11 flex-col gap-1 rounded-xl px-2 py-1.5 text-xs font-normal',
                themeMode === mode && 'bg-base-300 text-primary',
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className='w-full'>
        <div className='flex items-center justify-between px-2 py-1'>
          <span className='text-sm font-medium'>{_('Color')}</span>
        </div>
        <div
          className='flex gap-3 overflow-x-auto px-2 py-1.5'
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {themes.map(({ name, label, colors }) => (
            <button
              key={name}
              onClick={() => setThemeColor(name)}
              className={clsx(
                'flex flex-shrink-0 flex-col items-center justify-center rounded-lg p-3 transition-all',
                'h-[40px] min-w-[80px]',
                themeColor === name
                  ? 'ring-primary ring-offset-base-200 ring-2 ring-offset-2'
                  : 'hover:opacity-80',
              )}
              style={{
                backgroundColor: isDarkMode ? colors.dark['base-100'] : colors.light['base-100'],
                color: isDarkMode ? colors.dark['base-content'] : colors.light['base-content'],
              }}
            >
              <span className='text-xs font-medium'>{_(label)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
