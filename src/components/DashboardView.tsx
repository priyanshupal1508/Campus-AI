import { ArrowRight, MessageSquare } from 'lucide-react';
import {
  INSTITUTE_FULL_NAME,
  QUICK_ACCESS_ITEMS,
  SUGGESTED_QUESTIONS,
} from '../data/portalConfig';
import type {
  ChatConversation,
  QuickAccessCategory,
  QuickAccessItem,
  StudentProfile,
} from '../types/portal';
import { ChatInterface } from './ChatInterface';
import { QuickAccessGrid } from './QuickAccessGrid';

interface DashboardViewProps {
  profile: StudentProfile;
  conversations: ChatConversation[];
  activeConversation: ChatConversation;
  isSending: boolean;
  apiBaseUrl: string;
  onSendMessage: (question: string) => void;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenResource: (item: QuickAccessItem) => void;
  onAskAndOpenAssistant: (prompt: string, category?: QuickAccessCategory) => void;
  onOpenApiSettings: () => void;
  onOpenFullAssistant: () => void;
}

export function DashboardView({
  profile,
  conversations,
  activeConversation,
  isSending,
  apiBaseUrl,
  onSendMessage,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onOpenResource,
  onAskAndOpenAssistant,
  onOpenApiSettings,
  onOpenFullAssistant,
}: DashboardViewProps) {
  const greetingName = profile.fullName.trim();

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-wide text-blue-700">
              {INSTITUTE_FULL_NAME}
            </p>
            <h2 className="font-display mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
              {greetingName
                ? `Welcome back, ${greetingName}`
                : 'Welcome to the CampusAI Student Dashboard'}
            </h2>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-600 sm:text-base">
              Access institutional modules for timetables, B.Tech fee structures, departmental syllabi, examinations, and official notices, or start a query in the AI assistant below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenFullAssistant}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>Full-Screen Assistant</span>
            </button>
          </div>
        </div>
      </section>

      {/* Prominent AI Assistant Workspace + Suggested Prompts */}
      <section aria-labelledby="dashboard-assistant-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3
              id="dashboard-assistant-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              CampusAI Assistant
            </h3>
            <p className="text-sm text-slate-500">
              Ask a question directly or pick a common academic prompt
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenFullAssistant}
            className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Expand chat &amp; history</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <ChatInterface
          conversations={conversations}
          activeConversation={activeConversation}
          isSending={isSending}
          apiBaseUrl={apiBaseUrl}
          onSendMessage={onSendMessage}
          onNewChat={onNewChat}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          onOpenApiSettings={onOpenApiSettings}
          compact
        />
      </section>

      {/* Quick-Access Cards Section */}
      <section aria-labelledby="quick-access-heading" className="space-y-4">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h3
              id="quick-access-heading"
              className="font-display text-lg font-semibold text-slate-900"
            >
              Quick Access
            </h3>
            <p className="text-sm text-slate-500">
              Jump directly to institutional resources or query a specific category
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Quick prompts:</span>
            {SUGGESTED_QUESTIONS.slice(0, 2).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onAskAndOpenAssistant(q)}
                className="font-medium text-blue-700 hover:underline cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <QuickAccessGrid
          items={QUICK_ACCESS_ITEMS}
          onOpenResource={onOpenResource}
          onAskQuestion={(prompt, category) => onAskAndOpenAssistant(prompt, category)}
        />
      </section>
    </div>
  );
}
