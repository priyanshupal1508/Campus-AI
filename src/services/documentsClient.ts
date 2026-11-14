import type {
  DocumentContentResponse,
  DocumentUploadMetadata,
  ManagedDocument,
} from '../types/portal';
import { getAccessToken, getAuthHeaders } from './authClient';
import { resolveApiBaseUrl } from './ragClient';

export const MAX_PDF_SIZE_MB = 20;
export const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024;

export interface UploadResponsePayload {
  document: ManagedDocument | null;
  documents: ManagedDocument[];
  message: string;
}

export function validateClientPdfFile(file: File): string | null {
  const nameLower = file.name.toLowerCase();
  const typeLower = (file.type || '').toLowerCase();

  if (!nameLower.endsWith('.pdf')) {
    return `"${file.name}" is not a PDF file. Only .pdf documents are accepted.`;
  }

  if (
    typeLower &&
    typeLower !== 'application/pdf' &&
    typeLower !== 'application/x-pdf'
  ) {
    return `"${file.name}" has an unsupported MIME type (${file.type}).`;
  }

  if (file.size === 0) {
    return `"${file.name}" is empty (0 bytes).`;
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return `"${file.name}" exceeds the ${MAX_PDF_SIZE_MB} MB upload limit.`;
  }

  return null;
}

export interface BatchUploadItem {
  file: File;
  metadata: DocumentUploadMetadata;
}

export function uploadPdfDocument(
  file: File,
  metadata: DocumentUploadMetadata,
  customBaseUrl: string | undefined,
  onProgress: (percent: number) => void,
): Promise<UploadResponsePayload> {
  return uploadPdfBatch([{ file, metadata }], customBaseUrl, onProgress);
}

export function uploadPdfBatch(
  items: BatchUploadItem[],
  customBaseUrl: string | undefined,
  onProgress: (percent: number) => void,
): Promise<UploadResponsePayload> {
  if (items.length === 0) {
    return Promise.resolve({
      document: null,
      documents: [],
      message: 'No files to upload.',
    });
  }

  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/documents/upload`;

  return new Promise((resolve, reject) => {
    const formData = new FormData();
    const first = items[0].metadata;

    for (const item of items) {
      formData.append('files', item.file);
    }

    // Top-level fallback fields + per-file metadata arrays for mixed-category bulk uploads
    formData.append('title', first.title.trim());
    formData.append('category', first.category);
    formData.append('academic_year', first.academic_year.trim());
    formData.append('department', first.department.trim());
    if (first.semester && first.semester.trim()) {
      formData.append('semester', first.semester.trim());
    }

    formData.append(
      'titles_json',
      JSON.stringify(items.map((i) => i.metadata.title.trim())),
    );
    formData.append(
      'categories_json',
      JSON.stringify(items.map((i) => i.metadata.category)),
    );
    formData.append(
      'academic_years_json',
      JSON.stringify(items.map((i) => i.metadata.academic_year.trim())),
    );
    formData.append(
      'departments_json',
      JSON.stringify(items.map((i) => i.metadata.department.trim())),
    );
    formData.append(
      'semesters_json',
      JSON.stringify(items.map((i) => i.metadata.semester?.trim() || null)),
    );

    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.withCredentials = true;
    const token = getAccessToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText || '{}') as Partial<UploadResponsePayload> & {
          detail?: string;
        };

        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve({
            document: parsed.document ?? null,
            documents: Array.isArray(parsed.documents) ? parsed.documents : [],
            message: parsed.message ?? 'Documents uploaded.',
          });
        } else {
          reject(
            new Error(
              parsed.detail ||
                `Upload failed with HTTP ${xhr.status} from ${endpoint}.`,
            ),
          );
        }
      } catch {
        reject(new Error(`Unexpected non-JSON response (HTTP ${xhr.status}) from ${endpoint}.`));
      }
    };

    xhr.onerror = () => {
      reject(
        new Error(
          `Could not reach ${endpoint}. Ensure the backend server is running and CORS is enabled.`,
        ),
      );
    };

    xhr.ontimeout = () => {
      reject(
        new Error(
          `Batch upload timed out while sending ${items.length} PDF(s) to ${endpoint}.`,
        ),
      );
    };

    xhr.timeout = 180000;
    xhr.send(formData);
  });
}

export async function listDocuments(
  customBaseUrl?: string,
  category?: string,
  search?: string,
): Promise<ManagedDocument[]> {
  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const params = new URLSearchParams();
  if (category && category !== 'All') params.set('category', category);
  if (search && search.trim()) params.set('search', search.trim());

  const queryString = params.toString();
  const endpoint = `${baseUrl}/api/documents${queryString ? `?${queryString}` : ''}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...getAuthHeaders() },
    });
  } catch {
    throw new Error(
      `Could not connect to the FastAPI backend at ${endpoint}. Start the backend server on ${baseUrl} and verify CORS settings.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch documents (HTTP ${response.status}) from ${endpoint}.`);
  }

  const data = (await response.json()) as { documents?: ManagedDocument[] };
  return Array.isArray(data.documents) ? data.documents : [];
}

export async function getDocumentById(
  documentId: string,
  customBaseUrl?: string,
): Promise<ManagedDocument> {
  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/documents/${encodeURIComponent(documentId)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...getAuthHeaders() },
    });
  } catch {
    throw new Error(`Could not connect to the FastAPI backend at ${endpoint}.`);
  }

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(
      errData.detail || `Failed to load document metadata (HTTP ${response.status}).`,
    );
  }

  return (await response.json()) as ManagedDocument;
}

export async function getDocumentContent(
  documentId: string,
  customBaseUrl?: string,
): Promise<DocumentContentResponse> {
  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/documents/${encodeURIComponent(documentId)}/content`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...getAuthHeaders() },
    });
  } catch {
    throw new Error(`Could not connect to the FastAPI backend at ${endpoint}.`);
  }

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(
      errData.detail || `Failed to load extracted content (HTTP ${response.status}).`,
    );
  }

  return (await response.json()) as DocumentContentResponse;
}

export async function deleteDocumentById(
  documentId: string,
  customBaseUrl?: string,
): Promise<void> {
  const baseUrl = resolveApiBaseUrl(customBaseUrl);
  const endpoint = `${baseUrl}/api/documents/${encodeURIComponent(documentId)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'DELETE',
      credentials: 'include',
      headers: { Accept: 'application/json', ...getAuthHeaders() },
    });
  } catch {
    throw new Error(`Could not connect to the FastAPI backend at ${endpoint}.`);
  }

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(errData.detail || `Failed to delete document (HTTP ${response.status}).`);
  }
}
