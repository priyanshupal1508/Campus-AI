import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { AdminDocumentsView } from './components/AdminDocumentsView';
import { AuthPage } from './components/AuthPage';
import { ChatInterface } from './components/ChatInterface';
import { DashboardView } from './components/DashboardView';
import { LandingPage } from './components/LandingPage';
import { NoticesView } from './components/NoticesView';
import { PortalShell } from './components/PortalShell';
import { ProfileView } from './components/ProfileView';
import { ResourcesView } from './components/ResourcesView';
import { EMPTY_STUDENT_PROFILE } from './data/portalConfig';
import { getCurrentUser, logoutUser } from './services/authClient';
import {
  createEmptyConversation,
  createSessionId,
  deriveConversationTitle,
  loadStoredConversations,
  saveActiveConversationId,
  saveStoredConversations,
} from './services/chatStorage';
import { queryCampusAssistant } from './services/ragClient';
import type {
  AuthUser,
  ChatConversation,
  ChatMessage,
  PortalRoute,
  QuickAccessCategory,
  QuickAccessItem,
  StudentProfile,
} from './types/portal';

const PROFILE_STORAGE_KEY = 'campusai_bgiem_profile_v1';
const API_URL_STORAGE_KEY = 'campusai_bgiem_api_url_v1';

const VALID_ROUTES: readonly PortalRoute[] = [
  'auth',
  'landing',
  'dashboard',
  'assistant',
  'resources',
  'notices',
  'admin-documents',
  'profile',
];

function isProtectedRoute(route: PortalRoute): boolean {
  return route !== 'auth' && route !== 'landing';
}

function getDefaultHomeForRole(role: AuthUser['role']): PortalRoute {
  return role === 'admin' ? 'admin-documents' : 'dashboard';
}

function getInitialRoute(): PortalRoute {
  const hash = window.location.hash.replace(/^#\/?/, '') as PortalRoute;
  return VALID_ROUTES.includes(hash) ? hash : 'auth';
}

function loadStoredProfile(): StudentProfile {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return EMPTY_STUDENT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<StudentProfile>;
    return {
      fullName: typeof parsed.fullName === 'string' ? parsed.fullName : '',
      enrollmentNumber:
        typeof parsed.enrollmentNumber === 'string' ? parsed.enrollmentNumber : '',
      department: typeof parsed.department === 'string' ? parsed.department : '',
      semester: typeof parsed.semester === 'string' ? parsed.semester : '',
      academicEmail: typeof parsed.academicEmail === 'string' ? parsed.academicEmail : '',
    };
  } catch {
    return EMPTY_STUDENT_PROFILE;
  }
}

