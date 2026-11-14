import { useMemo, useState } from 'react';
import { FolderOpen, MessageSquare, Search } from 'lucide-react';
import { INSTITUTE_FULL_NAME, QUICK_ACCESS_ITEMS } from '../data/portalConfig';
import type { QuickAccessCategory } from '../types/portal';

interface ResourcesViewProps {
  selectedCategory: QuickAccessCategory | 'all';
  onSelectCategory: (category: QuickAccessCategory | 'all') => void;
  onAskQuestion: (prompt: string, category: QuickAccessCategory) => void;
}

const RESOURCE_CATEGORIES = QUICK_ACCESS_ITEMS.filter(
  (item) => item.id !== 'college-notices',
);

export function ResourcesView({
  selectedCategory,
  onSelectCategory,
  onAskQuestion,
}: ResourcesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return RESOURCE_CATEGORIES.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' || item.id === selectedCategory;
      const matchesSearch =
        !query ||
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-xl font-bold text-slate-900">
          Academic Resources
        </h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Structured academic resource directories for {INSTITUTE_FULL_NAME}. Select a module below to explore available records or query CampusAI directly.
        </p>

        {/* Interactive Filter Tabs + Search */}
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label="Filter academic resource category"
            className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'all'}
              onClick={() => onSelectCategory('all')}
              className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-white text-blue-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Resources
            </button>
            {RESOURCE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-white text-blue-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat.title}
              </button>
            ))}
          </div>

          <div className="relative w-full lg:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <label htmlFor="resource-search" className="sr-only">
              Search resource categories
            </label>
            <input
              id="resource-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter resource categories..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <FolderOpen className="mx-auto h-9 w-9 text-slate-400" aria-hidden="true" />
          <h3 className="font-display mt-3 text-base font-semibold text-slate-900">
            No matching resource categories
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Clear your search filter or reset to view all academic resource sections.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              onSelectCategory('all');
            }}
            className="mt-4 inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleItems.map((item) => (
            <section
              key={item.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {item.title}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Academic Directory
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.description}
                </p>

                <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-500">
                  Official {item.title.toLowerCase()} circulars and PDF documents can be uploaded via Admin Documents or queried directly through CampusAI.
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => onAskQuestion(item.suggestedPrompt, item.id)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Ask CampusAI about {item.title}</span>
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
