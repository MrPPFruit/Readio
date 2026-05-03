import { create } from 'zustand';
import { AIConversation, AIMessage } from '@/services/ai/types';
import { aiStore } from '@/services/ai/storage/aiStore';

interface AIChatState {
  activeConversationId: string | null;
  conversations: AIConversation[];
  messages: AIMessage[];
  isLoadingHistory: boolean;
  currentBookHash: string | null;
  historyError: string | null;

  loadConversations: (bookHash: string) => Promise<void>;
  setActiveConversation: (id: string | null) => Promise<void>;
  createConversation: (bookHash: string, title: string) => Promise<string>;
  addMessage: (message: Omit<AIMessage, 'id' | 'createdAt'>) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  toggleFavoriteConversation: (id: string) => Promise<void>;
  archiveConversation: (id: string) => Promise<void>;
  favoriteConversations: (ids: string[]) => Promise<void>;
  archiveConversations: (ids: string[]) => Promise<void>;
  deleteConversations: (ids: string[]) => Promise<void>;
  clearActiveConversation: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  activeConversationId: null,
  conversations: [],
  messages: [],
  isLoadingHistory: false,
  currentBookHash: null,
  historyError: null,

  loadConversations: async (bookHash: string) => {
    if (get().currentBookHash === bookHash && get().conversations.length > 0) {
      return;
    }
    set({ isLoadingHistory: true, historyError: null });
    try {
      const conversations = await aiStore.getConversations(bookHash);
      set({
        conversations,
        currentBookHash: bookHash,
        isLoadingHistory: false,
        historyError: null,
      });
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  setActiveConversation: async (id: string | null) => {
    if (id === null) {
      set({ activeConversationId: null, messages: [], historyError: null });
      return;
    }
    set({ isLoadingHistory: true, historyError: null });
    try {
      const messages = await aiStore.getMessages(id);
      set({
        activeConversationId: id,
        messages,
        isLoadingHistory: false,
        historyError: null,
      });
    } catch {
      set({
        activeConversationId: id,
        messages: [],
        isLoadingHistory: false,
        historyError: 'Unable to load conversation history',
      });
    }
  },

  createConversation: async (bookHash: string, title: string) => {
    const id = generateId();
    const now = Date.now();
    const conversation: AIConversation = {
      id,
      bookHash,
      title: title.slice(0, 50) || 'New conversation',
      createdAt: now,
      updatedAt: now,
    };
    await aiStore.saveConversation(conversation);
    const conversations = await aiStore.getConversations(bookHash);
    set({
      conversations,
      activeConversationId: id,
      messages: [],
      currentBookHash: bookHash,
    });
    return id;
  },

  addMessage: async (message: Omit<AIMessage, 'id' | 'createdAt'>) => {
    const id = generateId();
    const fullMessage: AIMessage = {
      ...message,
      id,
      createdAt: Date.now(),
    };
    await aiStore.saveMessage(fullMessage);

    // update conversation updatedAt
    const { activeConversationId, currentBookHash } = get();
    if (activeConversationId && currentBookHash) {
      const conversations = get().conversations;
      const conv = conversations.find((c) => c.id === activeConversationId);
      if (conv) {
        conv.updatedAt = Date.now();
        await aiStore.saveConversation(conv);
      }
    }

    set((state) => ({
      messages: [...state.messages, fullMessage],
    }));
  },

  deleteConversation: async (id: string) => {
    const { currentBookHash, activeConversationId } = get();
    await aiStore.deleteConversation(id);

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({
        conversations,
        ...(activeConversationId === id ? { activeConversationId: null, messages: [] } : {}),
      });
    }
  },

  renameConversation: async (id: string, title: string) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const { currentBookHash } = get();
    await aiStore.updateConversationTitle(id, trimmedTitle);

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({ conversations });
    }
  },

  toggleFavoriteConversation: async (id: string) => {
    const { currentBookHash, conversations } = get();
    const conversation = conversations.find((item) => item.id === id);
    await aiStore.updateConversationFavorite(
      id,
      conversation?.favoritedAt ? undefined : Date.now(),
    );

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({ conversations });
    }
  },

  archiveConversation: async (id: string) => {
    const { currentBookHash, activeConversationId } = get();
    await aiStore.updateConversationArchived(id, Date.now());

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({
        conversations,
        ...(activeConversationId === id
          ? { activeConversationId: null, messages: [], historyError: null }
          : {}),
      });
    }
  },

  favoriteConversations: async (ids: string[]) => {
    const { currentBookHash } = get();
    const favoritedAt = Date.now();
    await Promise.all(ids.map((id) => aiStore.updateConversationFavorite(id, favoritedAt)));

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({ conversations });
    }
  },

  archiveConversations: async (ids: string[]) => {
    const { currentBookHash, activeConversationId } = get();
    const archivedAt = Date.now();
    await Promise.all(ids.map((id) => aiStore.updateConversationArchived(id, archivedAt)));

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({
        conversations,
        ...(activeConversationId && ids.includes(activeConversationId)
          ? { activeConversationId: null, messages: [], historyError: null }
          : {}),
      });
    }
  },

  deleteConversations: async (ids: string[]) => {
    const { currentBookHash, activeConversationId } = get();
    await Promise.all(ids.map((id) => aiStore.deleteConversation(id)));

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({
        conversations,
        ...(activeConversationId && ids.includes(activeConversationId)
          ? { activeConversationId: null, messages: [], historyError: null }
          : {}),
      });
    }
  },

  clearActiveConversation: () => {
    set({ activeConversationId: null, messages: [], historyError: null });
  },
}));