function loadStoredApiUrl(): string {
  try {
    return window.localStorage.getItem(API_URL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function formatNow(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initializeConversationState(): {
  conversations: ChatConversation[];
  activeId: string;
} {
  const storedNonEmpty = loadStoredConversations().filter(
    (c) => c.messages.length > 0,
  );
  const fresh = createEmptyConversation();
  return {
    conversations: [fresh, ...storedNonEmpty].slice(0, 20),
    activeId: fresh.id,
  };
}

export default function App() {
  const [initialChat] = useState(initializeConversationState);
  const [route, setRoute] = useState<PortalRoute>(getInitialRoute);
  const [resourceFilter, setResourceFilter] = useState<QuickAccessCategory | 'all'>('all');
  const [conversations, setConversations] = useState<ChatConversation[]>(
    initialChat.conversations,
  );
  const [activeConversationId, setActiveConversationId] = useState<string>(
    initialChat.activeId,
  );
  const [isSending, setIsSending] = useState(false);
  const [profile, setProfile] = useState<StudentProfile>(loadStoredProfile);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(loadStoredApiUrl);

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [authBannerNotice, setAuthBannerNotice] = useState('');
  const [unauthorizedNotice, setUnauthorizedNotice] = useState('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const isSendingRef = useRef(false);

  const activeConversation = useMemo(() => {
    return (
      conversations.find((c) => c.id === activeConversationId) ?? conversations[0]
    );
  }, [conversations, activeConversationId]);

  useEffect(() => {
    saveStoredConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      saveActiveConversationId(activeConversationId);
    }
  }, [activeConversationId]);

  const pushRoute = useCallback((nextRoute: PortalRoute) => {
    setRoute(nextRoute);
    const targetHash = nextRoute === 'landing' ? '' : `#/${nextRoute}`;
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, '', targetHash || window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Verify existing backend session on mount (no localStorage passwords or fake auth).
  useEffect(() => {
    let active = true;
    const verifySession = async () => {
      try {
        const user = await getCurrentUser(apiBaseUrl);
        if (!active) return;

        if (user) {
          setCurrentUser(user);
          setProfile((prev) => {
            const synced: StudentProfile = {
              fullName: user.full_name || prev.fullName,
              enrollmentNumber: user.enrollment_number ?? prev.enrollmentNumber,
              department: user.department ?? prev.department,
              semester: user.semester ?? prev.semester,
              academicEmail: user.email || prev.academicEmail,
            };
            try {
              window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(synced));
            } catch {
              // Ignore storage quota errors cleanly
            }
            return synced;
          });
        } else {
          setCurrentUser(null);
        }
      } finally {
        if (active) {
          setIsCheckingSession(false);
        }
      }
    };

    void verifySession();
    return () => {
      active = false;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    const syncRouteFromLocation = () => {
      setRoute(getInitialRoute());
    };
    window.addEventListener('hashchange', syncRouteFromLocation);
    window.addEventListener('popstate', syncRouteFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncRouteFromLocation);
      window.removeEventListener('popstate', syncRouteFromLocation);
    };
  }, []);

  // Enforce authentication & role-based route protection whenever route or session changes.
  useEffect(() => {
    if (isCheckingSession) return;

    if (!currentUser && isProtectedRoute(route)) {
      setAuthBannerNotice('Please sign in as a Student or Admin to access the CampusAI portal.');
      pushRoute('auth');
      return;
    }

    if (currentUser && route === 'auth') {
      pushRoute(getDefaultHomeForRole(currentUser.role));
      return;
    }

    if (currentUser && route === 'admin-documents' && currentUser.role !== 'admin') {
      setUnauthorizedNotice(
        'Access denied: Administrator privileges are required to access Document Management.',
      );
      pushRoute('dashboard');
    }
  }, [currentUser, isCheckingSession, pushRoute, route]);

  const navigate = useCallback(
    (nextRoute: PortalRoute) => {
      if (isProtectedRoute(nextRoute) && !currentUser) {
        setAuthBannerNotice('Please sign in as a Student or Admin to access the CampusAI portal.');
        pushRoute('auth');
        return;
      }

      if (nextRoute === 'admin-documents' && currentUser?.role !== 'admin') {
        setUnauthorizedNotice(
          'Access denied: Administrator privileges are required to access Document Management.',
        );
        pushRoute('dashboard');
        return;
      }

      if (nextRoute === 'auth' && currentUser) {
        pushRoute(getDefaultHomeForRole(currentUser.role));
        return;
      }

      if (nextRoute !== 'dashboard') {
        setUnauthorizedNotice('');
      }
      pushRoute(nextRoute);
    },
    [currentUser, pushRoute],
  );

  const handleAuthSuccess = useCallback(
    (user: AuthUser) => {
      setCurrentUser(user);
      setAuthBannerNotice('');
      setUnauthorizedNotice('');
      setConversations((prev) => {
        const nonEmpty = prev.filter((c) => c.messages.length > 0);
        const fresh = createEmptyConversation();
        setActiveConversationId(fresh.id);
        return [fresh, ...nonEmpty].slice(0, 20);
      });
      setProfile((prev) => {
        const synced: StudentProfile = {
          fullName: user.full_name || prev.fullName,
          enrollmentNumber: user.enrollment_number ?? prev.enrollmentNumber,
          department: user.department ?? prev.department,
          semester: user.semester ?? prev.semester,
          academicEmail: user.email || prev.academicEmail,
        };
        try {
          window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(synced));
        } catch {
          // Ignore storage quota errors cleanly
        }
        return synced;
      });
      pushRoute(getDefaultHomeForRole(user.role));
    },
    [pushRoute],
  );

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    abortControllerRef.current?.abort();
    isSendingRef.current = false;
    setIsSending(false);

    try {
      await logoutUser(apiBaseUrl);
    } finally {
      const fresh = createEmptyConversation();
      setConversations([fresh]);
      setActiveConversationId(fresh.id);
      setCurrentUser(null);
      setUnauthorizedNotice('');
      setAuthBannerNotice('You have been signed out of CampusAI.');
      setIsLoggingOut(false);
      pushRoute('auth');
    }
  }, [apiBaseUrl, isLoggingOut, pushRoute]);

  const handleSaveProfile = (nextProfile: StudentProfile) => {
    setProfile(nextProfile);
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    } catch {
      // Ignore storage quota errors cleanly
    }
  };

  const handleSaveApiBaseUrl = (nextUrl: string) => {
    setApiBaseUrl(nextUrl);
    try {
      if (nextUrl) {
        window.localStorage.setItem(API_URL_STORAGE_KEY, nextUrl);
      } else {
        window.localStorage.removeItem(API_URL_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota errors cleanly
    }
  };

  const handleNewChat = useCallback(() => {
    if (isSendingRef.current) return;
    const emptyExisting = conversations.find((c) => c.messages.length === 0);
    if (emptyExisting) {
      setActiveConversationId(emptyExisting.id);
      return;
    }
    const fresh = createEmptyConversation();
    setConversations((prev) => [fresh, ...prev]);
    setActiveConversationId(fresh.id);
  }, [conversations]);

  const handleSelectConversation = useCallback((id: string) => {
    if (isSendingRef.current) return;
    setActiveConversationId(id);
  }, []);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      if (isSendingRef.current && id === activeConversationId) {
        abortControllerRef.current?.abort();
        isSendingRef.current = false;
        setIsSending(false);
      }

      setConversations((prev) => {
        const remaining = prev.filter((c) => c.id !== id);
        if (remaining.length === 0) {
          const fresh = createEmptyConversation();
          setActiveConversationId(fresh.id);
          return [fresh];
        }
        if (id === activeConversationId) {
          setActiveConversationId(remaining[0].id);
        }
        return remaining;
      });
    },
    [activeConversationId],
  );

  const handleSendMessage = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || isSendingRef.current || !activeConversation) return;

      const targetConvId = activeConversation.id;
      const targetSessionId = activeConversation.sessionId;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      isSendingRef.current = true;
      setIsSending(true);

      const userMsg: ChatMessage = {
        id: createSessionId(),
        role: 'user',
        content: trimmed,
        timestamp: formatNow(),
        status: 'delivered',
      };

      const nowIso = new Date().toISOString();
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== targetConvId) return conv;
          const isFirstMessage = conv.messages.length === 0;
          return {
            ...conv,
            title: isFirstMessage ? deriveConversationTitle(trimmed) : conv.title,
            updatedAt: nowIso,
            messages: [...conv.messages, userMsg],
          };
        }),
      );

      try {
        const result = await queryCampusAssistant(
          {
            question: trimmed,
            session_id: targetSessionId,
          },
          apiBaseUrl,
          controller.signal,
        );

        const replyTimestamp = formatNow();
        const replyIso = new Date().toISOString();

        if (result.kind === 'success') {
          const assistantMsg: ChatMessage = {
            id: createSessionId(),
            role: 'assistant',
            content: result.data.answer,
            timestamp: replyTimestamp,
            status: 'delivered',
            sources: result.data.sources,
          };

          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === targetConvId
                ? {
                    ...conv,
                    sessionId: result.data.session_id,
                    updatedAt: replyIso,
                    messages: [...conv.messages, assistantMsg],
                  }
                : conv,
            ),
          );
        } else {
          const errorMsg: ChatMessage = {
            id: createSessionId(),
            role: 'assistant',
            content: result.message,
            timestamp: replyTimestamp,
            status: 'error',
            errorEndpoint: result.endpoint,
            retryQuestion: trimmed,
          };

          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === targetConvId
                ? {
                    ...conv,
                    updatedAt: replyIso,
                    messages: [...conv.messages, errorMsg],
                  }
                : conv,
            ),
          );
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          const fallbackError: ChatMessage = {
            id: createSessionId(),
            role: 'assistant',
            content: 'An unexpected error occurred while sending your request.',
            timestamp: formatNow(),
            status: 'error',
            retryQuestion: trimmed,
          };

          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === targetConvId
                ? {
                    ...conv,
                    updatedAt: new Date().toISOString(),
                    messages: [...conv.messages, fallbackError],
                  }
                : conv,
            ),
          );
        }
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [activeConversation, apiBaseUrl],
  );

  const handleOpenResource = (item: QuickAccessItem) => {
    if (item.targetRoute === 'resources') {
      setResourceFilter(item.resourceFilter ?? 'all');
      navigate('resources');
      return;
    }
    navigate(item.targetRoute);
  };

  const handleAskAndOpenAssistant = (prompt: string) => {
    if (!currentUser) {
      setAuthBannerNotice('Please sign in as a Student or Admin to ask CampusAI questions.');
      pushRoute('auth');
      return;
    }
    navigate('assistant');
    void handleSendMessage(prompt);
  };

  if (route === 'landing') {
    return (
      <LandingPage
        onEnterPortal={(targetRoute, filter) => {
          if (filter) {
            setResourceFilter(filter);
          } else if (targetRoute === 'resources') {
            setResourceFilter('all');
          }
          navigate(targetRoute);
        }}
        onAskFromLanding={(prompt) => handleAskAndOpenAssistant(prompt)}
      />
    );
  }

  if (isCheckingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <ShieldCheck className="h-5 w-5 text-blue-700" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-700">
            Verifying CampusAI session...
          </span>
        </div>
      </div>
    );
  }

  if (!currentUser || route === 'auth') {
    return (
      <AuthPage
        apiBaseUrl={apiBaseUrl}
        bannerNotice={authBannerNotice}
        onClearBanner={() => setAuthBannerNotice('')}
        onAuthSuccess={handleAuthSuccess}
        onOpenCampusOverview={() => pushRoute('landing')}
      />
    );
  }

  const resolvedRoute: Exclude<PortalRoute, 'landing' | 'auth'> =
    route === 'admin-documents' && currentUser.role !== 'admin'
      ? 'dashboard'
      : route;

  return (
    <PortalShell
      activeRoute={resolvedRoute}
      currentUser={currentUser}
      isLoggingOut={isLoggingOut}
      onNavigate={navigate}
      onLogout={() => void handleLogout()}
    >
      {unauthorizedNotice && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-4 w-4 text-rose-700 shrink-0" aria-hidden="true" />
            <span>{unauthorizedNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setUnauthorizedNotice('')}
            className="text-xs font-semibold text-rose-800 hover:underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {resolvedRoute === 'dashboard' && (
        <DashboardView
          profile={profile}
          conversations={conversations}
          activeConversation={activeConversation}
          isSending={isSending}
          apiBaseUrl={apiBaseUrl}
          onSendMessage={handleSendMessage}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onOpenResource={handleOpenResource}
          onAskAndOpenAssistant={(prompt) => handleAskAndOpenAssistant(prompt)}
          onOpenApiSettings={() => navigate('profile')}
          onOpenFullAssistant={() => navigate('assistant')}
        />
      )}

      {resolvedRoute === 'assistant' && (
        <ChatInterface
          conversations={conversations}
          activeConversation={activeConversation}
          isSending={isSending}
          apiBaseUrl={apiBaseUrl}
          onSendMessage={handleSendMessage}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onOpenApiSettings={() => navigate('profile')}
        />
      )}

      {resolvedRoute === 'resources' && (
        <ResourcesView
          selectedCategory={resourceFilter}
          onSelectCategory={setResourceFilter}
          onAskQuestion={(prompt) => handleAskAndOpenAssistant(prompt)}
        />
      )}

      {resolvedRoute === 'notices' && (
        <NoticesView
          onAskAboutNotices={() =>
            handleAskAndOpenAssistant('Show me the latest college notices.')
          }
        />
      )}

      {resolvedRoute === 'admin-documents' && currentUser.role === 'admin' && (
        <AdminDocumentsView
          apiBaseUrl={apiBaseUrl}
          onOpenApiSettings={() => navigate('profile')}
        />
      )}

      {resolvedRoute === 'profile' && (
        <ProfileView
          profile={profile}
          apiBaseUrl={apiBaseUrl}
          onSaveProfile={handleSaveProfile}
          onSaveApiBaseUrl={handleSaveApiBaseUrl}
        />
      )}
    </PortalShell>
  );
}
