export type AIBookSearchSource =
  | 'gutendex'
  | 'open-library'
  | 'github'
  | 'internet-archive'
  | 'aggregation';
export type AIBookFormat = 'epub' | 'pdf' | 'mobi' | 'txt' | 'html';
export type AIBookSearchRisk =
  | 'direct-open'
  | 'external-warning'
  | 'aggregation-external'
  | 'blocked';
export type AIBookSearchTier = 1 | 2;
export type AIBookAvailability = 'downloadable' | 'read-online' | 'external-search' | 'unknown';

export interface AIBookIntentBook {
  titleZh?: string;
  titleEn?: string;
  author?: string;
}

export interface AIBookSearchQueries {
  openLibrary: string;
  archive: string;
  github: string;
}

export interface AIBookSearchIntent {
  query: string;
  title?: string;
  author?: string;
  language?: 'zh' | 'en' | 'both';
  formats?: AIBookFormat[];
  publicDomainOnly?: boolean;
  books: AIBookIntentBook[];
  searchQueries: AIBookSearchQueries;
}

export interface AIBookDownloadLink {
  format: AIBookFormat;
  url: string;
  mimeType?: string;
  filename?: string;
  risk?: AIBookSearchRisk;
  source?: AIBookSearchSource;
}

export interface AIBookSourceLink {
  source: AIBookSearchSource;
  url: string;
  label?: string;
  risk: AIBookSearchRisk;
  format?: AIBookFormat;
}

export interface AIBookSearchResult {
  id: string;
  title: string;
  authors: string[];
  source: AIBookSearchSource;
  description?: string;
  language?: string;
  year?: number;
  licenseLabel?: string;
  risk: AIBookSearchRisk;
  tier?: AIBookSearchTier;
  coverUrl?: string;
  formats?: AIBookFormat[];
  score?: number;
  aiScore?: number;
  aiReason?: string;
  sourceLinks: AIBookSourceLink[];
  availability?: AIBookAvailability;
  matchedQuery?: string;
  isPublicDomain?: boolean;
  downloadLinks: AIBookDownloadLink[];
  externalUrl: string;
}

export type AIBookSearchProgressStep =
  | 'intent'
  | 'tier1-sources'
  | 'ai-scoring'
  | 'tier2-sources'
  | 'dedupe'
  | 'done'
  | 'error';

export interface AIBookSearchProgressEvent {
  step: AIBookSearchProgressStep;
  message: string;
  source?: AIBookSearchSource;
  timestamp?: number;
}

export interface AIBookSearchOptions {
  onProgress?: (event: AIBookSearchProgressEvent) => void;
  initialIntent?: AIBookSearchIntent;
}

export interface AIBookSearchResponse {
  intent: AIBookSearchIntent;
  results: AIBookSearchResult[];
}

export interface AIBookSearchHistoryRecord {
  id: string;
  query: string;
  normalizedQuery: string;
  createdAt: number;
  updatedAt: number;
  resultCount: number;
  results: AIBookSearchResult[];
  intent: AIBookSearchIntent | null;
  selectedSource: AIBookSearchSource | 'all';
  deepSearchStatus: 'idle' | 'done';
  progressSummary: AIBookSearchProgressEvent[];
  schemaVersion: 1;
}
