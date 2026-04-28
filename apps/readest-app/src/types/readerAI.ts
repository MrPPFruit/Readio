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

export interface ReaderAIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export type ReaderAIMode = 'closed' | 'ask' | 'answer' | 'error';
