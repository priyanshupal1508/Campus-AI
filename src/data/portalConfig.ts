import type {
  AdminDocumentCategory,
  QuickAccessItem,
  SidebarNavItem,
  StudentProfile,
} from '../types/portal';

export const INSTITUTE_NAME = 'Baderia Global Institute of Engineering & Management';
export const INSTITUTE_LOCATION = 'Jabalpur';
export const INSTITUTE_FULL_NAME = `${INSTITUTE_NAME}, ${INSTITUTE_LOCATION}`;

export const ADMIN_DOCUMENT_CATEGORIES: readonly AdminDocumentCategory[] = [
  'Timetable',
  'Fee Structure',
  'Syllabus',
  'Examination',
  'College Notice',
  'Admission',
  'Academic Regulations',
  'Other',
] as const;

export const SUGGESTED_QUESTIONS: readonly string[] = [
  'What is the B.Tech 2nd semester timetable?',
  'What is the fee structure for CSE?',
  'Show me the latest college notices.',
  'Where can I find my syllabus?',
  'What is the examination schedule?',
] as const;

export const QUICK_ACCESS_ITEMS: readonly QuickAccessItem[] = [
  {
    id: 'timetable',
    title: 'Timetable',
    description: 'Semester class schedules, lab slots, and room allocations synced from the academic office.',
    targetRoute: 'resources',
    resourceFilter: 'timetable',
    suggestedPrompt: 'What is the B.Tech 2nd semester timetable?',
  },
  {
    id: 'fee-structure',
    title: 'Fee Structure',
    description: 'Official tuition schedules, semester payment breakdowns, and fee circulars.',
    targetRoute: 'resources',
    resourceFilter: 'fee-structure',
    suggestedPrompt: 'What is the fee structure for CSE?',
  },
  {
    id: 'syllabus',
    title: 'Syllabus',
    description: 'Department-wise course curricula, subject codes, and credit structures.',
    targetRoute: 'resources',
    resourceFilter: 'syllabus',
    suggestedPrompt: 'Where can I find my syllabus?',
  },
  {
    id: 'examination',
    title: 'Examination',
    description: 'Exam schedules, form submission deadlines, and assessment guidelines.',
    targetRoute: 'resources',
    resourceFilter: 'examination',
    suggestedPrompt: 'What is the examination schedule?',
  },
  {
    id: 'college-notices',
    title: 'College Notices',
    description: 'Official announcements, circulars, and academic calendar updates.',
    targetRoute: 'notices',
    suggestedPrompt: 'Show me the latest college notices.',
  },
  {
    id: 'admission-info',
    title: 'Admission Information',
    description: 'Eligibility criteria, counselling steps, and required document checklists.',
    targetRoute: 'resources',
    resourceFilter: 'admission-info',
    suggestedPrompt: 'What documents and steps are listed for B.Tech admission?',
  },
] as const;

export const SIDEBAR_NAV_ITEMS: readonly SidebarNavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Overview and quick access',
  },
  {
    id: 'assistant',
    label: 'AI Assistant',
    description: 'Ask CampusAI questions',
  },
  {
    id: 'resources',
    label: 'Academic Resources',
    description: 'Timetables, fees, and syllabi',
  },
  {
    id: 'notices',
    label: 'Notices',
    description: 'Official college circulars',
  },
  {
    id: 'admin-documents',
    label: 'Admin Documents',
    description: 'Upload and process PDFs',
  },
  {
    id: 'profile',
    label: 'Profile',
    description: 'Student details and API settings',
  },
] as const;

export const EMPTY_STUDENT_PROFILE: StudentProfile = {
  fullName: '',
  enrollmentNumber: '',
  department: '',
  semester: '',
  academicEmail: '',
};
