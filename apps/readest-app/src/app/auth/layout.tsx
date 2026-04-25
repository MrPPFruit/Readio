'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readioFeatures } from '@/config/features';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!readioFeatures.auth) {
      router.replace('/library');
    }
  }, [router]);

  if (!readioFeatures.auth) return null;

  return <>{children}</>;
}
