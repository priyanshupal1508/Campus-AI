import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import multer from 'multer';
import { extractText, getDocumentProxy } from 'unpdf';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, 'backend');

// Load root .env first, then backend/.env (overriding stale inherited env values such as an older API key)
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(BACKEND_ROOT, '.env'), override: true });

const PORT = 3000;
const APP_ENV = (process.env.APP_ENV ?? 'development').trim() || 'development';
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB ?? '20') || 20;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? '24') || 24;
const SESSION_COOKIE_NAME = 'campusai_session';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const ADMIN_PASSWORD_HASH = (process.env.ADMIN_PASSWORD_HASH ?? '').trim();
const ADMIN_FULL_NAME =
  (process.env.ADMIN_FULL_NAME ?? 'CampusAI Administrator').trim() ||
  'CampusAI Administrator';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
const AUTH_SECRET_KEY =
  (process.env.AUTH_SECRET_KEY ?? '').trim() || EPHEMERAL_SECRET;

const rawDbPath = (process.env.SQLITE_DB_PATH ?? './campusai.db').trim();
const SQLITE_DB_PATH = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(BACKEND_ROOT, rawDbPath);

const rawUploadDir = (process.env.UPLOAD_DIR ?? './uploads').trim();
const UPLOAD_DIR = path.isAbsolute(rawUploadDir)
  ? rawUploadDir
  : path.resolve(BACKEND_ROOT, rawUploadDir);

