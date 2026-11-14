import type { ChatConversation } from '../types/portal';

const CONVERSATIONS_STORAGE_KEY = 'campusai_bgiem_conversations_v2';
const ACTIVE_CONVERSATION_STORAGE_KEY = 'campusai_bgiem_active_conversation_v2';

export function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyConversation(title = 'New Chat'): ChatConversation {
  const now = new Date().toISOString();
  return {
    id: createSessionId(),
    sessionId: createSessionId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function deriveConversationTitle(question: string): string {
  const cleaned = question.trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'New Chat';
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trimEnd()}...` : cleaned;
}

export function loadStoredConversations(): ChatConversation[] {
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is ChatConversation => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<ChatConversation>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.sessionId === 'string' &&
        typeof candidate.title === 'string' &&
        Array.isArray(candidate.messages)
      );
    });
  } catch {
    return [];
  }
}

export function saveStoredConversations(conversations: ChatConversation[]): void {
  try {
    window.localStorage.setItem(
      CONVERSATIONS_STORAGE_KEY,
      JSON.stringify(conversations),
    );
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadActiveConversationId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveConversationId(conversationId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, conversationId);
  } catch {
    // Ignore storage quota errors cleanly
  }
}
