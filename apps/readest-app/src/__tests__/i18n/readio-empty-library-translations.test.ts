// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appRoot = resolve(__dirname, '../../..');
const loadTranslation = (locale: string) =>
  JSON.parse(
    readFileSync(resolve(appRoot, `public/locales/${locale}/translation.json`), 'utf8'),
  ) as Record<string, string>;

describe('Readio empty library translations', () => {
  it('localizes the first-run local import card for Simplified Chinese', () => {
    const translation = loadTranslation('zh-CN');

    expect(translation['Readio Library']).toBe('Readio 书库');
    expect(translation['Start with a local book']).toBe('从本地书籍开始');
    expect(
      translation['Import EPUB, PDF, TXT, MOBI, AZW3, FB2, CBZ, or CBR files from this device.'],
    ).toBe('从这台设备导入 EPUB、PDF、TXT、MOBI、AZW3、FB2、CBZ 或 CBR 文件。');
    expect(
      translation[
        'EPUB is recommended for the best reading experience. PDF support is basic and may keep the original fixed layout.'
      ],
    ).toBe('推荐使用 EPUB 以获得最佳阅读体验。PDF 为基础支持，可能会保留原始固定版式。');
    expect(translation['Import Local Books']).toBe('导入本地书籍');
    expect(translation['Find EPUB Files']).toBe('查找 EPUB 文件');
  });

  it('localizes the first-run local import card for Traditional Chinese', () => {
    const translation = loadTranslation('zh-TW');

    expect(translation['Readio Library']).toBe('Readio 書庫');
    expect(translation['Start with a local book']).toBe('從本地書籍開始');
    expect(
      translation['Import EPUB, PDF, TXT, MOBI, AZW3, FB2, CBZ, or CBR files from this device.'],
    ).toBe('從這台設備導入 EPUB、PDF、TXT、MOBI、AZW3、FB2、CBZ 或 CBR 文件。');
    expect(
      translation[
        'EPUB is recommended for the best reading experience. PDF support is basic and may keep the original fixed layout.'
      ],
    ).toBe('推薦使用 EPUB 以獲得最佳閱讀體驗。PDF 為基礎支援，可能會保留原始固定版式。');
    expect(translation['Import Local Books']).toBe('導入本地書籍');
    expect(translation['Find EPUB Files']).toBe('尋找 EPUB 文件');
  });
});
