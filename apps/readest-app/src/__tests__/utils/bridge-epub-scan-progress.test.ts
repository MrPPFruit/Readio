import { describe, expect, it, vi } from 'vitest';

const coreMock = vi.hoisted(() => ({
  invoke: vi.fn(),
  Channel: class MockChannel<T> {
    onmessage?: (message: T) => void;
  },
}));

vi.mock('@tauri-apps/api/core', () => coreMock);

import { findLocalEpubFiles } from '@/utils/bridge';

describe('findLocalEpubFiles progress channel', () => {
  it('passes scan progress through a Tauri channel callback', async () => {
    coreMock.invoke.mockResolvedValue({ files: [] });
    const onProgress = vi.fn();

    await findLocalEpubFiles(onProgress);

    expect(coreMock.invoke).toHaveBeenCalledWith('plugin:native-bridge|find_local_epub_files', {
      payload: {
        onProgress: expect.any(coreMock.Channel),
      },
    });

    const payload = coreMock.invoke.mock.calls[0]![1] as {
      payload: { onProgress: InstanceType<typeof coreMock.Channel> };
    };
    payload.payload.onProgress.onmessage?.({ scannedCount: 42, file: '/storage/book.epub' });

    expect(onProgress).toHaveBeenCalledWith({ scannedCount: 42, file: '/storage/book.epub' });
  });
});
