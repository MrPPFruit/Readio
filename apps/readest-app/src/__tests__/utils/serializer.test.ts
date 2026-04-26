import { describe, expect, it } from 'vitest';

import { deserializeConfig, serializeConfig } from '@/utils/serializer';
import type { BookConfig, BookSearchConfig, ViewSettings } from '@/types/book';

const globalViewSettings = {
  defaultFontSize: 16,
  scrolled: false,
  noContinuousScroll: false,
} as unknown as ViewSettings;

const defaultSearchConfig = {} as BookSearchConfig;

describe('config serializer', () => {
  it('normalizes persisted scroll settings to pagination-only mode when deserializing', () => {
    const config = deserializeConfig(
      JSON.stringify({
        updatedAt: 123,
        viewSettings: {
          defaultFontSize: 20,
          scrolled: true,
          noContinuousScroll: true,
        },
        searchConfig: {},
      }),
      globalViewSettings,
      defaultSearchConfig,
    );

    expect(config.viewSettings?.defaultFontSize).toBe(20);
    expect(config.viewSettings?.scrolled).toBe(false);
    expect(config.viewSettings?.noContinuousScroll).toBe(false);
  });

  it('does not persist scroll settings as enabled when serializing', () => {
    const serialized = serializeConfig(
      {
        updatedAt: 123,
        viewSettings: {
          defaultFontSize: 20,
          scrolled: true,
          noContinuousScroll: true,
        },
        searchConfig: {},
      } as unknown as BookConfig,
      globalViewSettings,
      defaultSearchConfig,
    );

    const config = JSON.parse(serialized) as BookConfig;
    expect(config.viewSettings?.defaultFontSize).toBe(20);
    expect(config.viewSettings?.scrolled).toBeUndefined();
    expect(config.viewSettings?.noContinuousScroll).toBeUndefined();
  });
});
