import type { AIBookSearchIntent, AIBookSearchResult, AIBookSearchSource } from './types';
import { searchGitHubBooks } from './sources/github';
import { searchGutendex } from './sources/gutendex';
import { searchInternetArchive } from './sources/internetArchive';
import { searchOpenLibrary } from './sources/openLibrary';

export interface AIBookSourceAdapter {
  id: AIBookSearchSource;
  tier: 1 | 2;
  search: (intent: AIBookSearchIntent) => Promise<AIBookSearchResult[]>;
}

export const TIER1_AIBOOK_SOURCE_ADAPTERS: AIBookSourceAdapter[] = [
  { id: 'open-library', tier: 1, search: searchOpenLibrary },
  { id: 'github', tier: 1, search: searchGitHubBooks },
  { id: 'gutendex', tier: 1, search: searchGutendex },
];

export const TIER2_AIBOOK_SOURCE_ADAPTERS: AIBookSourceAdapter[] = [
  { id: 'internet-archive', tier: 2, search: searchInternetArchive },
];
