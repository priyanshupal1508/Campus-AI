import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Bell,
  BookOpen,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  UserCircle,
  X,
} from 'lucide-react';
import { INSTITUTE_NAME, SIDEBAR_NAV_ITEMS } from '../data/portalConfig';
import type { AuthUser, PortalRoute } from '../types/portal';
import { BrandMark } from './BrandMark';

interface PortalShellProps {
  activeRoute: Exclude<PortalRoute, 'landing' | 'auth'>;
  currentUser: AuthUser;
  isLoggingOut?: boolean;
  onNavigate: (route: PortalRoute) => void;
  onLogout: () => void;
  children: ReactNode;
}

function NavIcon({ route }: { route: Exclude<PortalRoute, 'landing' | 'auth'> }) {
  const cls = 'h-4 w-4 shrink-0';
  switch (route) {
    case 'dashboard':
      return <LayoutDashboard className={cls} aria-hidden="true" />;
    case 'assistant':
      return <MessageSquare className={cls} aria-hidden="true" />;
    case 'resources':
      return <BookOpen className={cls} aria-hidden="true" />;
    case 'notices':
      return <Bell className={cls} aria-hidden="true" />;
    case 'admin-documents':
      return <FileUp className={cls} aria-hidden="true" />;
    case 'profile':
      return <UserCircle className={cls} aria-hidden="true" />;
  }
}

export function PortalShell({
  activeRoute,
  currentUser,
  isLoggingOut = false,
  onNavigate,
  onLogout,
  children,
}: PortalShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const visibleNavItems = SIDEBAR_NAV_ITEMS.filter(
    (item) => item.id !== 'admin-documents' || currentUser.role === 'admin',
  );
  const currentNavItem = visibleNavItems.find((item) => item.id === activeRoute);

  const handleSelectRoute = (route: PortalRoute) => {
    setSidebarOpen(false);
    onNavigate(route);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar (Desktop fixed rail + Mobile drawer) */}
      <aside
        aria-label="Portal Sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <BrandMark onClick={() => handleSelectRoute('landing')} />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation sidebar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3.5">
          <p className="text-xs font-medium leading-snug text-slate-600">
            {INSTITUTE_NAME}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-900">
            {currentUser.full_name}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {currentUser.role === 'admin' ? 'Administrator' : 'Student'} · Jabalpur
          </p>
        </div>

        <nav aria-label="Portal Navigation" className="flex-1 space-y-1 p-3">
          {visibleNavItems.map((item) => {
            const isActive = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectRoute(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-700 hover:bg-blue-50/70 hover:text-blue-800'
                }`}
              >
                <NavIcon route={item.id} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={() => handleSelectRoute('landing')}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Campus Overview</span>
          </button>

          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => {
              setSidebarOpen(false);
              onLogout();
            }}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 cursor-pointer"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{isLoggingOut ? 'Signing out...' : 'Logout'}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation sidebar"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden shrink-0 cursor-pointer"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-slate-400 sm:inline">CampusAI</span>
              <span className="hidden text-slate-300 sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-display truncate text-base font-semibold text-slate-900">
                {currentNavItem?.label ?? 'Portal'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeRoute !== 'assistant' ? (
              <button
                type="button"
                onClick={() => handleSelectRoute('assistant')}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                <span>Ask CampusAI</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSelectRoute('dashboard')}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LayoutDashboard className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>Dashboard</span>
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
