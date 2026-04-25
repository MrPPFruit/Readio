import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { POST as aiChatPost } from '@/app/api/ai/chat/route';
import { POST as aiEmbedPost } from '@/app/api/ai/embed/route';
import { POST as appleIapPost } from '@/app/api/apple/iap-verify/route';
import { POST as googleIapPost } from '@/app/api/google/iap-verify/route';
import {
  GET as opdsGet,
  HEAD as opdsHead,
  OPTIONS as opdsOptions,
} from '@/app/api/opds/proxy/route';
import { POST as stripeCheckPost } from '@/app/api/stripe/check/route';
import { POST as stripeCheckoutPost } from '@/app/api/stripe/checkout/route';
import { GET as stripePlansGet } from '@/app/api/stripe/plans/route';
import { POST as stripePortalPost } from '@/app/api/stripe/portal/route';
import { POST as stripeWebhookPost } from '@/app/api/stripe/webhook/route';
import { GET as ttsGet, POST as ttsPost } from '@/app/api/tts/edge/route';

vi.mock('@/utils/access', () => ({
  validateUserAndToken: vi.fn(async () => ({
    user: { id: 'user-1', email: 'reader@example.com' },
    token: 'token-1',
  })),
}));

vi.mock('ai', () => ({
  createGateway: vi.fn(),
  embed: vi.fn(),
  embedMany: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@/libs/edgeTTS', () => ({
  EdgeSpeechTTS: class {
    static voices = [{ id: 'zh-CN-XiaoxiaoNeural', lang: 'zh-CN', name: 'Xiaoxiao' }];
    create = vi.fn(async () => new Response(new ArrayBuffer(0)));
  },
}));

vi.mock('@/app/opds/utils/customHeaders', () => ({
  deserializeOPDSCustomHeaders: vi.fn(() => ({})),
}));

vi.mock('@/services/constants', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  READEST_OPDS_USER_AGENT: 'ReadioTest',
}));

vi.mock('@/libs/payment/stripe/server', () => ({
  createOrUpdatePayment: vi.fn(),
  createOrUpdateSubscription: vi.fn(),
  getStripe: vi.fn(),
}));

vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: vi.fn(),
  supabase: {
    auth: {
      getUser: vi.fn(),
      refreshSession: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock('@/libs/payment/iap/apple/verifier', () => ({
  getAppleIAPVerifier: vi.fn(),
}));

vi.mock('@/libs/payment/iap/apple/server', () => ({
  processPurchaseData: vi.fn(),
}));

vi.mock('@/libs/payment/iap/google/verifier', () => ({
  getGoogleIAPVerifier: vi.fn(),
}));

vi.mock('@/libs/payment/iap/google/server', () => ({
  processPurchaseData: vi.fn(),
}));

const postRequest = (path: string, body: Record<string, unknown> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
    body: JSON.stringify(body),
  });

const getRequest = (path: string) => new NextRequest(`http://localhost${path}`);

const expectDisabledJson = async (response: Response) => {
  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({ error: 'Feature disabled' });
};

describe('disabled feature API routes', () => {
  it('rejects disabled AI API routes before authentication or model calls', async () => {
    await expectDisabledJson(await aiChatPost(postRequest('/api/ai/chat', { messages: [] })));
    await expectDisabledJson(await aiEmbedPost(postRequest('/api/ai/embed', { texts: ['hello'] })));
  });

  it('rejects disabled TTS API routes', async () => {
    await expectDisabledJson(await ttsGet(getRequest('/api/tts/edge')));
    await expectDisabledJson(
      await ttsPost(
        postRequest('/api/tts/edge', { input: 'hello', voice: 'zh-CN-XiaoxiaoNeural' }),
      ),
    );
  });

  it('rejects disabled OPDS proxy routes', async () => {
    await expectDisabledJson(
      await opdsGet(getRequest('/api/opds/proxy?url=https%3A%2F%2Fexample.com')),
    );

    const headResponse = await opdsHead(
      getRequest('/api/opds/proxy?url=https%3A%2F%2Fexample.com'),
    );
    expect(headResponse.status).toBe(404);

    const optionsResponse = await opdsOptions(getRequest('/api/opds/proxy'));
    expect(optionsResponse.status).toBe(404);
  });

  it('rejects disabled commerce API routes', async () => {
    await expectDisabledJson(await stripePlansGet());
    await expectDisabledJson(
      await stripeCheckPost(postRequest('/api/stripe/check', { sessionId: 'cs_123' })),
    );
    await expectDisabledJson(
      await stripeCheckoutPost(postRequest('/api/stripe/checkout', { priceId: 'price_123' })),
    );
    await expectDisabledJson(await stripePortalPost(postRequest('/api/stripe/portal')));
    await expectDisabledJson(await stripeWebhookPost(postRequest('/api/stripe/webhook')));
    await expectDisabledJson(
      await appleIapPost(
        postRequest('/api/apple/iap-verify', {
          transactionId: 'tx_1',
          originalTransactionId: 'tx_original_1',
        }),
      ),
    );
    await expectDisabledJson(
      await googleIapPost(
        postRequest('/api/google/iap-verify', {
          packageName: 'com.bilingify.readest',
          productId: 'monthly',
          orderId: 'order_1',
          purchaseToken: 'purchase_1',
        }),
      ),
    );
  });
});
