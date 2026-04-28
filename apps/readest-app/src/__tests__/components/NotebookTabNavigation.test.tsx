import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: null }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      aiSettings: {
        enabled: true,
      },
    },
  }),
}));

import NotebookTabNavigation from '@/app/reader/components/notebook/NotebookTabNavigation';

describe('NotebookTabNavigation Readio feature gating', () => {
  it('does not show the old Notebook AI tab when shared AI settings are enabled but old AI features are disabled', () => {
    render(<NotebookTabNavigation activeTab='notes' onTabChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'AI' })).toBeNull();
  });
});
