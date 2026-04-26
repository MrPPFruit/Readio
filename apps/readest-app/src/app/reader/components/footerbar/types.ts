import { TOCItem } from '@/libs/document';
import { PageInfo } from '@/types/book';
import { Insets } from '@/types/misc';

export interface FooterBarProps {
  bookKey: string;
  bookFormat: string;
  section?: PageInfo;
  pageinfo?: PageInfo;
  toc?: TOCItem[];
  isHoveredAnim: boolean;
  gridInsets: Insets;
}

export interface NavigationHandlers {
  onPrevPage: () => void;
  onNextPage: () => void;
  onPrevSection: () => void;
  onNextSection: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onProgressChange: (value: number) => void;
}

export interface FooterBarChildProps {
  bookKey: string;
  navigationHandlers: NavigationHandlers;
  progressFraction: number;
  progressValid: boolean;
  getProgressPreview?: (value: number) =>
    | {
        sectionLabel: string;
        pageLabel: string;
      }
    | undefined;
  gridInsets: Insets;
  actionTab: string;
  forceMobileLayout: boolean;
  onSetActionTab: (tab: string) => void;
  onSpeakText: () => void;
  ttsEnabled: boolean;
}
