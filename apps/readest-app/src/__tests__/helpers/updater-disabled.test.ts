import { describe, expect, it, vi } from 'vitest';

const { check, fetch, storage } = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    check: vi.fn(),
    fetch: vi.fn(),
    storage: {
      clear: vi.fn(() => values.clear()),
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    },
  };
});

Object.defineProperty(window, 'localStorage', {
  value: storage,
  configurable: true,
});

vi.mock('@tauri-apps/plugin-updater', () => ({
  check,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: () => 'macos',
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {
    once = vi.fn();
  },
}));

vi.mock('@/components/UpdaterWindow', () => ({
  setUpdaterWindowVisible: vi.fn(),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

vi.mock('@/utils/version', () => ({
  getAppVersion: () => '1.0.0',
}));

vi.mock('@/services/constants', () => ({
  CHECK_UPDATE_INTERVAL_SEC: 86400,
  READEST_UPDATER_FILE: 'https://example.com/latest.json',
  READEST_CHANGELOG_FILE: 'https://example.com/release-notes.json',
}));

import { checkForAppUpdates, checkAppReleaseNotes } from '@/helpers/updater';

describe('disabled updater', () => {
  it('does not call Tauri updater checks when updater is disabled', async () => {
    const result = await checkForAppUpdates((text) => text, false);

    expect(result).toBe(false);
    expect(check).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch release notes when updater is disabled', async () => {
    const windowFetch = vi
      .spyOn(window, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const result = await checkAppReleaseNotes(false);

    expect(result).toBe(false);
    expect(windowFetch).not.toHaveBeenCalled();
  });
});
