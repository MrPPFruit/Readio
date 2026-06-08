import type { EmbeddingModel, LanguageModel } from 'ai';
import type { ReaderAISource } from '@/types/readerAI';

export type AIProviderName =
  | 'openrouter'
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'dashscope'
  | 'kimi'
  | 'mimo'
  | 'custom-openai-compatible';

export type AIProviderProtocol = 'openai-compatible';

export interface AIProviderModelPreset {
  id: string;
  label: string;
}

export interface AIProviderChatRequestOptions {
  thinking?: { type: 'enabled' | 'disabled' };
  reasoning_effort?: 'high' | 'max';
}

export interface AIProviderCatalogEntry {
  id: AIProviderName;
  label: string;
  protocol: AIProviderProtocol;
  baseUrl: string;
  apiKeyUrl: string;
  apiKeyPlaceholder: string;
  defaultModel: string;
  modelPresets: AIProviderModelPreset[];
  chatRequestOptions?: AIProviderChatRequestOptions;
}

export interface AIProvider {
  id: AIProviderName;
  name: string;
  requiresAuth: boolean;

  getModel(): LanguageModel;
  getEmbeddingModel(): EmbeddingModel;

  isAvailable(): Promise<boolean>;
  healthCheck(): Promise<boolean>;
}

export interface AISettings {
  enabled: boolean;
  showReaderAIEntrypoints: boolean;
  provider: AIProviderName;

  providerApiKeys: Partial<Record<AIProviderName, string>>;
  providerModels: Partial<Record<AIProviderName, string>>;
  providerEmbeddingModels?: Partial<Record<AIProviderName, string>>;
  customProviderBaseUrl?: string;
  allowUnsafeCustomProviderBaseUrl?: boolean;

  spoilerProtection: boolean;
  maxContextChunks: number;
  indexingMode: 'on-demand' | 'background';
}

export interface TextChunk {
  id: string;
  bookHash: string;
  sectionIndex: number;
  chapterTitle: string;
  text: string;
  embedding?: number[];
  pageNumber: number; // legacy character-estimated page number, not current reader layout page
  sortIndex?: number;
  startOffset?: number;
  endOffset?: number;
  charCount?: number;
  endPageNumber?: number;
  chunkIndex?: number;
  cfi?: string;
  href?: string;
}

export interface ScoredChunk extends TextChunk {
  score: number;
  searchMethod: 'bm25' | 'vector' | 'hybrid';
}

export type EntitySidecarConfidence = 'high' | 'medium';

export type EntitySidecarHitType = 'alias' | 'fact';

export interface EntityAliasRecord {
  text: string;
  normalizedText: string;
  chunkId: string;
  sectionIndex: number;
  pageNumber: number;
  confidence: EntitySidecarConfidence;
}

export interface EntityFactRecord {
  id: string;
  chunkId: string;
  sectionIndex: number;
  pageNumber: number;
  endPageNumber?: number;
  sortIndex?: number;
  text: string;
}

export interface EntitySidecarEntity {
  id: string;
  canonicalName: string;
  aliases: EntityAliasRecord[];
  facts: EntityFactRecord[];
}

export interface EntitySidecarMeta {
  version: number;
  aliasCount: number;
  factCount: number;
  chunkCount: number;
  createdAt: number;
}

export interface EntitySidecarIndex {
  bookHash: string;
  entities: EntitySidecarEntity[];
  meta: EntitySidecarMeta;
}

export interface EntitySidecarHit {
  chunkId: string;
  entityId: string;
  hitType: EntitySidecarHitType;
  score: number;
  sectionIndex: number;
  pageNumber: number;
  endPageNumber?: number;
  sortIndex?: number;
  aliases: string[];
}

export interface BookIndexMeta {
  bookHash: string;
  bookTitle: string;
  authorName: string;
  totalSections: number;
  totalChunks: number;
  embeddingModel: string;
  indexVersion: number;
  chunkerVersion: number;
  bm25Version: number;
  estimatedBytes: number;
  lastUpdated: number;
}

export interface IndexingState {
  bookHash: string;
  status: 'idle' | 'indexing' | 'complete' | 'error';
  progress: number;
  chunksProcessed: number;
  totalChunks: number;
  error?: string;
}

export interface EmbeddingProgress {
  current: number;
  total: number;
  phase: 'chunking' | 'embedding' | 'indexing';
}

// stored AI conversation for a book
export interface AIConversation {
  id: string;
  bookHash: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  favoritedAt?: number;
  archivedAt?: number;
}

// single message in an AI conversation
export interface AIMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  quotedText?: string;
  sources?: ReaderAISource[];
  createdAt: number;
}
