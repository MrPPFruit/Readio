'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { readioFeatures } from '@/config/features';

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!readioFeatures.auth && !readioFeatures.commerce) {
      router.replace('/library');
    }
  }, [router]);

  if (!readioFeatures.auth && !readioFeatures.commerce) return null;

  return <>{children}</>;
}
