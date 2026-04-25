import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: {},
    envConfig: {},
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: {
    getState: () => ({
      library: [],
      updateBook: vi.fn(),
    }),
  },
}));

vi.mock('@/store/transferStore', () => ({
  useTransferStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      transfers: {},
      isQueuePaused: false,
      setIsTransferQueueOpen: vi.fn(),
    }),
}));

const { initialize } = vi.hoisted(() => ({
  initialize: vi.fn(),
}));

vi.mock('@/services/transferManager', () => ({
  transferManager: {
    initialize,
    queueUpload: vi.fn(),
    queueDownload: vi.fn(),
    queueBatchUploads: vi.fn(),
    cancelTransfer: vi.fn(),
    retryTransfer: vi.fn(),
    retryAllFailed: vi.fn(),
    pauseQueue: vi.fn(),
    resumeQueue: vi.fn(),
  },
}));

import { useTransferQueue } from '@/hooks/useTransferQueue';

function Probe() {
  useTransferQueue(true);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  initialize.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useTransferQueue', () => {
  it('does not initialize transfer manager when cloud sync is disabled', () => {
    render(<Probe />);

    act(() => {
      vi.runAllTimers();
    });

    expect(initialize).not.toHaveBeenCalled();
  });
});
