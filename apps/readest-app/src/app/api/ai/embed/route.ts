import { NextResponse } from 'next/server';

export async function POST(): Promise<Response> {
  return NextResponse.json({ error: 'Feature disabled' }, { status: 404 });
}
