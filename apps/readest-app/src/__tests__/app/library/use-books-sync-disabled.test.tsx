import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: {} }),
}));

vi.mock('@/store/libraryStore', () => {
  const state = {
    library: [{ hash: 'book-1', updatedAt: Date.now() }],
    isSyncing: false,
    libraryLoaded: true,
    setLibrary: vi.fn(),
    setIsSyncing: vi.fn(),
    setSyncProgress: vi.fn(),
  };
  const useLibraryStore = () => state;
  useLibraryStore.getState = () => state;
  return { useLibraryStore };
});

const syncBooks = vi.fn();

vi.mock('@/hooks/useSync', () => ({
  useSync: () => ({
    useSyncInited: true,
    syncedBooks: [],
    syncBooks,
    lastSyncedAtBooks: 1,
  }),
}));

vi.mock('@/services/constants', () => ({
  SYNC_BOOKS_INTERVAL_SEC: 1,
}));

vi.mock('@/utils/throttle', () => ({
  throttle: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock('@/utils/debounce', () => ({
  debounce: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: vi.fn() },
}));

import { useBooksSync } from '@/app/library/hooks/useBooksSync';

let exposed: ReturnType<typeof useBooksSync>;

function Probe() {
  exposed = useBooksSync();
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('useBooksSync', () => {
  it('does not sync books when cloud sync is disabled', async () => {
    render(<Probe />);

    await act(async () => {
      await exposed.pullLibrary(true, true);
      await exposed.pushLibrary();
    });

    expect(syncBooks).not.toHaveBeenCalled();
  });
});
