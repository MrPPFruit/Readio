import { describe, expect, it } from 'vitest';

import type { AIConversation } from '@/services/ai/types';
import { sortConversations } from '@/services/ai/storage/aiStore';

describe('sortConversations', () => {
  it('keeps favorites first and then sorts by conversation updatedAt', () => {
    const oldFavorite: AIConversation = {
      id: 'old-favorite',
      bookHash: 'book',
      title: 'Old favorite',
      createdAt: 100,
      updatedAt: 200,
      favoritedAt: 1000,
    };
    const recentFavorite: AIConversation = {
      id: 'recent-favorite',
      bookHash: 'book',
      title: 'Recent favorite',
      createdAt: 100,
      updatedAt: 400,
      favoritedAt: 500,
    };
    const recentNormal: AIConversation = {
      id: 'recent-normal',
      bookHash: 'book',
      title: 'Recent normal',
      createdAt: 100,
      updatedAt: 500,
    };

    expect(
      sortConversations([oldFavorite, recentNormal, recentFavorite]).map((item) => item.id),
    ).toEqual(['recent-favorite', 'old-favorite', 'recent-normal']);
  });
});
