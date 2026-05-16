import { describe, it, expect, vi } from 'vitest';
import type { BookDoc, SectionItem, TOCItem } from '@/libs/document';
import { computeBookNav, getTocDisplayLabel } from '@/services/nav';

// Polyfill CSS.escape for jsdom — matches book-nav-cache.test.ts.
if (typeof globalThis['CSS'] === 'undefined') {
  (globalThis as Record<string, unknown>)['CSS'] = {
    escape: (s: string) => s.replace(/([^\w-])/g, '\\$1'),
  };
}

// Mirrors foliate-js: section ids are path-resolved manifest item hrefs like
// "OEBPS/text00001.html"; the TOC href uses the same form, optionally suffixed
// with a fragment.
const splitTOCHref = (href: string): Array<string | number> => {
  if (!href) return [''];
  const hashIdx = href.indexOf('#');
  if (hashIdx < 0) return [href];
  return [href.slice(0, hashIdx), href.slice(hashIdx + 1)];
};

interface MakeBookOpts {
  sectionCount?: number;
  tocHrefs?: string[];
  navSectionId?: string; // section whose loadText returns <nav>...</nav> HTML
  navHtml?: string;
}

const makeBook = (opts: MakeBookOpts): BookDoc => {
  const sectionCount = opts.sectionCount ?? 40;
  const sections: SectionItem[] = [];
  for (let i = 1; i <= sectionCount; i++) {
    const id = `OEBPS/text${String(i).padStart(5, '0')}.html`;
    const isNavSection = id === opts.navSectionId;
    sections.push({
      id,
      cfi: `epubcfi(/6/${i * 2}[s${i}]!)`,
      size: 1000,
      linear: 'yes',
      href: id,
      loadText: isNavSection && opts.navHtml ? async () => opts.navHtml! : async () => '',
      createDocument: async () => {
        const html = isNavSection && opts.navHtml ? opts.navHtml : '<html><body/></html>';
        return new DOMParser().parseFromString(html, 'application/xhtml+xml');
      },
    });
  }

  const tocHrefs = opts.tocHrefs ?? [];
  const toc: TOCItem[] = tocHrefs.map((href, i) => ({
    id: i,
    label: `Volume ${i + 1}`,
    href,
    index: 0,
  }));

  return {
    metadata: { title: 'test', author: '', language: 'en' },
    rendition: { layout: 'reflowable' },
    dir: 'ltr',
    toc,
    sections,
    splitTOCHref,
    getCover: async () => null,
  };
};

