import { describe, expect, it } from 'vitest';

const importNodeModule = async <T>(moduleName: string): Promise<T> => {
  return import(/* @vite-ignore */ moduleName) as Promise<T>;
};

const readSourceFile = async (relativePath: string) => {
  const [{ readFileSync }, { join }] = await Promise.all([
    importNodeModule<typeof import('node:fs')>('node:fs'),
    importNodeModule<typeof import('node:path')>('node:path'),
  ]);
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
};

describe('Readio settings source simplification', () => {
  it('keeps behavior settings focused on pagination and screen brightness', async () => {
    const source = await readSourceFile('src/components/settings/ControlPanel.tsx');

    expect(source).toContain("_('Pagination')");
    expect(source).toContain("_('System Screen Brightness')");

    expect(source).not.toContain("_('Scroll')");
    expect(source).not.toContain("_('Scrolled Mode')");
    expect(source).not.toContain("_('Single Section Scroll')");
    expect(source).not.toContain("_('Overlap Pixels')");
    expect(source).not.toContain("_('Hide Scrollbar')");
    expect(source).not.toContain("'scrolled'");
    expect(source).not.toContain("'noContinuousScroll'");
    expect(source).not.toContain("_('Animation')");
    expect(source).not.toContain("_('Paging Animation')");
    expect(source).not.toContain("_('E-Ink Mode')");
    expect(source).not.toContain("_('Color E-Ink Mode')");
  });

  it('hides code highlighting from the full color settings', async () => {
    const source = await readSourceFile('src/components/settings/ColorPanel.tsx');

    expect(source).not.toContain('CodeHighlightingSettings');
    expect(source).not.toContain('codeHighlighting={');
    expect(source).not.toContain('codeLanguage={');
  });

  it('forces Readio reader settings to paginated mode', async () => {
    const [settingsService, bookService, readerStore, settingsStore, shortcuts, shortcutDefaults] =
      await Promise.all([
        readSourceFile('src/services/settingsService.ts'),
        readSourceFile('src/services/bookService.ts'),
        readSourceFile('src/store/readerStore.ts'),
        readSourceFile('src/store/settingsStore.ts'),
        readSourceFile('src/app/reader/hooks/useBookShortcuts.ts'),
        readSourceFile('src/helpers/shortcuts.ts'),
      ]);

    for (const source of [settingsService, bookService, readerStore, settingsStore]) {
      expect(source).toContain('scrolled: false');
      expect(source).toContain('noContinuousScroll: false');
    }
    expect(shortcuts).not.toContain('onToggleScrollMode');
    expect(shortcutDefaults).not.toContain('Toggle Scroll Mode');
  });
});
