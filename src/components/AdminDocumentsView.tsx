import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  FileUp,
  Lock,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ADMIN_DOCUMENT_CATEGORIES,
  INSTITUTE_FULL_NAME,
} from '../data/portalConfig';
import {
  deleteDocumentById,
  getDocumentContent,
  listDocuments,
  MAX_PDF_SIZE_MB,
  uploadPdfBatch,
  validateClientPdfFile,
} from '../services/documentsClient';
import { resolveApiBaseUrl } from '../services/ragClient';
import type {
  AdminDocumentCategory,
  DocumentContentResponse,
  DocumentProcessingStatus,
  ManagedDocument,
} from '../types/portal';

interface AdminDocumentsViewProps {
  apiBaseUrl: string;
  onOpenApiSettings: () => void;
}

interface QueuedPdfItem {
  localId: string;
  file: File;
  title: string;
  category: AdminDocumentCategory;
  progress: number;
  state: 'queued' | 'uploading' | 'done' | 'error';
  message?: string;
}

const UPLOAD_BATCH_SIZE = 20;
const MAX_CONCURRENT_BATCHES = 2;

function getDefaultAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const startYear = now.getMonth() >= 5 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function inferCategoryFromFilename(
  filename: string,
  fallback: AdminDocumentCategory,
): AdminDocumentCategory {
  const lower = filename.toLowerCase();
  if (/timetable|time_table|schedule|routine/.test(lower)) return 'Timetable';
  if (/fee|tuition|scholarship|payment|dues/.test(lower)) return 'Fee Structure';
  if (/syllabus|curriculum|scheme|course/.test(lower)) return 'Syllabus';
  if (/exam|datesheet|date_sheet|admit|result|reval/.test(lower)) return 'Examination';
  if (/notice|circular|announcement|holiday|event/.test(lower)) return 'College Notice';
  if (/admission|brochure|prospectus|counsel/.test(lower)) return 'Admission';
  if (/regulation|ordinance|handbook|rule|policy/.test(lower)) {
    return 'Academic Regulations';
  }
  return fallback;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateDisplay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

function defaultTitleFromFile(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function StatusLabel({
  status,
  pageCount,
}: {
  status: DocumentProcessingStatus;
  pageCount: number;
}) {
  switch (status) {
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">
            Completed · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
          </span>
        </span>
      );
    case 'ocr_required':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>OCR Required (Scanned PDF)</span>
        </span>
      );
    case 'password_protected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Password Protected</span>
        </span>
      );
    case 'corrupted':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Corrupted PDF</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Processing Failed</span>
        </span>
      );
  }
}

