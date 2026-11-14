import {
  ArrowRight,
  BellRing,
  BookOpenText,
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  MessageSquare,
  ReceiptIndianRupee,
} from 'lucide-react';
import type { QuickAccessCategory, QuickAccessItem } from '../types/portal';

interface QuickAccessGridProps {
  items: readonly QuickAccessItem[];
  onOpenResource: (item: QuickAccessItem) => void;
  onAskQuestion: (prompt: string, category: QuickAccessCategory) => void;
  columns?: 2 | 3;
}

function CategoryIcon({ category }: { category: QuickAccessCategory }) {
  const iconClass = 'w-5 h-5';
  switch (category) {
    case 'timetable':
      return <CalendarClock className={iconClass} aria-hidden="true" />;
    case 'fee-structure':
      return <ReceiptIndianRupee className={iconClass} aria-hidden="true" />;
    case 'syllabus':
      return <BookOpenText className={iconClass} aria-hidden="true" />;
    case 'examination':
      return <ClipboardCheck className={iconClass} aria-hidden="true" />;
    case 'college-notices':
      return <BellRing className={iconClass} aria-hidden="true" />;
    case 'admission-info':
      return <GraduationCap className={iconClass} aria-hidden="true" />;
  }
}

export function QuickAccessGrid({
  items,
  onOpenResource,
  onAskQuestion,
  columns = 3,
}: QuickAccessGridProps) {
  const gridCols =
    columns === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';

  return (
    <div className={`grid ${gridCols} gap-4`}>
      {items.map((item) => (
        <article
          key={item.id}
          className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 transition-colors duration-150 hover:border-blue-300"
        >
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <CategoryIcon category={item.id} />
              </div>
              <span className="text-xs font-medium text-slate-400">
                Portal Module
              </span>
            </div>

            <h3 className="font-display text-base font-semibold text-slate-900">
              {item.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              {item.description}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => onOpenResource(item)}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-sm font-medium text-blue-700 transition-colors hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Open module</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onAskQuestion(item.suggestedPrompt, item.id)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ask CampusAI</span>
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
