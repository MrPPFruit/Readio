import { describe, expect, it } from 'vitest';

import { getReflowableFullBookPageInfo, getRendererPageInfo } from '@/app/reader/utils/pageInfo';
import type { BookDoc } from '@/libs/document';
import type { FoliateView } from '@/types/view';

const makeBookDoc = (sizes: number[]): BookDoc =>
  ({
    metadata: { title: 'Test', author: 'Author', language: 'en' },
    rendition: { layout: 'reflowable' },
    dir: 'ltr',
    sections: sizes.map((size, index) => ({
      id: `section-${index}`,
      cfi: `/6/${index * 2}`,
      size,
      linear: 'yes',
      createDocument: async () => document.implementation.createHTMLDocument(),
    })),
    splitTOCHref: () => [],
    getCover: async () => null,
  }) as BookDoc;

const makeView = ({ page, pages }: { page: number; pages: number }): FoliateView =>
  ({
    renderer: {
      scrolled: false,
      page,
      pages,
    },
  }) as FoliateView;

describe('reader page info', () => {
  it('returns the current renderer section page info', () => {
    expect(getRendererPageInfo(makeView({ page: 2, pages: 8 }))).toEqual({
      current: 2,
      total: 8,
    });
  });

  it('derives reflowable full-book page totals from the current layout page count', () => {
    const bookDoc = makeBookDoc([1000, 3000, 6000]);

    expect(
      getReflowableFullBookPageInfo({
        bookDoc,
        section: { current: 1, total: 3 },
        location: { current: 4, total: 7 },
        renderedPageInfo: { current: 1, total: 6 },
      }),
    ).toEqual({ current: 3, total: 20 });

    expect(
      getReflowableFullBookPageInfo({
        bookDoc,
        section: { current: 1, total: 3 },
        location: { current: 4, total: 7 },
        renderedPageInfo: { current: 1, total: 12 },
      }),
    ).toEqual({ current: 5, total: 40 });
  });
});