const NAV_WITH_SIX_CHAPTERS = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
<nav id="toc">
<h1>目录</h1>
<ol>
<li><a href="text00003.html">第1回</a></li>
<li><a href="text00004.html">第2回</a></li>
<li><a href="text00005.html">第3回</a></li>
<li><a href="text00006.html">第4回</a></li>
<li><a href="text00007.html">第5回</a></li>
<li><a href="text00008.html">第6回</a></li>
</ol>
</nav>
</body>
</html>`;

// Thresholds: section count > 64 AND section count > 8 × flatTocCount.
const LARGE_SECTION_COUNT = 100;
const SMALL_SECTION_COUNT = 40;

describe('getTocDisplayLabel', () => {
  it('includes a part-like parent for nested chapter labels', () => {
    const toc: TOCItem[] = [
      {
        id: 0,
        label: '第一部 小丑',
        href: 'part-1.xhtml',
        index: 0,
        subitems: [{ id: 1, label: '第五章 线索', href: 'chapter-5.xhtml', index: 1 }],
      },
    ];

    expect(getTocDisplayLabel(toc, toc[0]!.subitems![0]!)).toBe('第一部 小丑 · 第五章 线索');
  });

  it('keeps chapter labels unchanged for ordinary nested parents', () => {
    const toc: TOCItem[] = [
      {
        id: 0,
        label: '正文',
        href: 'body.xhtml',
        index: 0,
        subitems: [{ id: 1, label: '第五章 线索', href: 'chapter-5.xhtml', index: 1 }],
      },
    ];

    expect(getTocDisplayLabel(toc, toc[0]!.subitems![0]!)).toBe('第五章 线索');
  });

  it('does not duplicate a parent label already included in the child label', () => {
    const toc: TOCItem[] = [
      {
        id: 0,
        label: '第一部 小丑',
        href: 'part-1.xhtml',
        index: 0,
        subitems: [{ id: 1, label: '第一部 小丑 第五章 线索', href: 'chapter-5.xhtml', index: 1 }],
      },
    ];

    expect(getTocDisplayLabel(toc, toc[0]!.subitems![0]!)).toBe('第一部 小丑 第五章 线索');
  });

  it('includes the nearest preceding part for flat chapter labels', () => {
    const toc: TOCItem[] = [
      { id: 0, label: '第一部 小丑', href: 'part-1.xhtml', index: 0 },
      { id: 138, label: '第一百三十四章 超过一分钟了', href: 'chapter-134.xhtml', index: 138 },
      { id: 220, label: '第二部 无面人', href: 'part-2.xhtml', index: 220 },
      { id: 269, label: '第五十一章 五人聚会', href: 'chapter-269.xhtml', index: 269 },
    ];

    expect(getTocDisplayLabel(toc, toc[1]!)).toBe('第一部 小丑 · 第一百三十四章 超过一分钟了');
    expect(getTocDisplayLabel(toc, toc[3]!)).toBe('第二部 无面人 · 第五十一章 五人聚会');
  });

  it('does not prefix top-level part labels with earlier parts', () => {
    const toc: TOCItem[] = [
      { id: 0, label: '第一部 小丑', href: 'part-1.xhtml', index: 0 },
      { id: 220, label: '第二部 无面人', href: 'part-2.xhtml', index: 220 },
    ];

    expect(getTocDisplayLabel(toc, toc[1]!)).toBe('第二部 无面人');
  });
});

describe('computeBookNav nav-enrichment fallback', () => {
  it('adds embedded <nav> items when sections >> flat TOC', async () => {
    const book = makeBook({
      sectionCount: LARGE_SECTION_COUNT,
      tocHrefs: ['OEBPS/text00001.html'], // sparse: 1 TOC entry, 100 sections
      navSectionId: 'OEBPS/text00002.html',
      navHtml: NAV_WITH_SIX_CHAPTERS,
    });
    const originalTocLen = (book.toc ?? []).length;

    const nav = await computeBookNav(book);

    // 6 new items merged in; each label and href from the embedded <nav>
    expect(nav.toc.length).toBe(originalTocLen + 6);
    const newItems = nav.toc.slice(originalTocLen);
    expect(newItems.map((i) => i.label)).toEqual([
      '第1回',
      '第2回',
      '第3回',
      '第4回',
      '第5回',
      '第6回',
    ]);
    expect(newItems[0]!.href).toBe('OEBPS/text00003.html');
    expect(newItems[5]!.href).toBe('OEBPS/text00008.html');
  });

  it('skips enrichment when sections are below the min-sections threshold', async () => {
    const book = makeBook({
      sectionCount: SMALL_SECTION_COUNT, // below min-sections threshold
      tocHrefs: ['OEBPS/text00001.html'],
      navSectionId: 'OEBPS/text00002.html',
      navHtml: NAV_WITH_SIX_CHAPTERS,
    });
    const loadTextSpies = (book.sections ?? []).map((s) =>
      typeof s.loadText === 'function' ? vi.spyOn(s, 'loadText') : null,
    );

    const nav = await computeBookNav(book);

    expect(nav.toc.length).toBe(1); // no enrichment
    for (const spy of loadTextSpies) {
      if (spy) expect(spy).not.toHaveBeenCalled();
    }
  });

  it('skips enrichment when the TOC is not sparse enough vs sections', async () => {
    // 100 sections with 30 existing TOC items — ratio too low to trigger fallback.
    const tocHrefs: string[] = [];
    for (let i = 1; i <= 30; i++) tocHrefs.push(`OEBPS/text${String(i).padStart(5, '0')}.html`);
    const book = makeBook({
      sectionCount: LARGE_SECTION_COUNT,
      tocHrefs,
      navSectionId: 'OEBPS/text00002.html',
      navHtml: NAV_WITH_SIX_CHAPTERS,
    });

    const nav = await computeBookNav(book);

    expect(nav.toc.length).toBe(30); // unchanged
  });

  it('does not duplicate items already in the existing TOC', async () => {
    // TOC already has text00003.html — the nav's first item should be dropped.
    const book = makeBook({
      sectionCount: LARGE_SECTION_COUNT,
      tocHrefs: ['OEBPS/text00001.html', 'OEBPS/text00003.html'],
      navSectionId: 'OEBPS/text00002.html',
      navHtml: NAV_WITH_SIX_CHAPTERS,
    });
    const originalTocLen = (book.toc ?? []).length;

    const nav = await computeBookNav(book);

    expect(nav.toc.length).toBe(originalTocLen + 5); // 6 nav items minus the 1 dup
    const hrefs = nav.toc.map((i) => i.href);
    expect(hrefs.filter((h) => h === 'OEBPS/text00003.html').length).toBe(1);
  });
});
