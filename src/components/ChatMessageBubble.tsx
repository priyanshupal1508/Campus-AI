import type { ReactNode } from 'react';
import { AlertCircle, RotateCw, Settings } from 'lucide-react';
import type { ChatMessage } from '../types/portal';

interface ChatMessageBubbleProps {
  message: ChatMessage;
  isSending: boolean;
  onRetry?: (question: string) => void;
  onOpenApiSettings: () => void;
}

function renderInlineBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function FormattedAssistantContent({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`${keyPrefix}-ul`} className="my-1.5 list-disc space-y-1 pl-5">
        {listItems.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInlineBold(item)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    const bulletMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)$/);

    if (bulletMatch) {
      listItems.push(bulletMatch[1]);
      return;
    }

    flushList(`line-${idx}`);

    if (!trimmed) {
      return;
    }

    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        <p key={`h-${idx}`} className="mt-2 first:mt-0 font-semibold text-slate-900">
          {renderInlineBold(headingMatch[1])}
        </p>,
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="mt-1.5 first:mt-0 leading-relaxed">
        {renderInlineBold(trimmed)}
      </p>,
    );
  });

  flushList('end');

  return <div className="space-y-1">{blocks}</div>;
}

export function ChatMessageBubble({
  message,
  isSending,
  onRetry,
  onOpenApiSettings,
}: ChatMessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = !isUser && message.status === 'error';

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[92%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'rounded-br-sm bg-blue-700 text-white'
            : isError
              ? 'rounded-bl-sm border border-rose-200 bg-rose-50/70 text-slate-900'
              : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'
        }`}
      >
        {isError && (
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Connection error</span>
          </div>
        )}

        {isUser || isError ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <FormattedAssistantContent content={message.content} />
        )}

        {/* Error recovery actions */}
        {isError && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-rose-200/80 pt-2.5">
            {message.retryQuestion && onRetry && (
              <button
                type="button"
                disabled={isSending}
                onClick={() => onRetry(message.retryQuestion!)}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-white border border-rose-200 px-3 py-1 text-xs font-medium text-rose-800 transition-colors hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Retry request</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenApiSettings}
              className="inline-flex min-h-[32px] items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-blue-800 hover:underline cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Check API Settings</span>
            </button>
          </div>
        )}
      </div>

      <span className="mt-1 px-1 text-[11px] text-slate-400 tabular-nums">
        {isUser ? 'You' : 'CampusAI'} · {message.timestamp}
      </span>
    </div>
  );
}
