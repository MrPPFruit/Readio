import { describe, expect, it } from 'vitest';

import { shouldEnablePageTurnAnimation } from '@/utils/pageAnimation';

describe('shouldEnablePageTurnAnimation', () => {
  it('forces page-turn animation on Android non-eink readers even when the saved setting is off', () => {
    expect(
      shouldEnablePageTurnAnimation({
        animated: false,
        isEink: false,
        isAndroidApp: true,
      }),
    ).toBe(true);
  });

  it('keeps eink readers non-animated on Android when animation is disabled', () => {
    expect(
      shouldEnablePageTurnAnimation({
        animated: false,
        isEink: true,
        isAndroidApp: true,
      }),
    ).toBe(false);
  });

  it('uses the saved animation setting outside Android', () => {
    expect(
      shouldEnablePageTurnAnimation({
        animated: false,
        isEink: false,
        isAndroidApp: false,
      }),
    ).toBe(false);
  });
});
