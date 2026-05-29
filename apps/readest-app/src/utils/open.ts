import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauriAppPlatform } from '@/services/environment';

export const openExternalUrl = async (url: string) => {
  if (isTauriAppPlatform()) {
    await openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};

export const interceptWindowOpen = () => {
  const windowOpen = window.open;
  globalThis.open = function (
    url?: string | URL,
    target?: string,
    features?: string,
  ): Window | null {
    if (isTauriAppPlatform()) {
      openUrl(url?.toString() || '');
      return null;
    } else {
      return windowOpen(url, target, features);
    }
  };
};
