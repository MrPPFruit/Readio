import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';

import { BookDoc } from '@/libs/document';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import 'overlayscrollbars/overlayscrollbars.css';

import TOCView from './TOCView';
import BooknoteView from './BooknoteView';
import TabNavigation from './TabNavigation';
import ChatHistoryView from './ChatHistoryView';

const SidebarContent: React.FC<{
  bookDoc: BookDoc;
  sideBarBookKey: string;
}> = ({ bookDoc, sideBarBookKey }) => {
  const { setHoveredBookKey } = useReaderStore();
  const { setSideBarVisible } = useSidebarStore();
  const { getConfig, setConfig } = useBookDataStore();
  const { settings } = useSettingsStore();
  const config = getConfig(sideBarBookKey);
  const [activeTab, setActiveTab] = useState(config?.viewSettings?.sideBarTab || 'toc');
  const [fade, setFade] = useState(false);
  const [targetTab, setTargetTab] = useState(activeTab);
  const tabTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = window.innerWidth < 640 || window.innerHeight < 640;
  const aiEnabled = settings?.aiSettings?.enabled ?? false;

  useEffect(() => {
    if (!sideBarBookKey) return;
    const config = getConfig(sideBarBookKey!)!;
    setActiveTab(config.viewSettings!.sideBarTab!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sideBarBookKey]);

  useEffect(() => {
    return () => {
      if (tabTransitionTimeoutRef.current) clearTimeout(tabTransitionTimeoutRef.current);
    };
  }, []);

  // reset to toc if history tab was active but AI is now disabled
  useEffect(() => {
    if ((activeTab === 'history' || targetTab === 'history') && !aiEnabled) {
      if (tabTransitionTimeoutRef.current) {
        clearTimeout(tabTransitionTimeoutRef.current);
        tabTransitionTimeoutRef.current = null;
      }
      setFade(false);
      setActiveTab('toc');
      setTargetTab('toc');
    }
  }, [aiEnabled, activeTab, targetTab]);

  const handleTabChange = (tab: string) => {
    if (tabTransitionTimeoutRef.current) {
      clearTimeout(tabTransitionTimeoutRef.current);
      tabTransitionTimeoutRef.current = null;
    }

    if (activeTab === tab) {
      setFade(false);
      if (isMobile) {
        setHoveredBookKey(sideBarBookKey);
        setSideBarVisible(false);
      }
      return;
    }

    setFade(true);
    tabTransitionTimeoutRef.current = setTimeout(() => {
      setTargetTab(tab);
      setFade(false);
      setConfig(sideBarBookKey!, config);
      tabTransitionTimeoutRef.current = null;
    }, 300);

    setActiveTab(tab);
    const config = getConfig(sideBarBookKey!)!;
    config.viewSettings!.sideBarTab = tab;
  };

  return (
    <>
      <div
        className={clsx(
          'sidebar-content flex h-full min-h-0 flex-grow flex-col shadow-inner',
          'font-sans text-base font-normal sm:text-sm',
        )}
      >
        {targetTab === 'history' ? (
          <div
            className={clsx('min-h-0 flex-1 transition-opacity duration-300 ease-in-out', {
              'opacity-0': fade,
              'opacity-100': !fade,
            })}
          >
            <ChatHistoryView bookKey={sideBarBookKey} />
          </div>
        ) : (
          <OverlayScrollbarsComponent
            className='min-h-0 flex-1'
            options={{
              scrollbars: { autoHide: 'scroll', clickScroll: true },
              showNativeOverlaidScrollbars: false,
            }}
            defer
          >
            <div
              className={clsx(
                'scroll-container h-full transition-opacity duration-300 ease-in-out',
                {
                  'opacity-0': fade,
                  'opacity-100': !fade,
                },
              )}
            >
              {targetTab === 'toc' && bookDoc.toc && (
                <TOCView toc={bookDoc.toc} bookKey={sideBarBookKey} />
              )}
              {targetTab === 'annotations' && (
                <BooknoteView type='annotation' toc={bookDoc.toc ?? []} bookKey={sideBarBookKey} />
              )}
              {targetTab === 'bookmarks' && (
                <BooknoteView type='bookmark' toc={bookDoc.toc ?? []} bookKey={sideBarBookKey} />
              )}
            </div>
          </OverlayScrollbarsComponent>
        )}
      </div>
      <div
        className='flex-shrink-0'
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) / 2)',
        }}
      >
        <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
      </div>
    </>
  );
};

export default SidebarContent;
