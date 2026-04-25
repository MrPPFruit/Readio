'use client';

import posthog from 'posthog-js';
import { ReactNode, useEffect } from 'react';
import { PostHogProvider } from 'posthog-js/react';
import { readioFeatures } from '@/config/features';
import { TELEMETRY_OPT_OUT_KEY } from '@/utils/telemetry';
import { getAppVersion } from '@/utils/version';

const shouldDisablePostHog = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === 'true';
};

const posthogUrl =
  process.env['NEXT_PUBLIC_POSTHOG_HOST'] ||
  atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_URL_BASE64']!);
const posthogKey =
  process.env['NEXT_PUBLIC_POSTHOG_KEY'] ||
  atob(process.env['NEXT_PUBLIC_DEFAULT_POSTHOG_KEY_BASE64']!);

if (
  readioFeatures.telemetry &&
  typeof window !== 'undefined' &&
  process.env['NODE_ENV'] === 'production' &&
  posthogKey
) {
  if (!shouldDisablePostHog()) {
    posthog.init(posthogKey, {
      api_host: posthogUrl,
      person_profiles: 'always',
      autocapture: false,
    });
  }
}
export const CSPostHogProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    if (!readioFeatures.telemetry) return;

    posthog.register_for_session({
      $app_version: getAppVersion(),
    });
  }, []);

  if (!readioFeatures.telemetry) return <>{children}</>;

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};
