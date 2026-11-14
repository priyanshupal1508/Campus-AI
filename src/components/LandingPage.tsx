import { useState } from 'react';
import { ArrowRight, Building2, Layers, Menu, MessageSquare, ShieldCheck, X } from 'lucide-react';
import {
  INSTITUTE_FULL_NAME,
  INSTITUTE_LOCATION,
  INSTITUTE_NAME,
  QUICK_ACCESS_ITEMS,
  SUGGESTED_QUESTIONS,
} from '../data/portalConfig';
import type { PortalRoute, QuickAccessCategory, QuickAccessItem } from '../types/portal';
import { BrandMark } from './BrandMark';
import { QuickAccessGrid } from './QuickAccessGrid';

interface LandingPageProps {
  onEnterPortal: (route: Exclude<PortalRoute, 'landing'>, filter?: QuickAccessCategory) => void;
  onAskFromLanding: (prompt: string, category?: QuickAccessCategory) => void;
}

const HERO_IMAGE_SRC = '/assets/aistudio/building__1__73391e85.webp';

export function LandingPage({ onEnterPortal, onAskFromLanding }: LandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleOpenResourceFromLanding = (item: QuickAccessItem) => {
    onEnterPortal(item.targetRoute, item.resourceFilter);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Top Navigation Bar — 3-Zone Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Brand wordmark only */}
          <BrandMark onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

          {/* Zone 2: 4 single-line navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a
              href="#overview"
              className="hover:text-blue-700 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Overview
            </a>
            <a
              href="#quick-access"
              className="hover:text-blue-700 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Quick Access
            </a>
            <a
              href="#assistant-preview"
              className="hover:text-blue-700 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              AI Assistant
            </a>
            <a
              href="#architecture"
              className="hover:text-blue-700 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Architecture
            </a>
          </nav>

          {/* Zone 3: Single primary CTA + mobile drawer toggle */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onEnterPortal('dashboard')}
              className="hidden sm:inline-flex min-h-[40px] items-center justify-center rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Student Portal
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 md:hidden cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Drawer Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <nav aria-label="Mobile Navigation" className="flex flex-col gap-2">
              <a
                href="#overview"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Overview
              </a>
              <a
                href="#quick-access"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Quick Access
              </a>
              <a
                href="#assistant-preview"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                AI Assistant
              </a>
              <a
                href="#architecture"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Architecture
              </a>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onEnterPortal('dashboard');
                }}
                className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 cursor-pointer"
              >
                Open Student Portal
              </button>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* Hero Section */}
        <section id="overview" className="border-b border-slate-200 bg-slate-50/70">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12 lg:gap-12">
              <div className="flex flex-col justify-center lg:col-span-6">
                <p className="text-sm font-medium text-blue-700">
                  {INSTITUTE_NAME} · {INSTITUTE_LOCATION}
                </p>

                <h1 className="font-display mt-3 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl text-balance leading-[1.12]">
                  Centralized Academic Portal &amp; AI Assistant
                </h1>

                <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                  CampusAI brings together timetables, fee structures, departmental syllabi, examination updates, and college notices into a unified student workspace built for fast institutional search.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onEnterPortal('dashboard')}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Launch Student Dashboard</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onEnterPortal('assistant')}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:border-blue-300 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <span>Open AI Assistant</span>
                  </button>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-6 text-xs font-medium text-slate-500">
                  <span>Official Student Portal</span>
                  <span aria-hidden="true">·</span>
                  <span>Six Institutional Modules</span>
                  <span aria-hidden="true">·</span>
                  <span>Document-Grounded Assistant</span>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="h-full min-h-[260px] overflow-hidden rounded-2xl border border-slate-200 bg-blue-50">
                  {!imageError ? (
                    <img
                      src={HERO_IMAGE_SRC}
                      alt="Baderia Global Institute of Engineering & Management, Jabalpur campus building and front lawn"
                      referrerPolicy="no-referrer"
                      onError={() => setImageError(true)}
                      className="h-full w-full object-cover aspect-video lg:aspect-auto"
                    />
                  ) : (
                    <div className="flex h-full min-h-[280px] flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-100 p-8 text-center">
                      <Building2 className="h-12 w-12 text-blue-700" aria-hidden="true" />
                      <p className="font-display mt-3 text-base font-semibold text-slate-900">
                        {INSTITUTE_NAME}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        CampusAI Student Portal · {INSTITUTE_LOCATION}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Quick-Access Portal Modules */}
        <section id="quick-access" className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold tracking-wide text-blue-700">
                  Student Portal Modules
                </p>
                <h2 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
                  Direct access to core academic information
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onEnterPortal('resources')}
                className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Browse all academic resources</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-8">
              <QuickAccessGrid
                items={QUICK_ACCESS_ITEMS}
                onOpenResource={handleOpenResourceFromLanding}
                onAskQuestion={(prompt, category) => onAskFromLanding(prompt, category)}
              />
            </div>
          </div>
        </section>

        {/* AI Assistant Suggested Prompts Showcase */}
        <section id="assistant-preview" className="border-b border-slate-200 bg-slate-50/70">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
              <div className="lg:col-span-5">
                <p className="text-xs font-semibold tracking-wide text-blue-700">
                  CampusAI Assistant
                </p>
                <h2 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
                  Natural-language queries grounded in institutional documents
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
                  Select any common student question to open the interactive chat interface and receive clear answers backed by official institutional documents.
                </p>
                <button
                  type="button"
                  onClick={() => onEnterPortal('assistant')}
                  className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Open AI Assistant Workspace</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="lg:col-span-7">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <span className="font-display text-sm font-semibold text-slate-900">
                      Suggested Student Questions
                    </span>
                    <span className="text-xs text-slate-400">
                      Click to ask in chat
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {SUGGESTED_QUESTIONS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => onAskFromLanding(question)}
                        className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-left text-sm font-medium text-slate-800 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
                      >
                        <span>{question}</span>
                        <ArrowRight className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Platform Architecture */}
        <section id="architecture" className="bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold tracking-wide text-blue-700">
                Portal Capabilities
              </p>
              <h2 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl text-balance">
                Built for verified institutional knowledge
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <Layers className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-display mt-4 text-base font-semibold text-slate-900">
                  01. Unified Student Portal
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Dashboard, quick-access modules, academic directories, notices, and profile preferences built for mobile and desktop viewports.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <MessageSquare className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-display mt-4 text-base font-semibold text-slate-900">
                  02. Document-Grounded AI Assistant
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Conversational academic assistant with multi-session chat history and structured institutional document source citations.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-display mt-4 text-base font-semibold text-slate-900">
                  03. Official PDF Repository
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Centralized administration workflow for uploading, categorizing, and extracting text from official college circulars and syllabi.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <p className="font-display font-semibold text-slate-900">CampusAI</p>
            <p className="mt-0.5 text-xs text-slate-500">{INSTITUTE_FULL_NAME}</p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-slate-600">
            <button
              type="button"
              onClick={() => onEnterPortal('dashboard')}
              className="hover:text-blue-700 cursor-pointer"
            >
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => onEnterPortal('assistant')}
              className="hover:text-blue-700 cursor-pointer"
            >
              AI Assistant
            </button>
            <button
              type="button"
              onClick={() => onEnterPortal('resources')}
              className="hover:text-blue-700 cursor-pointer"
            >
              Academic Resources
            </button>
            <button
              type="button"
              onClick={() => onEnterPortal('notices')}
              className="hover:text-blue-700 cursor-pointer"
            >
              Notices
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
