import type {
  RagQueryRequest,
  RagQueryResponse,
  SourceCitation,
} from '../types/portal';

const REQUEST_TIMEOUT_MS = 45000;

export type RagClientResult =
  | {
      kind: 'success';
      data: RagQueryResponse;
      endpoint: string;
    }
  | {
      kind: 'error';
      message: string;
      endpoint: string;
    };

export function resolveApiBaseUrl(customBaseUrl?: string): string {
  const override = (customBaseUrl ?? '').trim();
  const envUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
  const resolved = override || envUrl;
  return resolved.replace(/\/+$/, '');
}

export function resolveChatEndpoint(customBaseUrl?: string): string {
  const base = resolveApiBaseUrl(customBaseUrl);
  return base ? `${base}/api/chat` : '/api/chat';
}

function normalizeSources(rawSources: unknown): SourceCitation[] {
  if (!Array.isArray(rawSources)) return [];

  const normalized: SourceCitation[] = [];
  for (const item of rawSources) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const documentName =
      typeof record.document === 'string' && record.document.trim()
        ? record.document.trim()
        : typeof record.title === 'string' && record.title.trim()
          ? record.title.trim()
          : '';

    if (!documentName) continue;

    const page =
      typeof record.page === 'number' || typeof record.page === 'string'
        ? record.page
        : undefined;
    const reference =
      typeof record.reference === 'string' && record.reference.trim()
        ? record.reference.trim()
        : typeof record.excerpt === 'string' && record.excerpt.trim()
          ? record.excerpt.trim()
          : undefined;
    const url =
      typeof record.url === 'string' && record.url.trim()
        ? record.url.trim()
        : undefined;

    normalized.push({
      document: documentName,
      ...(page !== undefined ? { page } : {}),
      ...(reference ? { reference } : {}),
      ...(url ? { url } : {}),
    });
  }

  return normalized;
}

/**
 * Sends a student query to the Python FastAPI backend (`POST /api/chat`).
 * Never fabricates answers or citations when the backend is unavailable.
 */
export async function queryCampusAssistant(
  payload: RagQueryRequest,
  customBaseUrl?: string,
  externalSignal?: AbortSignal,
): Promise<RagClientResult> {
  const endpoint = resolveChatEndpoint(customBaseUrl);

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    timeoutController.abort('timeout');
  }, REQUEST_TIMEOUT_MS);

  const forwardAbort = () => timeoutController.abort('cancelled');
  externalSignal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: timeoutController.signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errBody = (await response.json()) as { detail?: unknown; message?: unknown };
        if (typeof errBody.detail === 'string') detail = errBody.detail;
        else if (typeof errBody.message === 'string') detail = errBody.message;
      } catch {
        // Non-JSON error body
      }

      return {
        kind: 'error',
        endpoint,
        message: detail
          ? `Backend error (${response.status}): ${detail}`
          : `Backend returned HTTP ${response.status} from ${endpoint}. Check that the FastAPI /api/chat endpoint is running properly.`,
      };
    }

    const raw = (await response.json()) as Partial<RagQueryResponse>;
    if (typeof raw.answer !== 'string' || !raw.answer.trim()) {
      return {
        kind: 'error',
        endpoint,
        message:
          'Invalid response from backend: expected a non-empty "answer" field in the JSON payload.',
      };
    }

    return {
      kind: 'success',
      endpoint,
      data: {
        answer: raw.answer,
        sources: normalizeSources(raw.sources),
        session_id:
          typeof raw.session_id === 'string' && raw.session_id.trim()
            ? raw.session_id
            : payload.session_id,
      },
    };
  } catch (err) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const isTimeout =
      timeoutController.signal.aborted && timeoutController.signal.reason === 'timeout';

    return {
      kind: 'error',
      endpoint,
      message: isTimeout
        ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s while waiting for ${endpoint}.`
        : `Could not connect to the CampusAI backend at ${endpoint}. Make sure the Python FastAPI server is running and CORS allows requests from this origin.`,
    };
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}
