import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthLayout from '@/app/auth/layout';
import ProfileLayout from '@/app/user/layout';

const { readioFeaturesMock, replace } = vi.hoisted(() => ({
  readioFeaturesMock: {
    readioFeatures: {
      auth: false,
      commerce: false,
    },
  },
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/config/features', () => readioFeaturesMock);

beforeEach(() => {
  readioFeaturesMock.readioFeatures.auth = false;
  readioFeaturesMock.readioFeatures.commerce = false;
});

afterEach(() => {
  cleanup();
  replace.mockClear();
});

describe('disabled feature route layouts', () => {
  it('redirects disabled auth routes back to the local library', async () => {
    render(
      <AuthLayout>
        <div>Auth route</div>
      </AuthLayout>,
    );

    expect(screen.queryByText('Auth route')).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/library'));
  });

  it('redirects disabled account routes back to the local library', async () => {
    render(
      <ProfileLayout>
        <div>Account route</div>
      </ProfileLayout>,
    );

    expect(screen.queryByText('Account route')).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/library'));
  });

  it('renders auth routes when auth is enabled', () => {
    readioFeaturesMock.readioFeatures.auth = true;

    render(
      <AuthLayout>
        <div>Auth route</div>
      </AuthLayout>,
    );

    expect(screen.getByText('Auth route')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders account routes when auth or commerce is enabled', () => {
    readioFeaturesMock.readioFeatures.commerce = true;

    render(
      <ProfileLayout>
        <div>Account route</div>
      </ProfileLayout>,
    );

    expect(screen.getByText('Account route')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
