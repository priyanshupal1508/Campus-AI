import { MessageSquarePlus, MessagesSquare, Trash2, X } from 'lucide-react';
import type { ChatConversation } from '../types/portal';

interface ChatHistorySidebarProps {
  conversations: ChatConversation[];
  activeConversationId: string;
  isSending: boolean;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

function formatConversationDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ChatHistorySidebar({
  conversations,
  activeConversationId,
  isSending,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  mobileOpen = false,
  onCloseMobile,
}: ChatHistorySidebarProps) {
  const listContent = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5">
        <span className="font-display text-sm font-semibold text-slate-900">
          Conversations
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onCloseMobile?.();
            }}
            disabled={isSending}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New Chat</span>
          </button>

          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close conversation history"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <MessagesSquare className="mx-auto h-7 w-7 text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-xs text-slate-500">No saved conversations yet.</p>
          </div>
        ) : (
          <ul className="space-y-1" aria-label="Chat history list">
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const messageCount = conv.messages.length;
              return (
                <li
                  key={conv.id}
                  className={`group flex items-center justify-between gap-1 rounded-lg border transition-colors ${
                    isActive
                      ? 'border-blue-200 bg-blue-50/70'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConversation(conv.id);
                      onCloseMobile?.();
                    }}
                    className="min-w-0 flex-1 px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded-lg cursor-pointer"
                  >
                    <p
                      className={`truncate text-xs font-medium ${
                        isActive ? 'text-blue-900' : 'text-slate-800'
                      }`}
                    >
                      {conv.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums">
                      <span>
                        {messageCount} {messageCount === 1 ? 'msg' : 'msgs'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatConversationDate(conv.updatedAt)}</span>
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteConversation(conv.id)}
                    aria-label={`Delete conversation ${conv.title}`}
                    className="mr-1.5 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        aria-label="Conversation history"
        className="hidden w-64 shrink-0 border-r border-slate-200 md:block lg:w-72"
      >
        {listContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            aria-label="Mobile conversation history"
            className="relative z-10 h-full w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-lg"
          >
            {listContent}
          </aside>
        </div>
      )}
    </>
  );
}