fs.mkdirSync(path.dirname(SQLITE_DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(SQLITE_DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      department TEXT NOT NULL,
      semester TEXT,
      academic_year TEXT NOT NULL,
      upload_date TEXT NOT NULL,
      file_path TEXT NOT NULL,
      processing_status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extracted_pages (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      extracted_text TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_extracted_pages_doc_page
    ON extracted_pages (document_id, page_number);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
      enrollment_number TEXT,
      department TEXT,
      semester TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_predefined_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email
    ON users (email);

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
    ON auth_sessions (token_hash);

    CREATE TABLE IF NOT EXISTS auth_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function isValidBcryptHash(candidate: string): boolean {
  return (
    (candidate.startsWith('$2a$') ||
      candidate.startsWith('$2b$') ||
      candidate.startsWith('$2y$')) &&
    candidate.length >= 59
  );
}

function hashPassword(plainPassword: string): string {
  if (Buffer.byteLength(plainPassword, 'utf8') > 72) {
    throw new Error('Password must not exceed 72 bytes.');
  }
  return bcrypt.hashSync(plainPassword, 12);
}

function verifyPassword(plainPassword: string, passwordHash: string): boolean {
  try {
    if (Buffer.byteLength(plainPassword, 'utf8') > 72) return false;
    return bcrypt.compareSync(plainPassword, passwordHash);
  } catch {
    return false;
  }
}

function computeEnvAdminFingerprint(email: string, secretMaterial: string): string {
  return crypto
    .createHmac('sha256', 'campusai-admin-env-sync')
    .update(`${email}:${secretMaterial}`)
    .digest('hex');
}

function hashSessionToken(rawToken: string): string {
  return crypto
    .createHmac('sha256', AUTH_SECRET_KEY)
    .update(rawToken)
    .digest('hex');
}

function syncInitialAdminAccount(): void {
  if (!ADMIN_EMAIL) {
    console.warn(
      '[auth] ADMIN_EMAIL is not set in backend/.env; initial admin account will not be seeded.',
    );
    return;
  }

  const secretSource = ADMIN_PASSWORD_HASH || ADMIN_PASSWORD;
  if (!secretSource || secretSource === 'SET_DEV_ADMIN_PASSWORD') {
    console.warn(
      '[auth] ADMIN_PASSWORD / ADMIN_PASSWORD_HASH is not configured; initial admin account is disabled.',
    );
    return;
  }

  let passwordHash: string;
  if (ADMIN_PASSWORD_HASH) {
    if (!isValidBcryptHash(ADMIN_PASSWORD_HASH)) {
      throw new Error('ADMIN_PASSWORD_HASH is not a valid bcrypt hash.');
    }
    passwordHash = ADMIN_PASSWORD_HASH;
  } else {
    passwordHash = hashPassword(ADMIN_PASSWORD);
  }

  const currentFingerprint = computeEnvAdminFingerprint(ADMIN_EMAIL, secretSource);
  const nowIso = new Date().toISOString();

  const metaRow = db
    .prepare("SELECT value FROM auth_metadata WHERE key = 'seeded_admin_fingerprint'")
    .get() as { value?: string } | undefined;
  const previousFingerprint = metaRow?.value ?? '';

  const existingAdmin = db
    .prepare('SELECT id, email FROM users WHERE email = ?')
    .get(ADMIN_EMAIL) as { id: string; email: string } | undefined;

  if (!existingAdmin) {
    const oldAdmins = db
      .prepare('SELECT id FROM users WHERE is_predefined_admin = 1 AND email != ?')
      .all(ADMIN_EMAIL) as Array<{ id: string }>;

    for (const old of oldAdmins) {
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(old.id);
      db.prepare(
        'UPDATE users SET is_active = 0, is_predefined_admin = 0, updated_at = ? WHERE id = ?',
      ).run(nowIso, old.id);
    }

    const adminId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO users (
        id, full_name, email, password_hash, role,
        enrollment_number, department, semester,
        is_active, is_predefined_admin, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'admin', NULL, 'Administration', NULL, 1, 1, ?, ?)`,
    ).run(adminId, ADMIN_FULL_NAME, ADMIN_EMAIL, passwordHash, nowIso, nowIso);
  } else if (previousFingerprint !== currentFingerprint) {
    db.prepare(
      `UPDATE users
       SET full_name = ?,
           password_hash = ?,
           role = 'admin',
           is_active = 1,
           is_predefined_admin = 1,
           updated_at = ?
       WHERE id = ?`,
    ).run(ADMIN_FULL_NAME, passwordHash, nowIso, existingAdmin.id);
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(existingAdmin.id);
  }

  db.prepare(
    `INSERT INTO auth_metadata (key, value)
     VALUES ('seeded_admin_fingerprint', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(currentFingerprint);
}

interface UserRecord {
  id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: 'student' | 'admin';
  enrollment_number: string | null;
  department: string | null;
  semester: string | null;
  is_active: number;
  is_predefined_admin: number;
}

interface PublicUser {
  id: string;
  full_name: string;
  email: string;
  role: 'student' | 'admin';
  enrollment_number: string | null;
  department: string | null;
  semester: string | null;
}

function toPublicUser(row: UserRecord): PublicUser {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    enrollment_number: row.enrollment_number,
    department: row.department,
    semester: row.semester,
  };
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}

function extractSessionToken(req: Request): string | null {
  const authHeader = (req.headers.authorization ?? '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function createAuthSession(userId: string): string {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000);
  const sessionId = crypto.randomUUID();

  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sessionId, userId, tokenHash, expiresAt.toISOString(), now.toISOString());

  return rawToken;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_TTL_HOURS * 3600 * 1000,
    httpOnly: true,
    path: '/',
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

function resolveAuthenticatedUser(req: Request): (PublicUser & { is_predefined_admin: boolean }) | null {
  const token = extractSessionToken(req);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const nowIso = new Date().toISOString();

  const row = db
    .prepare(
      `SELECT u.*, s.id AS session_id, s.expires_at
       FROM auth_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as (UserRecord & { session_id: string; expires_at: string }) | undefined;

  if (!row) return null;

  if (row.expires_at <= nowIso || row.is_active !== 1) {
    db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(row.session_id);
    return null;
  }

  if (
    APP_ENV === 'development' &&
    row.role === 'admin' &&
    (!ADMIN_EMAIL || row.email.toLowerCase() !== ADMIN_EMAIL || row.is_predefined_admin !== 1)
  ) {
    return null;
  }

  return {
    ...toPublicUser(row),
    is_predefined_admin: row.is_predefined_admin === 1,
  };
}

interface AuthedRequest extends Request {
  authUser?: PublicUser & { is_predefined_admin: boolean };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ detail: 'Authentication required. Please sign in.' });
    return;
  }
  req.authUser = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = resolveAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ detail: 'Authentication required. Please sign in.' });
    return;
  }
  if (user.role !== 'admin') {
    res.status(403).json({
      detail: 'Access denied: Administrator privileges are required for this action.',
    });
    return;
  }
  if (
    APP_ENV === 'development' &&
    (!ADMIN_EMAIL || user.email.toLowerCase() !== ADMIN_EMAIL || !user.is_predefined_admin)
  ) {
    res.status(403).json({
      detail: 'Access denied: Restricted to the predefined development administrator.',
    });
    return;
  }
  req.authUser = user;
  next();
}

const ALLOWED_CATEGORIES = new Set([
  'Timetable',
  'Fee Structure',
  'Syllabus',
  'Examination',
  'College Notice',
  'Admission',
  'Academic Regulations',
  'Other',
]);

const STATUS_DESCRIPTIONS: Record<string, string> = {
  completed: 'Text extracted successfully across all readable pages.',
  ocr_required:
    'Scanned PDF detected with no extractable text. OCR processing is required.',
  password_protected:
    'PDF is password-protected or encrypted and cannot be extracted.',
  corrupted: 'PDF file is corrupted or unreadable.',
  failed: 'Unexpected error while processing PDF.',
};

interface DocumentRow {
  id: string;
  filename: string;
  title: string;
  category: string;
  department: string;
  semester: string | null;
  academic_year: string;
  upload_date: string;
  file_path: string;
  processing_status: string;
  page_count: number;
}

function toPublicDocument(row: DocumentRow) {
  return {
    id: row.id,
    filename: row.filename,
    title: row.title,
    category: row.category,
    department: row.department,
    semester: row.semester,
    academic_year: row.academic_year,
    upload_date: row.upload_date,
    processing_status: row.processing_status,
    status_message:
      STATUS_DESCRIPTIONS[row.processing_status] ?? 'Unknown processing status.',
    page_count: Number(row.page_count ?? 0),
  };
}

function sanitizeFilename(rawName: string): string {
  const base = path.basename(rawName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
  const cleaned = base.replace(/^_+/, '') || 'document.pdf';
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

async function extractPdfBuffer(buffer: Buffer): Promise<{
  status: 'completed' | 'ocr_required' | 'password_protected' | 'corrupted';
  message: string;
  pages: Array<{ pageNumber: number; text: string }>;
}> {
  if (buffer.length < 5 || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return {
      status: 'corrupted',
      message: STATUS_DESCRIPTIONS.corrupted,
      pages: [],
    };
  }

  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(pdf, { mergePages: false });
    const rawPages = Array.isArray(result.text)
      ? result.text
      : typeof result.text === 'string'
        ? [result.text]
        : [];

    const totalPages = Math.max(1, result.totalPages || rawPages.length || 1);
    const pages: Array<{ pageNumber: number; text: string }> = [];
    let hasExtractableText = false;

    for (let idx = 0; idx < totalPages; idx++) {
      const pageText = (rawPages[idx] ?? '').replace(/\s+\n/g, '\n').trim();
      if (pageText.length > 0) {
        hasExtractableText = true;
      }
      pages.push({
        pageNumber: idx + 1,
        text: pageText,
      });
    }

    if (!hasExtractableText) {
      return {
        status: 'ocr_required',
        message: STATUS_DESCRIPTIONS.ocr_required,
        pages,
      };
    }

    return {
      status: 'completed',
      message: STATUS_DESCRIPTIONS.completed,
      pages,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
    if (/password|encrypt/i.test(msg)) {
      return {
        status: 'password_protected',
        message: STATUS_DESCRIPTIONS.password_protected,
        pages: [],
      };
    }
    return {
      status: 'corrupted',
      message: STATUS_DESCRIPTIONS.corrupted,
      pages: [],
    };
  }
}

async function backfillUnextractedPdfs(): Promise<void> {
  const candidates = db
    .prepare(
      "SELECT id, file_path FROM documents WHERE processing_status = 'ocr_required'",
    )
    .all() as Array<{ id: string; file_path: string }>;

  if (candidates.length === 0) return;

  const updates: Array<{
    id: string;
    status: 'completed' | 'ocr_required' | 'password_protected' | 'corrupted';
    pages: Array<{ pageNumber: number; text: string }>;
  }> = [];

  await Promise.all(
    candidates.map(async (row) => {
      try {
        if (!fs.existsSync(row.file_path)) return;
        const buf = await fs.promises.readFile(row.file_path);
        const extracted = await extractPdfBuffer(buf);
        if (extracted.status === 'completed') {
          updates.push({
            id: row.id,
            status: extracted.status,
            pages: extracted.pages,
          });
        }
      } catch {
        // Leave row unchanged if file cannot be read
      }
    }),
  );

  if (updates.length === 0) return;

  const updateDoc = db.prepare(
    'UPDATE documents SET processing_status = ? WHERE id = ?',
  );
  const deletePages = db.prepare(
    'DELETE FROM extracted_pages WHERE document_id = ?',
  );
  const insertPage = db.prepare(
    `INSERT INTO extracted_pages (id, document_id, page_number, extracted_text)
     VALUES (?, ?, ?, ?)`,
  );

  db.exec('BEGIN');
  try {
    for (const item of updates) {
      updateDoc.run(item.status, item.id);
      deletePages.run(item.id);
      for (const p of item.pages) {
        insertPage.run(crypto.randomUUID(), item.id, p.pageNumber, p.text);
      }
    }
    db.exec('COMMIT');
    console.log(
      `[pdf] Extracted text for ${updates.length} previously uploaded PDF(s).`,
    );
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[pdf] Failed during backfill:', err);
  }
}

const SYSTEM_INSTRUCTION = `You are CampusAI, the academic assistant for Baderia Global Institute of Engineering & Management (BGIEM), Jabalpur.
Response style rules:
- Be concise, direct, and easy to scan (2–4 short sentences or up to 5 crisp bullet points).
- Skip introductory greetings or self-introductions and get straight to the answer.
- Never paste raw document excerpts, filenames, or page citations into your reply unless explicitly asked.
- If multiple programs match and the student did not specify one, summarize briefly in one short sentence and ask which program they need.
Accuracy rules:
- Ground institutional facts (fees, dates, timings, rules) strictly in the provided context.
- Never guess or fabricate institute-specific figures when missing from context; briefly note that the detail is not in the available records.`;

const recentSessionTurns = new Map<string, Array<{ q: string; a: string }>>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function tokenizeSearchQuery(question: string): string[] {
  const stopWords = new Set([
    'what',
    'the',
    'are',
    'for',
    'can',
    'find',
    'show',
    'latest',
    'where',
    'how',
    'when',
    'about',
    'tell',
    'give',
    'please',
    'this',
    'that',
    'with',
    'from',
    'have',
    'does',
    'which',
    'who',
    'into',
    'your',
    'my',
    'our',
  ]);

  const normalized = question
    .toLowerCase()
    .replace(/\bb\.?\s*tech\b/g, 'btech')
    .replace(/\bm\.?\s*tech\b/g, 'mtech')
    .replace(/\bb\.?\s*c\.?\s*a\b/g, 'bca')
    .replace(/\bm\.?\s*c\.?\s*a\b/g, 'mca')
    .replace(/\bm\.?\s*b\.?\s*a\b/g, 'mba');

  const rawTokens = normalized.match(/[a-z0-9]{2,}/g) ?? [];
  const tokenSet = new Set<string>();

  for (const tok of rawTokens) {
    if (stopWords.has(tok)) continue;
    tokenSet.add(tok);
    if (
      tok.length > 3 &&
      tok.endsWith('s') &&
      !tok.endsWith('ss') &&
      !tok.endsWith('us') &&
      !tok.endsWith('is')
    ) {
      const singular = tok.slice(0, -1);
      if (!stopWords.has(singular)) {
        tokenSet.add(singular);
      }
    }
  }

  return Array.from(tokenSet);
}

function searchRelevantDocumentPages(question: string, limit = 3) {
  const tokens = tokenizeSearchQuery(question);
  if (tokens.length === 0) return [];

  const clauses = tokens
    .map(
      () =>
        '(LOWER(p.extracted_text) LIKE ? OR LOWER(d.title) LIKE ? OR LOWER(d.filename) LIKE ? OR LOWER(d.category) LIKE ? OR LOWER(d.department) LIKE ? OR LOWER(COALESCE(d.semester, \'\')) LIKE ?)',
    )
    .join(' OR ');
  const params: string[] = [];
  for (const tok of tokens) {
    const pattern = `%${tok}%`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const rows = db
    .prepare(
      `SELECT d.title, d.filename, d.category, d.department, d.semester, p.page_number, p.extracted_text
       FROM extracted_pages p
       INNER JOIN documents d ON d.id = p.document_id
       WHERE d.processing_status = 'completed'
         AND LENGTH(TRIM(p.extracted_text)) > 0
         AND (${clauses})`,
    )
    .all(...params) as Array<{
    title: string;
    filename: string;
    category: string;
    department: string;
    semester: string | null;
    page_number: number;
    extracted_text: string;
  }>;

  const scored = rows.map((row) => {
    const titleLower = `${row.title} ${row.filename}`.toLowerCase();
    const categoryLower = row.category.toLowerCase();
    const metaLower = `${row.department} ${row.semester ?? ''}`.toLowerCase();
    const textLower = row.extracted_text.toLowerCase();
    let score = 0;
    let matchedDistinctTokens = 0;

    for (const tok of tokens) {
      let matched = false;
      if (titleLower.includes(tok)) {
        score += 6;
        matched = true;
      }
      if (categoryLower.includes(tok)) {
        score += 3;
        matched = true;
      }
      if (metaLower.includes(tok)) {
        score += 2;
        matched = true;
      }
      if (textLower.includes(tok)) {
        score += 1;
        matched = true;
      }
      if (matched) matchedDistinctTokens += 1;
    }

    score += matchedDistinctTokens * 12;
    return { row, score };
  });

  scored.sort((a, b) => b.score - a.score || a.row.page_number - b.row.page_number);

  const topScore = scored[0]?.score ?? 0;
  const filtered =
    topScore >= 24
      ? scored.filter((item) => item.score >= topScore * 0.45)
      : scored;

  return filtered.slice(0, limit).map(({ row }) => ({
    document: row.filename || row.title,
    title: row.title,
    page: Number(row.page_number),
    excerpt: String(row.extracted_text).trim().slice(0, 1100),
  }));
}

async function startServer() {
  initDatabase();
  syncInitialAdminAccount();
  await backfillUnextractedPdfs();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- Authentication Routes ---
  app.post('/api/auth/register', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (
      typeof body.role === 'string' &&
      body.role.trim() &&
      body.role.trim().toLowerCase() !== 'student'
    ) {
      res.status(403).json({
        detail:
          'Public admin registration is disabled. Only student accounts can be registered.',
      });
      return;
    }

    const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const enrollmentNumber =
      typeof body.enrollment_number === 'string' ? body.enrollment_number.trim() : '';
    const department =
      typeof body.department === 'string' ? body.department.trim() : '';
    const semester = typeof body.semester === 'string' ? body.semester.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!fullName || !email || !enrollmentNumber || !department || !semester) {
      res.status(400).json({ detail: 'All student registration fields are required.' });
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      res.status(400).json({ detail: 'Please enter a valid email address.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ detail: 'Password must be at least 8 characters long.' });
      return;
    }

    if (Buffer.byteLength(password, 'utf8') > 72) {
      res.status(400).json({ detail: 'Password must not exceed 72 bytes.' });
      return;
    }

    if (ADMIN_EMAIL && email === ADMIN_EMAIL) {
      res.status(409).json({
        detail:
          'This email address is reserved and cannot be used for student registration.',
      });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .get(email) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({
        detail: 'An account with this email address already exists.',
      });
      return;
    }

    const passwordHash = hashPassword(password);
    const userId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    db.prepare(
      `INSERT INTO users (
        id, full_name, email, password_hash, role,
        enrollment_number, department, semester,
        is_active, is_predefined_admin, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'student', ?, ?, ?, 1, 0, ?, ?)`,
    ).run(
      userId,
      fullName,
      email,
      passwordHash,
      enrollmentNumber,
      department,
      semester,
      nowIso,
      nowIso,
    );

    const created = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as unknown as UserRecord;
    const token = createAuthSession(created.id);
    setSessionCookie(req, res, token);

    res.status(201).json({
      user: toPublicUser(created),
      access_token: token,
      message: 'Student account registered successfully.',
    });
  });

  function deriveStudentNameFromEmail(email: string): string {
    const localPart = email.split('@')[0] ?? 'Student';
    const cleaned = localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return 'Student';
    return cleaned.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  }

  app.post('/api/auth/login', (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const portalRole = typeof body.role === 'string' ? body.role.trim() : '';

    if (!email || !password || (portalRole !== 'student' && portalRole !== 'admin')) {
      res.status(400).json({ detail: 'Email, password, and valid role are required.' });
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      res.status(400).json({ detail: 'Please enter a valid email address.' });
      return;
    }

    if (Buffer.byteLength(password, 'utf8') > 72) {
      res.status(400).json({ detail: 'Password must not exceed 72 bytes.' });
      return;
    }

    let row = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as UserRecord | undefined;

    if (portalRole === 'admin') {
      if (row && row.role !== 'admin') {
        res.status(403).json({
          detail: 'Access denied: Student accounts cannot sign in to the Admin portal.',
        });
        return;
      }

      if (APP_ENV === 'development' && (!ADMIN_EMAIL || email !== ADMIN_EMAIL)) {
        res.status(401).json({ detail: 'Invalid administrator credentials.' });
        return;
      }

      if (
        !row ||
        row.is_active !== 1 ||
        row.role !== 'admin' ||
        (APP_ENV === 'development' && row.is_predefined_admin !== 1) ||
        !verifyPassword(password, row.password_hash)
      ) {
        res.status(401).json({ detail: 'Invalid administrator email or password.' });
        return;
      }

      const token = createAuthSession(row.id);
      setSessionCookie(req, res, token);
      res.json({
        user: toPublicUser(row),
        access_token: token,
        message: 'Login successful.',
      });
      return;
    }

    // Student portal login: verify existing record, or create a new student record if email is not recorded yet
    if (row && row.role === 'admin') {
      res.status(403).json({
        detail:
          'Access denied: Administrator accounts must sign in through the Admin portal.',
      });
      return;
    }

    if (!row) {
      const passwordHash = hashPassword(password);
      const userId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const fullName = deriveStudentNameFromEmail(email);

      db.prepare(
        `INSERT INTO users (
          id, full_name, email, password_hash, role,
          enrollment_number, department, semester,
          is_active, is_predefined_admin, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'student', NULL, NULL, NULL, 1, 0, ?, ?)`,
      ).run(userId, fullName, email, passwordHash, nowIso, nowIso);

      row = db
        .prepare('SELECT * FROM users WHERE id = ?')
        .get(userId) as unknown as UserRecord;

      const token = createAuthSession(row.id);
      setSessionCookie(req, res, token);
      res.json({
        user: toPublicUser(row),
        access_token: token,
        message: 'Student account recorded and signed in successfully.',
      });
      return;
    }

    if (
      row.is_active !== 1 ||
      row.role !== 'student' ||
      !verifyPassword(password, row.password_hash)
    ) {
      res.status(401).json({ detail: 'Invalid email or password.' });
      return;
    }

    const token = createAuthSession(row.id);
    setSessionCookie(req, res, token);
    res.json({
      user: toPublicUser(row),
      access_token: token,
      message: 'Login successful.',
    });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    res.json({
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        enrollment_number: user.enrollment_number,
        department: user.department,
        semester: user.semester,
      },
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = extractSessionToken(req);
    if (token) {
      const tokenHash = hashSessionToken(token);
      db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
    }
    clearSessionCookie(req, res);
    res.json({ message: 'Signed out successfully.' });
  });

  app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const currentPassword =
      typeof body.current_password === 'string' ? body.current_password : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

    if (newPassword.length < 8) {
      res.status(400).json({ detail: 'New password must be at least 8 characters long.' });
      return;
    }
    if (Buffer.byteLength(newPassword, 'utf8') > 72) {
      res.status(400).json({ detail: 'Password must not exceed 72 bytes.' });
      return;
    }

    const userRow = db
      .prepare('SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1')
      .get(req.authUser!.id) as { id: string; password_hash: string } | undefined;

    if (!userRow || !verifyPassword(currentPassword, userRow.password_hash)) {
      res.status(401).json({ detail: 'Current password is incorrect.' });
      return;
    }

    const newHash = hashPassword(newPassword);
    const nowIso = new Date().toISOString();
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      newHash,
      nowIso,
      userRow.id,
    );

    const token = extractSessionToken(req);
    if (token) {
      const currentHash = hashSessionToken(token);
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash != ?').run(
        userRow.id,
        currentHash,
      );
    } else {
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userRow.id);
    }

    res.json({ message: 'Password updated successfully.' });
  });

  // --- Admin-Only Document Management Routes ---
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
  });

  const parseJsonStringArray = (raw: unknown): Array<string | null> | null => {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed.map((v) => (typeof v === 'string' ? v.trim() : null));
    } catch {
      return null;
    }
  };

  app.post(
    '/api/documents/upload',
    requireAdmin,
    (req, res, next) => {
      upload.fields([
        { name: 'file', maxCount: 100 },
        { name: 'files', maxCount: 100 },
      ])(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            detail: `Uploaded file exceeds the ${MAX_UPLOAD_SIZE_MB} MB size limit.`,
          });
          return;
        }
        if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({
            detail: 'Batch limit exceeded (maximum 100 files per request).',
          });
          return;
        }
        if (err) {
          res.status(400).json({ detail: 'Invalid file upload request.' });
          return;
        }
        next();
      });
    },
    async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const defaultCategory =
        typeof body.category === 'string' ? body.category.trim() : '';
      const defaultAcademicYear =
        typeof body.academic_year === 'string' ? body.academic_year.trim() : '';
      const defaultDepartment =
        typeof body.department === 'string' ? body.department.trim() : '';
      const defaultSemester =
        typeof body.semester === 'string' && body.semester.trim()
          ? body.semester.trim()
          : null;
      const customTitle =
        typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '';

      const titlesArr = parseJsonStringArray(body.titles_json);
      const categoriesArr = parseJsonStringArray(body.categories_json);
      const yearsArr = parseJsonStringArray(body.academic_years_json);
      const departmentsArr = parseJsonStringArray(body.departments_json);
      const semestersArr = parseJsonStringArray(body.semesters_json);

      const fileGroups = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const incomingFiles = [
        ...(fileGroups.file ?? []),
        ...(fileGroups.files ?? []),
      ];

      if (incomingFiles.length === 0) {
        res.status(400).json({ detail: 'At least one PDF file must be provided.' });
        return;
      }

      interface PreparedUpload {
        docId: string;
        safeName: string;
        storedPath: string;
        buffer: Buffer;
        resolvedTitle: string;
        itemCategory: string;
        itemDepartment: string;
        itemSemester: string | null;
        itemAcademicYear: string;
        uploadDate: string;
        extraction: Awaited<ReturnType<typeof extractPdfBuffer>>;
      }

      const validatedInputs: Array<{
        file: Express.Multer.File;
        safeName: string;
        docId: string;
        storedPath: string;
        resolvedTitle: string;
        itemCategory: string;
        itemDepartment: string;
        itemSemester: string | null;
        itemAcademicYear: string;
        uploadDate: string;
      }> = [];
      const baseTimestamp = Date.now();

      for (let i = 0; i < incomingFiles.length; i++) {
        const file = incomingFiles[i];
        if (!file.originalname.toLowerCase().endsWith('.pdf')) {
          res.status(400).json({
            detail: `"${file.originalname}" is not a PDF file. Only .pdf documents are accepted.`,
          });
          return;
        }

        const itemCategory = categoriesArr?.[i] || defaultCategory;
        const itemAcademicYear = yearsArr?.[i] || defaultAcademicYear;
        const itemDepartment = departmentsArr?.[i] || defaultDepartment;
        const itemSemester =
          semestersArr && i < semestersArr.length
            ? semestersArr[i] || null
            : defaultSemester;

        if (!ALLOWED_CATEGORIES.has(itemCategory)) {
          res.status(400).json({ detail: `Invalid category '${itemCategory}'.` });
          return;
        }
        if (!itemAcademicYear) {
          res.status(400).json({ detail: 'Academic year is required.' });
          return;
        }
        if (!itemDepartment) {
          res.status(400).json({ detail: 'Department or branch is required.' });
          return;
        }

        const safeName = sanitizeFilename(file.originalname);
        const docId = crypto.randomUUID();
        const storedPath = path.resolve(UPLOAD_DIR, `${docId}_${safeName}`);
        const defaultTitle =
          path.basename(safeName, path.extname(safeName)).replace(/_/g, ' ').trim() ||
          safeName;
        const explicitTitle = titlesArr?.[i];
        const resolvedTitle = explicitTitle
          ? explicitTitle
          : customTitle
            ? incomingFiles.length === 1
              ? customTitle
              : `${customTitle} (${i + 1})`
            : defaultTitle;

        validatedInputs.push({
          file,
          safeName,
          docId,
          storedPath,
          resolvedTitle,
          itemCategory,
          itemDepartment,
          itemSemester,
          itemAcademicYear,
          uploadDate: new Date(baseTimestamp + i).toISOString(),
        });
      }

      const prepared: PreparedUpload[] = await Promise.all(
        validatedInputs.map(async (item) => {
          const [, extraction] = await Promise.all([
            fs.promises.writeFile(item.storedPath, item.file.buffer),
            extractPdfBuffer(item.file.buffer),
          ]);
          return {
            docId: item.docId,
            safeName: item.safeName,
            storedPath: item.storedPath,
            buffer: item.file.buffer,
            resolvedTitle: item.resolvedTitle,
            itemCategory: item.itemCategory,
            itemDepartment: item.itemDepartment,
            itemSemester: item.itemSemester,
            itemAcademicYear: item.itemAcademicYear,
            uploadDate: item.uploadDate,
            extraction,
          };
        }),
      );

      const processedDocs: ReturnType<typeof toPublicDocument>[] = [];
      const notes: string[] = [];

      const insertDoc = db.prepare(
        `INSERT INTO documents (
          id, filename, title, category, department,
          semester, academic_year, upload_date, file_path, processing_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insertPage = db.prepare(
        `INSERT INTO extracted_pages (id, document_id, page_number, extracted_text)
         VALUES (?, ?, ?, ?)`,
      );

      db.exec('BEGIN');
      try {
        for (const item of prepared) {
          insertDoc.run(
            item.docId,
            item.safeName,
            item.resolvedTitle,
            item.itemCategory,
            item.itemDepartment,
            item.itemSemester,
            item.itemAcademicYear,
            item.uploadDate,
            item.storedPath,
            item.extraction.status,
          );

          for (const page of item.extraction.pages) {
            insertPage.run(crypto.randomUUID(), item.docId, page.pageNumber, page.text);
          }

          processedDocs.push({
            id: item.docId,
            filename: item.safeName,
            title: item.resolvedTitle,
            category: item.itemCategory,
            department: item.itemDepartment,
            semester: item.itemSemester,
            academic_year: item.itemAcademicYear,
            upload_date: item.uploadDate,
            processing_status: item.extraction.status,
            status_message:
              STATUS_DESCRIPTIONS[item.extraction.status] ?? 'Unknown processing status.',
            page_count: item.extraction.pages.length,
          });
          notes.push(`${item.safeName}: ${item.extraction.message}`);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      res.status(201).json({
        document: processedDocs.length === 1 ? processedDocs[0] : null,
        documents: processedDocs,
        message: notes.join(' | '),
      });
    },
  );

  app.get('/api/documents', requireAdmin, (req, res) => {
    const category =
      typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const conditions: string[] = [];
    const params: string[] = [];

    if (category && category !== 'All') {
      conditions.push('d.category = ?');
      params.push(category);
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        '(d.title LIKE ? OR d.filename LIKE ? OR d.department LIKE ? OR d.academic_year LIKE ?)',
      );
      params.push(term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(
        `SELECT d.*, COUNT(p.id) AS page_count
         FROM documents d
         LEFT JOIN extracted_pages p ON p.document_id = d.id
         ${whereClause}
         GROUP BY d.id
         ORDER BY d.upload_date DESC`,
      )
      .all(...params) as unknown as DocumentRow[];

    const documents = rows.map(toPublicDocument);
    res.json({ documents, total: documents.length });
  });

  app.get('/api/documents/:documentId', requireAdmin, (req, res) => {
    const row = db
      .prepare(
        `SELECT d.*, COUNT(p.id) AS page_count
         FROM documents d
         LEFT JOIN extracted_pages p ON p.document_id = d.id
         WHERE d.id = ?
         GROUP BY d.id`,
      )
      .get(req.params.documentId) as DocumentRow | undefined;

    if (!row) {
      res.status(404).json({ detail: 'Document not found.' });
      return;
    }

    res.json(toPublicDocument(row));
  });

  app.get('/api/documents/:documentId/content', requireAdmin, (req, res) => {
    const row = db
      .prepare(
        `SELECT d.*, COUNT(p.id) AS page_count
         FROM documents d
         LEFT JOIN extracted_pages p ON p.document_id = d.id
         WHERE d.id = ?
         GROUP BY d.id`,
      )
      .get(req.params.documentId) as DocumentRow | undefined;

    if (!row) {
      res.status(404).json({ detail: 'Document not found.' });
      return;
    }

    const pages = db
      .prepare(
        `SELECT id, document_id, page_number, extracted_text
         FROM extracted_pages
         WHERE document_id = ?
         ORDER BY page_number ASC`,
      )
      .all(req.params.documentId);

    res.json({
      document: toPublicDocument(row),
      pages,
    });
  });

  app.delete('/api/documents/:documentId', requireAdmin, (req, res) => {
    const row = db
      .prepare('SELECT file_path FROM documents WHERE id = ?')
      .get(req.params.documentId) as { file_path: string } | undefined;

    if (!row) {
      res.status(404).json({ detail: 'Document not found.' });
      return;
    }

    db.prepare('DELETE FROM extracted_pages WHERE document_id = ?').run(
      req.params.documentId,
    );
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.documentId);

    try {
      const candidate = path.resolve(row.file_path);
      if (candidate.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
      }
    } catch {
      // Ignore file unlink errors cleanly
    }

    res.json({
      deleted: true,
      document_id: req.params.documentId,
      message: 'Document and extracted page text deleted.',
    });
  });

  // --- Gemini AI Chat Route ---
  app.post('/api/chat', async (req, res) => {
    const body = (req.body ?? {}) as {
      question?: unknown;
      session_id?: unknown;
    };

    const question =
      typeof body.question === 'string' ? body.question.trim() : '';
    const sessionId =
      typeof body.session_id === 'string' && body.session_id.trim()
        ? body.session_id.trim()
        : `session_${Date.now()}`;

    if (!question) {
      res.status(400).json({ detail: 'A non-empty "question" field is required.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        detail:
          'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets (or .env) and restart.',
      });
      return;
    }

    try {
      const matchedPages = searchRelevantDocumentPages(question, 3);
      const historyTurns = (recentSessionTurns.get(sessionId) ?? []).slice(-2);
      const historyBlock =
        historyTurns.length > 0
          ? `Recent conversation context:\n${historyTurns
              .map((turn) => `Student: ${turn.q}\nCampusAI: ${turn.a}`)
              .join('\n')}\n\n`
          : '';

      const contextBlock =
        matchedPages.length > 0
          ? `Verified institutional information:\n${matchedPages
              .map((item) => item.excerpt)
              .join('\n---\n')}\n\n`
          : '';

      const prompt = `${historyBlock}${contextBlock}Student Question: ${question}\n\nProvide a concise, well-structured answer without attaching or listing source documents.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MINIMAL,
          },
        },
      });
      const answer = (response.text ?? '').trim();

      if (!answer) {
        res.status(502).json({
          detail: 'Gemini returned an empty response. Please try rephrasing your question.',
        });
        return;
      }

      const updatedTurns = [...historyTurns, { q: question, a: answer }].slice(-2);
      recentSessionTurns.set(sessionId, updatedTurns);

      res.json({
        answer,
        sources: [],
        session_id: sessionId,
      });
    } catch (err: unknown) {
      recentSessionTurns.delete(sessionId);
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : 500;
      const message =
        err instanceof Error ? err.message : 'Unexpected Gemini API error.';

      if (
        status === 400 ||
        status === 403 ||
        message.includes('API_KEY_INVALID') ||
        message.includes('PERMISSION_DENIED')
      ) {
        res.status(403).json({
          detail:
            'Gemini API key was rejected. Please verify GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          detail:
            'Gemini API rate limit or quota exceeded. Please try again shortly or check billing in Settings > Secrets.',
        });
        return;
      }

      res.status(500).json({
        detail: `Failed to generate response: ${message}`,
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CampusAI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CampusAI server:', err);
  process.exit(1);
});