export function AdminDocumentsView({
  apiBaseUrl,
  onOpenApiSettings,
}: AdminDocumentsViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Upload queue & metadata state
  const [queue, setQueue] = useState<QueuedPdfItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [category, setCategory] = useState<AdminDocumentCategory>('Timetable');
  const [academicYear, setAcademicYear] = useState<string>(getDefaultAcademicYear);
  const [department, setDepartment] = useState('All Departments');
  const [semester, setSemester] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Notifications
  const [uploadSuccess, setUploadSuccess] = useState<string[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  // Documents repository state
  const [documents, setDocuments] = useState<ManagedDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Extracted text preview modal
  const [previewData, setPreviewData] = useState<DocumentContentResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const endpointBase = resolveApiBaseUrl(apiBaseUrl);
  const todayLabel = new Date().toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });

  const loadDocuments = useCallback(async () => {
    setIsLoadingDocs(true);
    setDocsError('');
    try {
      const rows = await listDocuments(apiBaseUrl, filterCategory, searchQuery);
      setDocuments(rows);
    } catch (err) {
      setDocsError(
        err instanceof Error
          ? err.message
          : `Unable to load documents from ${endpointBase}/api/documents.`,
      );
    } finally {
      setIsLoadingDocs(false);
    }
  }, [apiBaseUrl, endpointBase, filterCategory, searchQuery]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const addFilesToQueue = (fileList: FileList | File[], fromFolder = false) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const validationErrors: string[] = [];
    const validItems: QueuedPdfItem[] = [];

    for (const file of incoming) {
      // When selecting a whole folder, skip non-PDF OS files silently
      if (fromFolder && !file.name.toLowerCase().endsWith('.pdf')) {
        continue;
      }

      const error = validateClientPdfFile(file);
      if (error) {
        validationErrors.push(error);
        continue;
      }

      const duplicate =
        queue.some(
          (item) =>
            item.file.name === file.name &&
            item.file.size === file.size &&
            item.state === 'queued',
        ) ||
        validItems.some(
          (item) => item.file.name === file.name && item.file.size === file.size,
        );
      if (duplicate) continue;

      validItems.push({
        localId: `${file.name}_${file.size}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        title: defaultTitleFromFile(file.name),
        category: inferCategoryFromFilename(file.name, category),
        progress: 0,
        state: 'queued',
      });
    }

    if (fromFolder && validItems.length === 0 && validationErrors.length === 0) {
      validationErrors.push('No PDF files were found inside the selected folder.');
    }

    if (validationErrors.length > 0) {
      setUploadErrors((prev) => [...prev, ...validationErrors]);
    }
    if (validItems.length > 0) {
      setUploadSuccess([]);
      setQueue((prev) => [...prev, ...validItems]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    addFilesToQueue(e.dataTransfer.files);
  };

  const handleApplyDefaultCategoryToAll = () => {
    if (isUploading) return;
    setQueue((prev) =>
      prev.map((item) =>
        item.state === 'queued' || item.state === 'error'
          ? { ...item, category }
          : item,
      ),
    );
  };

  const handleUploadAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;

    const pendingItems = queue.filter((item) => item.state === 'queued' || item.state === 'error');
    const validationIssues: string[] = [];

    if (pendingItems.length === 0) {
      validationIssues.push('Select or drop at least one valid PDF file before uploading.');
    }
    if (!academicYear.trim()) {
      validationIssues.push('Academic year is required (for example, 2025-26).');
    }
    if (!department.trim()) {
      validationIssues.push('Department or branch is required (for example, CSE or All Departments).');
    }
    if (pendingItems.some((item) => !item.title.trim())) {
      validationIssues.push('Every queued PDF must have a document title.');
    }

    if (validationIssues.length > 0) {
      setUploadErrors(validationIssues);
      return;
    }

    setIsUploading(true);
    setUploadErrors([]);
    setUploadSuccess([]);

    const pendingIds = new Set(pendingItems.map((p) => p.localId));
    setQueue((prev) =>
      prev.map((q) =>
        pendingIds.has(q.localId)
          ? { ...q, state: 'uploading', progress: 0, message: undefined }
          : q,
      ),
    );

    // Split into fast multi-file batches (single request for <= 20 files; concurrent batches for larger sets)
    const chunks: QueuedPdfItem[][] = [];
    for (let i = 0; i < pendingItems.length; i += UPLOAD_BATCH_SIZE) {
      chunks.push(pendingItems.slice(i, i + UPLOAD_BATCH_SIZE));
    }

    const successes: string[] = [];
    const errors: string[] = [];
    const newlyUploadedDocs: ManagedDocument[] = [];
    let nextChunkIndex = 0;

    const processChunk = async (chunk: QueuedPdfItem[]) => {
      const chunkIds = new Set(chunk.map((c) => c.localId));
      try {
        const result = await uploadPdfBatch(
          chunk.map((item) => ({
            file: item.file,
            metadata: {
              title: item.title.trim(),
              category: item.category,
              academic_year: academicYear.trim(),
              department: department.trim(),
              semester: semester.trim() || undefined,
            },
          })),
          apiBaseUrl,
          (percent) => {
            setQueue((prev) =>
              prev.map((q) =>
                chunkIds.has(q.localId) ? { ...q, progress: percent } : q,
              ),
            );
          },
        );

        const returnedDocs =
          result.documents.length > 0
            ? result.documents
            : result.document
              ? [result.document]
              : [];

        newlyUploadedDocs.push(...returnedDocs);

        const docByIndex = chunk.map((item, idx) => ({
          item,
          doc: returnedDocs[idx],
        }));

        setQueue((prev) =>
          prev.map((q) => {
            const match = docByIndex.find((d) => d.item.localId === q.localId);
            if (!match) return q;
            const note = match.doc
              ? `${match.item.title.trim()} (${match.doc.processing_status}): ${match.doc.status_message}`
              : 'Uploaded';
            return { ...q, state: 'done', progress: 100, message: note };
          }),
        );

        for (const { item, doc } of docByIndex) {
          const note = doc
            ? `${item.title.trim()} (${doc.processing_status}): ${doc.status_message}`
            : `${item.title.trim()}: Uploaded.`;
          if (doc && doc.processing_status !== 'completed') {
            errors.push(note);
          } else {
            successes.push(note);
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : `Failed to upload batch of ${chunk.length} PDF(s).`;
        setQueue((prev) =>
          prev.map((q) =>
            chunkIds.has(q.localId) ? { ...q, state: 'error', message: msg } : q,
          ),
        );
        errors.push(msg);
      }
    };

    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT_BATCHES, chunks.length) },
      async () => {
        while (nextChunkIndex < chunks.length) {
          const idx = nextChunkIndex++;
          await processChunk(chunks[idx]);
        }
      },
    );

    await Promise.all(workers);

    if (newlyUploadedDocs.length > 0) {
      setDocuments((prev) => {
        const seen = new Set(newlyUploadedDocs.map((d) => d.id));
        return [...newlyUploadedDocs, ...prev.filter((d) => !seen.has(d.id))];
      });
    }

    setUploadSuccess(successes);
    setUploadErrors(errors);
    setIsUploading(false);
    void loadDocuments();
  };

  const handleOpenPreview = async (docId: string) => {
    setIsLoadingPreview(true);
    setPreviewError('');
    setPreviewData(null);
    try {
      const content = await getDocumentContent(docId, apiBaseUrl);
      setPreviewData(content);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : 'Unable to load extracted document text.',
      );
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    setDocsError('');
    try {
      await deleteDocumentById(docId, apiBaseUrl);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setConfirmDeleteId(null);
      if (previewData?.document.id === docId) {
        setPreviewData(null);
      }
    } catch (err) {
      setDocsError(
        err instanceof Error ? err.message : 'Failed to delete document.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const hasCompletedQueueItems = queue.some((q) => q.state === 'done');

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Admin Document Management
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Upload, categorize, and extract text page-by-page from official PDF documents for {INSTITUTE_FULL_NAME}.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenApiSettings}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            <span>API: {endpointBase || 'Same-Origin /api'}</span>
          </button>
        </div>
      </section>

      {/* Upload & Categorization Form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="font-display text-base font-semibold text-slate-900">
          Upload Official College PDFs
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Accepted format: PDF only (max {MAX_PDF_SIZE_MB} MB per file). Scanned PDFs with no extractable text are flagged for OCR.
        </p>

        <form onSubmit={handleUploadAll} className="mt-5 space-y-6">
          {/* Drag-and-Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isUploading) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-blue-600 bg-blue-50/70'
                : 'border-slate-200 bg-slate-50/60 hover:border-blue-300'
            }`}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <FileUp className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="font-display mt-3 text-sm font-semibold text-slate-900">
              Drag and drop all college PDFs here
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Upload multiple PDFs or an entire folder in one batch — categories are auto-detected from filenames
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) {
                  addFilesToQueue(e.target.files);
                  e.target.value = '';
                }
              }}
            />

            <input
              ref={folderInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) {
                  addFilesToQueue(e.target.files, true);
                  e.target.value = '';
                }
              }}
            />

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Browse PDF Files</span>
              </button>

              <button
                type="button"
                disabled={isUploading}
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
              >
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Select Entire Folder</span>
              </button>
            </div>
          </div>

          {/* Document Categorization Defaults */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="doc-category"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Default Category *
                </label>
                {queue.length > 0 && !isUploading && (
                  <button
                    type="button"
                    onClick={handleApplyDefaultCategoryToAll}
                    className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Apply to all
                  </button>
                )}
              </div>
              <select
                id="doc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AdminDocumentCategory)}
                disabled={isUploading}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
              >
                {ADMIN_DOCUMENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="doc-academic-year"
                className="block text-xs font-semibold text-slate-700"
              >
                Academic Year *
              </label>
              <input
                id="doc-academic-year"
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                disabled={isUploading}
                placeholder="e.g., 2025-26"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="doc-department"
                className="block text-xs font-semibold text-slate-700"
              >
                Department / Branch *
              </label>
              <input
                id="doc-department"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                disabled={isUploading}
                placeholder="e.g., CSE or All"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="doc-semester"
                className="block text-xs font-semibold text-slate-700"
              >
                Semester (Optional)
              </label>
              <input
                id="doc-semester"
                type="text"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                disabled={isUploading}
                placeholder="e.g., 2nd Semester"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="doc-upload-date"
                className="block text-xs font-semibold text-slate-700"
              >
                Upload Date
              </label>
              <input
                id="doc-upload-date"
                type="text"
                readOnly
                value={todayLabel}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-600 tabular-nums focus:outline-none"
              />
            </div>
          </div>

          {/* Queued PDF Files with Titles & Progress Bars */}
          {queue.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Selected PDFs ({queue.length})
                </span>
                {hasCompletedQueueItems && !isUploading && (
                  <button
                    type="button"
                    onClick={() => setQueue((prev) => prev.filter((q) => q.state !== 'done'))}
                    className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Clear completed
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50/40">
                {queue.map((item) => (
                  <div
                    key={item.localId}
                    className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <FileText className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
                        <span className="font-medium text-slate-800 truncate">
                          {item.file.name}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{formatFileSize(item.file.size)}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-[200px] flex-1">
                          <label
                            htmlFor={`title-${item.localId}`}
                            className="sr-only"
                          >
                            Document title for {item.file.name}
                          </label>
                          <input
                            id={`title-${item.localId}`}
                            type="text"
                            value={item.title}
                            disabled={item.state === 'uploading' || item.state === 'done'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setQueue((prev) =>
                                prev.map((q) =>
                                  q.localId === item.localId ? { ...q, title: val } : q,
                                ),
                              );
                            }}
                            placeholder="Document title"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor={`cat-${item.localId}`}
                            className="sr-only"
                          >
                            Category for {item.file.name}
                          </label>
                          <select
                            id={`cat-${item.localId}`}
                            value={item.category}
                            disabled={item.state === 'uploading' || item.state === 'done'}
                            onChange={(e) => {
                              const val = e.target.value as AdminDocumentCategory;
                              setQueue((prev) =>
                                prev.map((q) =>
                                  q.localId === item.localId ? { ...q, category: val } : q,
                                ),
                              );
                            }}
                            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:outline-none disabled:bg-slate-100"
                          >
                            {ADMIN_DOCUMENT_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {(item.state === 'uploading' || item.state === 'done') && (
                        <div className="max-w-md space-y-1">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full bg-blue-700 transition-all duration-150"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {item.state === 'uploading'
                              ? item.progress < 99
                                ? `Uploading batch ${item.progress}%...`
                                : 'Processing & indexing PDFs...'
                              : item.message || 'Uploaded'}
                          </p>
                        </div>
                      )}

                      {item.state === 'error' && item.message && (
                        <p className="text-xs font-medium text-rose-700">{item.message}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={item.state === 'uploading'}
                      onClick={() =>
                        setQueue((prev) => prev.filter((q) => q.localId !== item.localId))
                      }
                      aria-label={`Remove ${item.file.name} from queue`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 shrink-0 cursor-pointer"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success & Error Notifications */}
          {uploadSuccess.length > 0 && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900"
            >
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>Upload and extraction completed</span>
              </div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
                {uploadSuccess.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {uploadErrors.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900"
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 text-rose-700 shrink-0" aria-hidden="true" />
                <span>Attention required</span>
              </div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
                {uploadErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
            {queue.length > 0 && !isUploading && (
              <button
                type="button"
                onClick={() => {
                  setQueue([]);
                  setUploadErrors([]);
                  setUploadSuccess([]);
                }}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Clear Queue
              </button>
            )}
            <button
              type="submit"
              disabled={isUploading || queue.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>
                {isUploading
                  ? 'Uploading Batch...'
                  : `Upload All ${queue.filter((q) => q.state === 'queued' || q.state === 'error').length || ''} PDFs`}
              </span>
            </button>
          </div>
        </form>
      </section>

      {/* Uploaded Documents List */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Uploaded Documents Repository
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'} stored in backend database
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:w-56 sm:flex-initial">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <label htmlFor="admin-doc-search" className="sr-only">
                Search uploaded documents
              </label>
              <input
                id="admin-doc-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title or branch..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <label htmlFor="admin-doc-category-filter" className="sr-only">
              Filter by category
            </label>
            <select
              id="admin-doc-category-filter"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
            >
              <option value="All">All Categories</option>
              {ADMIN_DOCUMENT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void loadDocuments()}
              disabled={isLoadingDocs}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoadingDocs ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Backend Error Banner */}
        {docsError && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-700 shrink-0" aria-hidden="true" />
              <span className="text-xs sm:text-sm">{docsError}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadDocuments()}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-50 cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onOpenApiSettings}
                className="text-xs font-medium text-slate-700 hover:underline cursor-pointer"
              >
                API Settings
              </button>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoadingDocs ? (
          <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading documents">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-16 animate-pulse rounded-xl border border-slate-100 bg-slate-100/70"
              />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
            <h4 className="font-display mt-3 text-base font-semibold text-slate-900">
              No documents found
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              {docsError
                ? 'Start the Python FastAPI backend to load and manage official PDFs.'
                : 'Upload your first official college PDF above to extract and store its text.'}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-3 pr-4">Document</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Department &amp; Semester</th>
                  <th className="py-3 px-3">Academic Year</th>
                  <th className="py-3 px-3">Uploaded</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => {
                  const isConfirming = confirmDeleteId === doc.id;
                  const isDeleting = deletingId === doc.id;
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 pr-4">
                        <p className="font-medium text-slate-900">{doc.title}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">
                          {doc.filename}
                        </p>
                      </td>
                      <td className="py-3.5 px-3 text-slate-700 whitespace-nowrap">
                        {doc.category}
                      </td>
                      <td className="py-3.5 px-3 text-slate-700">
                        <span>{doc.department}</span>
                        {doc.semester && (
                          <span className="text-slate-500"> · {doc.semester}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-slate-700 tabular-nums whitespace-nowrap">
                        {doc.academic_year}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateDisplay(doc.upload_date)}
                      </td>
                      <td className="py-3.5 px-3">
                        <StatusLabel
                          status={doc.processing_status}
                          pageCount={doc.page_count}
                        />
                      </td>
                      <td className="py-3.5 pl-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => void handleOpenPreview(doc.id)}
                            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800 whitespace-nowrap cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>View Text</span>
                          </button>

                          {isConfirming ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => void handleDelete(doc.id)}
                                className="inline-flex min-h-[34px] items-center rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                              >
                                {isDeleting ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setConfirmDeleteId(null)}
                                className="inline-flex min-h-[34px] items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(doc.id)}
                              aria-label={`Delete ${doc.title}`}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:border-rose-200 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Extracted Page Content Preview Modal */}
      {(isLoadingPreview || previewData || previewError) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Extracted document text preview"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div className="min-w-0">
                <h3 className="font-display truncate text-lg font-semibold text-slate-900">
                  {previewData?.document.title || 'Extracted Document Content'}
                </h3>
                {previewData && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {previewData.document.category} · {previewData.document.department}
                    {previewData.document.semester
                      ? ` · ${previewData.document.semester}`
                      : ''}{' '}
                    · {previewData.document.academic_year}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setPreviewData(null);
                  setPreviewError('');
                }}
                aria-label="Close extracted content preview"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50/70 p-6">
              {isLoadingPreview && (
                <p className="text-sm text-slate-600">Loading extracted pages...</p>
              )}

              {previewError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  {previewError}
                </div>
              )}

              {previewData && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <StatusLabel
                      status={previewData.document.processing_status}
                      pageCount={previewData.pages.length}
                    />
                    <p className="mt-1.5 text-xs text-slate-600">
                      {previewData.document.status_message}
                    </p>
                  </div>

                  {previewData.pages.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                      No page text could be stored for this PDF.
                    </div>
                  ) : (
                    previewData.pages.map((page) => (
                      <div
                        key={page.id}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <p className="mb-2 text-xs font-semibold text-blue-800 tabular-nums">
                          Page {page.page_number}
                        </p>
                        {page.extracted_text ? (
                          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
                            {page.extracted_text}
                          </pre>
                        ) : (
                          <p className="text-xs italic text-slate-400">
                            No extractable text on this page.
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
