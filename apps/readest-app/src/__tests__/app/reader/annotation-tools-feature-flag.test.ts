import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadAnnotationToolTypes(readerAI: boolean) {
  vi.resetModules();
  vi.doMock('@/config/features', () => ({
    readioFeatures: {
      translation: false,
      tts: false,
      proofreading: false,
      readerAI,
    },
  }));
  vi.doMock('@/utils/misc', () => ({
    stubTranslation: (text: string) => text,
  }));

  const { annotationToolButtons } =
    await import('@/app/reader/components/annotator/AnnotationTools');
  return annotationToolButtons.map((button) => button.type);
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('AnnotationTools reader AI feature flag', () => {
  it('hides the AI selection action when reader AI is disabled', async () => {
    await expect(loadAnnotationToolTypes(false)).resolves.toEqual([
      'copy',
      'highlight',
      'annotate',
    ]);
  });

  it('shows the AI selection action when reader AI is enabled', async () => {
    await expect(loadAnnotationToolTypes(true)).resolves.toEqual([
      'copy',
      'highlight',
      'annotate',
      'ai',
    ]);
  });
});
