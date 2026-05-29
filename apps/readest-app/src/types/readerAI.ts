export type ReaderAIEntrySource = 'selection' | 'control';

export interface ReaderAISelectionContext {
  text: string;
  cfi?: string;
  page?: number;
  index?: number;
}

export interface ReaderAIOpenEventPayload {
  bookKey: string;
  source: ReaderAIEntrySource;
  selection?: ReaderAISelectionContext;
}

export interface ReaderAIHistoryOpenEventPayload {
  bookKey: string;
  conversationId: string;
}

export interface ReaderAIContext {
  bookKey: string;
  bookHash: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  sectionLabel?: string;
  source: ReaderAIEntrySource;
  selection?: ReaderAISelectionContext;
}

export interface ReaderAISourceHighlightSpan {
  start: number;
  end: number;
  quote: string;
  source: 'chunk' | 'reviewer';
}

export interface ReaderAISource {
  id: string;
  chapterTitle: string;
  pageNumber?: number;
  sectionIndex?: number;
  sortIndex?: number;
  chunkIndex?: number;
  startOffset?: number;
  endOffset?: number;
  cfi?: string;
  href?: string;
  snippet?: string;
  contextText?: string;
  previewText?: string;
  previewStartOffset?: number;
  highlightSpans?: ReaderAISourceHighlightSpan[];
  atSpoilerBoundary?: boolean;
  confidence: 'exact' | 'section' | 'approximate';
}

export type ReaderAIGenerationStatus =
  | 'idle'
  | 'indexing'
  | 'retrieving'
  | 'connecting'
  | 'generating'
  | 'timeout'
  | 'error';

export interface ReaderAIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  quotedText?: string;
  sources?: ReaderAISource[];
  createdAt: number;
}

export type ReaderAIMode = 'closed' | 'ask' | 'answer' | 'error';
