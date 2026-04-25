process.env.NODE_ENV = 'test';

const ensureStorage = (target: typeof globalThis | Window) => {
  const storage = Reflect.get(target, 'localStorage') as Partial<Storage> | undefined;
  if (typeof storage?.getItem === 'function') return;

  const values = new Map<string, string>();
  const mockStorage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };

  Object.defineProperty(target, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
};

ensureStorage(globalThis);
if (typeof window !== 'undefined') ensureStorage(window);

// matchMedia mock
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
