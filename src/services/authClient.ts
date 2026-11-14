import type {
  AuthResponse,
  AuthUser,
  LoginPayload,
  RegisterStudentPayload,
  UserRole,
} from '../types/portal';
import { resolveApiBaseUrl } from './ragClient';

// Kept strictly in memory (never written to localStorage; passwords are never stored).
let inMemoryAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function clearAccessToken(): void {
  inMemoryAccessToken = null;
}

export function getAuthHeaders(): Record<string, string> {
  return inMemoryAccessToken
    ? { Authorization: `Bearer ${inMemoryAccessToken}` }
    : {};
}

function isValidRole(role: unknown): role is UserRole {
  return role === 'student' || role === 'admin';
}

function normalizeUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (!isValidRole(candidate.role)) return null;
  if (typeof candidate.email !== 'string' || !candidate.email.trim()) return null;

  return {
    id: typeof candidate.id === 'string' ? candidate.id : candidate.email,
    full_name:
      typeof candidate.full_name === 'string' && candidate.full_name.trim()
        ? candidate.full_name.trim()
        : candidate.email.split('@')[0],
    email: candidate.email.trim(),
    role: candidate.role,
    enrollment_number:
      typeof candidate.enrollment_number === 'string'
        ? candidate.enrollment_number
        : null,
    department:
      typeof candidate.department === 'string' ? candidate.department : null,
    semester: typeof candidate.semester === 'string' ? candidate.semester : null,
  };
}

async function parseErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      detail?: unknown;
      message?: unknown;
    };
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail;
    if (typeof body.message === 'string' && body.message.trim()) return body.message;
  } catch {
    // Non-JSON error response
  }
  return `Authentication request failed with HTTP ${response.status}.`;
}

export async function loginUser(
  payload: LoginPayload,
  customBaseUrl?: string,
): Promise<AuthUser> {
  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/auth/login`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `Could not reach the authentication server at ${endpoint}. Make sure the backend /api/auth/login endpoint is running and CORS allows credentials.`,
    );
  }

  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new Error(detail);
  }

  const data = (await response.json()) as AuthResponse & { role?: unknown; email?: unknown };
  if (typeof data.access_token === 'string' && data.access_token.trim()) {
    inMemoryAccessToken = data.access_token.trim();
  }

  const user = normalizeUser(data.user ?? data);
  if (!user) {
    clearAccessToken();
    throw new Error('Backend login response did not include a valid user and role.');
  }

  // Never trust client selection alone; verify the role returned by the backend matches the portal entered.
  if (user.role !== payload.role) {
    clearAccessToken();
    throw new Error(
      `Access denied: your account role is "${user.role}" and cannot sign in through the ${payload.role} portal.`,
    );
  }

  return user;
}

export async function registerStudent(
  payload: RegisterStudentPayload,
  customBaseUrl?: string,
): Promise<{ message: string; user?: AuthUser }> {
  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/auth/register`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `Could not reach the registration server at ${endpoint}. Make sure the backend /api/auth/register endpoint is running.`,
    );
  }

  if (!response.ok) {
    const detail = await parseErrorDetail(response);
    throw new Error(detail);
  }

  const data = (await response.json().catch(() => ({}))) as AuthResponse;
  if (typeof data.access_token === 'string' && data.access_token.trim()) {
    inMemoryAccessToken = data.access_token.trim();
  }

  const user = normalizeUser(data.user);
  return {
    message:
      typeof data.message === 'string' && data.message.trim()
        ? data.message
        : 'Student account registered successfully.',
    ...(user && user.role === 'student' ? { user } : {}),
  };
}

export async function getCurrentUser(
  customBaseUrl?: string,
): Promise<AuthUser | null> {
  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/auth/me`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAccessToken();
      }
      return null;
    }

    const data = (await response.json()) as { user?: unknown } & Record<string, unknown>;
    return normalizeUser(data.user ?? data);
  } catch {
    return null;
  }
}

export async function logoutUser(customBaseUrl?: string): Promise<void> {
  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/auth/logout`;

  try {
    await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    });
  } catch {
    // Clear local session state even if server is unreachable
  } finally {
    clearAccessToken();
  }
}
