import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware } from '@/middleware';

const optionsRequest = (path: string) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:3000' },
  });

describe('middleware', () => {
  it('rejects disabled API feature preflight requests before route handlers', async () => {
    const response = middleware(optionsRequest('/api/opds/proxy'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Feature disabled' });
  });

  it('allows reader AI chat preflight when readerAI is enabled and AI is disabled', () => {
    const response = middleware(optionsRequest('/api/ai/chat'));

    expect(response.status).toBe(200);
  });

  it('rejects embed preflight when AI is disabled even if readerAI is enabled', async () => {
    const response = middleware(optionsRequest('/api/ai/embed'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Feature disabled' });
  });
});
