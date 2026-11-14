import { useState } from 'react';
import { BellOff, MessageSquare, Search } from 'lucide-react';
import { INSTITUTE_FULL_NAME } from '../data/portalConfig';

interface NoticesViewProps {
  onAskAboutNotices: () => void;
}

type NoticeCategory = 'all' | 'examination' | 'academic' | 'admission' | 'general';

const NOTICE_FILTERS: { id: NoticeCategory; label: string }[] = [
  { id: 'all', label: 'All Notices' },
  { id: 'examination', label: 'Examination' },
  { id: 'academic', label: 'Academic' },
  { id: 'admission', label: 'Admission' },
  { id: 'general', label: 'General' },
];

export function NoticesView({ onAskAboutNotices }: NoticesViewProps) {
  const [activeFilter, setActiveFilter] = useState<NoticeCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              College Notices &amp; Circulars
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Official announcements for {INSTITUTE_FULL_NAME}.
            </p>
          </div>

          <button
            type="button"
            onClick={onAskAboutNotices}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span>Ask about examination notices</span>
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label="Filter notices by category"
            className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 p-1"
          >
            {NOTICE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeFilter === filter.id
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <label htmlFor="notices-search" className="sr-only">
              Search notices
            </label>
            <input
              id="notices-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notice titles..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Empty Notices State */}
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <BellOff className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="font-display mt-4 text-lg font-semibold text-slate-900">
          No notices published
        </h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
          {activeFilter === 'all'
            ? 'Official notices and circulars from Baderia Global Institute of Engineering & Management, Jabalpur will appear here once published by the administration.'
            : `No ${activeFilter} circulars are currently published in this category.`}
        </p>

        {searchQuery.trim() && (
          <p className="mt-2 text-xs text-slate-400">
            Active search filter: &ldquo;{searchQuery}&rdquo;
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onAskAboutNotices}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span>Query CampusAI Assistant</span>
          </button>
          {(activeFilter !== 'all' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setActiveFilter('all');
                setSearchQuery('');
              }}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
