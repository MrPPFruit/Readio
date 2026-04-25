process.env.NODE_ENV = 'test';

const createMockStorage = () => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

const mockStorage = createMockStorage();

const defineStorage = (target: typeof globalThis | Window) => {
  Object.defineProperty(target, 'localStorage', {
    value: mockStorage,
    writable: true,
    configurable: true,
  });
};

defineStorage(globalThis);
if (typeof window !== 'undefined') defineStorage(window);

if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    value: () => Promise.resolve(),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    value: () => {},
    writable: true,
    configurable: true,
  });
}

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
