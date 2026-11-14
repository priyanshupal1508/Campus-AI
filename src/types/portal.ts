export type PortalRoute =
  | 'auth'
  | 'landing'
  | 'dashboard'
  | 'assistant'
  | 'resources'
  | 'notices'
  | 'admin-documents'
  | 'profile';

export type QuickAccessCategory =
  | 'timetable'
  | 'fee-structure'
  | 'syllabus'
  | 'examination'
  | 'college-notices'
  | 'admission-info';

export interface QuickAccessItem {
  id: QuickAccessCategory;
  title: string;
  description: string;
  targetRoute: Exclude<PortalRoute, 'landing' | 'auth'>;
  resourceFilter?: QuickAccessCategory;
  suggestedPrompt: string;
}

export interface SidebarNavItem {
  id: Exclude<PortalRoute, 'landing' | 'auth'>;
  label: string;
  description: string;
}

export interface SourceCitation {
  document: string;
  page?: number | string;
  reference?: string;
  url?: string;
}

export type ChatMessageStatus = 'delivered' | 'error';

export interface RagQueryRequest {
  question: string;
  session_id: string;
}

export interface RagQueryResponse {
  answer: string;
  sources: SourceCitation[];
  session_id: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  status?: ChatMessageStatus;
  sources?: SourceCitation[];
  errorEndpoint?: string;
  retryQuestion?: string;
}

export interface ChatConversation {
  id: string;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface StudentProfile {
  fullName: string;
  enrollmentNumber: string;
  department: string;
  semester: string;
  academicEmail: string;
}

export type AdminDocumentCategory =
  | 'Timetable'
  | 'Fee Structure'
  | 'Syllabus'
  | 'Examination'
  | 'College Notice'
  | 'Admission'
  | 'Academic Regulations'
  | 'Other';

export type DocumentProcessingStatus =
  | 'completed'
  | 'ocr_required'
  | 'password_protected'
  | 'corrupted'
  | 'failed';

export interface ManagedDocument {
  id: string;
  filename: string;
  title: string;
  category: AdminDocumentCategory | string;
  department: string;
  semester: string | null;
  academic_year: string;
  upload_date: string;
  processing_status: DocumentProcessingStatus;
  status_message: string;
  page_count: number;
}

export interface DocumentUploadMetadata {
  title: string;
  category: AdminDocumentCategory;
  academic_year: string;
  department: string;
  semester?: string;
}

export interface ExtractedPage {
  id: string;
  document_id: string;
  page_number: number;
  extracted_text: string;
}

export interface DocumentContentResponse {
  document: ManagedDocument;
  pages: ExtractedPage[];
}

export type UserRole = 'student' | 'admin';

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  enrollment_number?: string | null;
  department?: string | null;
  semester?: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
  role: UserRole;
}

export interface RegisterStudentPayload {
  full_name: string;
  email: string;
  enrollment_number: string;
  department: string;
  semester: string;
  password: string;
}

export interface AuthResponse {
  user?: AuthUser;
  access_token?: string;
  message?: string;
}

