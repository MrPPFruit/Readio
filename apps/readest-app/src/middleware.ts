import { NextRequest, NextResponse } from 'next/server';
import { readioFeatures } from '@/config/features';

const allowedOrigins = [
  'https://web.readest.com',
  'https://tauri.localhost',
  'http://tauri.localhost',
  'http://localhost:3000',
  'http://localhost:3001',
  'tauri://localhost',
];

const corsOptions = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

const isDisabledApiPath = (pathname: string) => {
  if (!readioFeatures.ai && pathname.startsWith('/api/ai/')) return true;
  if (!readioFeatures.tts && pathname.startsWith('/api/tts/')) return true;
  if (!readioFeatures.opds && pathname.startsWith('/api/opds/')) return true;
  if (!readioFeatures.commerce && pathname.startsWith('/api/stripe/')) return true;
  if (!readioFeatures.commerce && pathname.startsWith('/api/apple/iap-verify')) return true;
  if (!readioFeatures.commerce && pathname.startsWith('/api/google/iap-verify')) return true;
  return false;
};

export function middleware(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '';
  const isAllowedOrigin = allowedOrigins.includes(origin);

  if (request.method === 'OPTIONS') {
    if (isDisabledApiPath(request.nextUrl.pathname)) {
      return NextResponse.json({ error: 'Feature disabled' }, { status: 404 });
    }

    const preflightHeaders = new Headers({
      ...corsOptions,
      ...(isAllowedOrigin && { 'Access-Control-Allow-Origin': origin }),
    });

    return new NextResponse(null, {
      status: 200,
      headers: preflightHeaders,
    });
  }

  const response = NextResponse.next();

  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }

  Object.entries(corsOptions).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

export const config = {
  matcher: ['/api/:path*', '/api/stripe/:path*', '/api/metadata/:path*'],
};
