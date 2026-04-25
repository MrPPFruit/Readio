import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/version', () => ({
  getAppVersion: () => '1.0.0',
}));

vi.mock('posthog-js/react', () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { posthog } = vi.hoisted(() => ({
  posthog: {
    init: vi.fn(),
    register_for_session: vi.fn(),
  },
}));

vi.mock('posthog-js', () => ({
  default: posthog,
}));

import { CSPostHogProvider } from '@/context/PHContext';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('CSPostHogProvider', () => {
  it('does not register telemetry when telemetry is disabled', () => {
    render(
      <CSPostHogProvider>
        <div>local library</div>
      </CSPostHogProvider>,
    );

    expect(posthog.register_for_session).not.toHaveBeenCalled();
  });
});
