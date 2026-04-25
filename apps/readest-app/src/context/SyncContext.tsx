'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { readioFeatures } from '@/config/features';
import { SyncClient } from '@/libs/sync';

const createSyncClient = () => {
  if (!readioFeatures.cloudSync) return null;
  return new SyncClient();
};

interface SyncContextType {
  syncClient: SyncClient | null;
}

const SyncContext = createContext<SyncContextType>({ syncClient: null });

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useMemo(() => ({ syncClient: createSyncClient() }), []);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export const useSyncContext = () => useContext(SyncContext);
