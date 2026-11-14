import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  History,
  MessageSquarePlus,
  Settings,
  Sparkles,
} from 'lucide-react';
import { INSTITUTE_FULL_NAME, SUGGESTED_QUESTIONS } from '../data/portalConfig';
import type { ChatConversation } from '../types/portal';
import { ChatHistorySidebar } from './ChatHistorySidebar';
import { ChatMessageBubble } from './ChatMessageBubble';

interface ChatInterfaceProps {
  conversations: ChatConversation[];
  activeConversation: ChatConversation;
  isSending: boolean;
  apiBaseUrl: string;
  onSendMessage: (question: string) => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenApiSettings: () => void;
  compact?: boolean;
}

export function ChatInterface({
  conversations,
  activeConversation,
  isSending,
  apiBaseUrl,
  onSendMessage,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onOpenApiSettings,
  compact = false,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = activeConversation.messages;

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (messages.length === 0 && !isSending) {
      container.scrollTop = 0;
      return;
    }
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length, isSending, activeConversation.id]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestedClick = (question: string) => {
    if (isSending) return;
    setInput('');
    onSendMessage(question);
    inputRef.current?.focus();
  };

  return (
    <section
      aria-label="CampusAI Assistant Chat"
      className={`flex overflow-hidden rounded-xl border border-slate-200 bg-white ${
        compact
          ? 'h-[520px] sm:h-[560px]'
          : 'h-[calc(100dvh-7.5rem)] min-h-[420px]'
      }`}
    >
      {/* Conversation History Sidebar (Full-page AI Assistant mode) */}
      {!compact && (
        <ChatHistorySidebar
          conversations={conversations}
          activeConversationId={activeConversation.id}
          isSending={isSending}
          onNewChat={onNewChat}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          mobileOpen={mobileHistoryOpen}
          onCloseMobile={() => setMobileHistoryOpen(false)}
        />
      )}

      {/* Active Conversation Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Chat Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {!compact && (
              <button
                type="button"
                onClick={() => setMobileHistoryOpen(true)}
                aria-label="Open conversation history"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden shrink-0 cursor-pointer"
              >
                <History className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-white shrink-0">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </div>

            <div className="min-w-0">
              <h2 className="font-display truncate text-sm font-semibold text-slate-900 sm:text-base">
                {activeConversation.messages.length > 0
                  ? activeConversation.title
                  : 'CampusAI Assistant'}
              </h2>
              <p className="truncate text-xs text-slate-500">
                {INSTITUTE_FULL_NAME}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onNewChat}
              disabled={isSending}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New Chat</span>
            </button>

            <button
              type="button"
              onClick={onOpenApiSettings}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">API Settings</span>
            </button>
          </div>
        </div>

        {/* Messages Viewport */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto overscroll-contain bg-slate-50/60 px-4 py-5 sm:px-6"
        >
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-start py-4 sm:py-6">
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs font-medium text-blue-900">
                Welcome to CampusAI for {INSTITUTE_FULL_NAME}
              </div>

              <h3 className="font-display mt-4 text-xl font-semibold text-slate-900 text-balance sm:text-2xl">
                How can CampusAI assist you today?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Ask questions about timetables, fee structures, college notices, syllabi, or examination schedules for quick, concise answers.
              </p>

              <div className="mt-6 w-full">
                <p className="mb-3 text-xs font-semibold text-slate-500">
                  Suggested questions
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      disabled={isSending}
                      onClick={() => handleSuggestedClick(question)}
                      className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 transition-colors duration-150 hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-900 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
                    >
                      <span>{question}</span>
                      <ArrowUp
                        className="h-4 w-4 rotate-45 text-blue-700 shrink-0"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {messages.map((msg) => (
                <ChatMessageBubble
                  key={msg.id}
                  message={msg}
                  isSending={isSending}
                  onRetry={(q) => onSendMessage(q)}
                  onOpenApiSettings={onOpenApiSettings}
                />
              ))}

              {/* Loading Animation Bubble */}
              {isSending && (
                <div className="flex flex-col items-start" role="status" aria-live="polite">
                  <div className="inline-flex items-center gap-3 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1" aria-hidden="true">
                      <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce" />
                    </span>
                    <span>Waiting for response...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Suggested Prompts Bar during active conversation */}
        {messages.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-100 bg-white px-4 py-2.5">
            <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
              Suggestions:
            </span>
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSuggestedClick(q)}
                disabled={isSending}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Message Composer */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-slate-200 bg-white p-3.5"
        >
          <div className="flex items-end gap-2.5">
            <label htmlFor={`chat-input-${compact ? 'compact' : 'full'}`} className="sr-only">
              Ask CampusAI a question
            </label>
            <textarea
              id={`chat-input-${compact ? 'compact' : 'full'}`}
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question (Enter to send, Shift+Enter for new line)..."
              className="min-h-[44px] max-h-36 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="inline-flex h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Send</span>
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
