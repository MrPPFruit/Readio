import { describe, expect, it, vi } from 'vitest';
import type { AppService } from '@/types/system';
import { SUPPORTED_BOOK_EXTS } from '@/services/constants';

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => true,
}));

vi.mock('@tauri-apps/api/path', () => ({
  basename: (path: string) => Promise.resolve(path.split('/').pop() || path),
}));

import { useFileSelector } from '@/hooks/useFileSelector';

const identity = (key: string) => key;

const makeAppService = (selectFiles: ReturnType<typeof vi.fn>) =>
  ({
    isAndroidApp: true,
    isIOSApp: false,
    selectFiles,
  }) as unknown as AppService;

describe('useFileSelector', () => {
  it('passes supported book extensions to Android picker for local book import', async () => {
    const selectFiles = vi.fn().mockResolvedValue(['/storage/emulated/0/Download/sample.txt']);
    const appService = makeAppService(selectFiles);

    const { selectFiles: selectBookFiles } = useFileSelector(appService, identity);
    await selectBookFiles({ type: 'books', multiple: true });

    expect(selectFiles).toHaveBeenCalledWith('Select Books', SUPPORTED_BOOK_EXTS);
  });
});
