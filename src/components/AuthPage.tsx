import { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { INSTITUTE_FULL_NAME } from '../data/portalConfig';
import { loginUser, registerStudent } from '../services/authClient';
import type { AuthUser, UserRole } from '../types/portal';
import { BrandMark } from './BrandMark';

type AuthViewMode =
  | 'role-select'
  | 'student-login'
  | 'admin-login'
  | 'student-register';

interface AuthPageProps {
  apiBaseUrl: string;
  bannerNotice?: string;
  onClearBanner?: () => void;
  onAuthSuccess: (user: AuthUser) => void;
  onOpenCampusOverview: () => void;
}

export function AuthPage({
  apiBaseUrl,
  bannerNotice,
  onClearBanner,
  onAuthSuccess,
  onOpenCampusOverview,
}: AuthPageProps) {
  const [mode, setMode] = useState<AuthViewMode>('role-select');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);

  // Student registration form state
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regEnrollment, setRegEnrollment] = useState('');
  const [regDepartment, setRegDepartment] = useState('');
  const [regSemester, setRegSemester] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const switchMode = (nextMode: AuthViewMode) => {
    setMode(nextMode);
    setErrorMessage('');
    setSuccessMessage('');
    setShowForgotHelp(false);
    setLoginPassword('');
    setShowLoginPassword(false);
    onClearBanner?.();
  };

  const handleLoginSubmit = async (e: React.FormEvent, role: UserRole) => {
    e.preventDefault();
    if (isSubmitting) return;

    const email = loginEmail.trim();
    if (!email || !loginPassword) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const user = await loginUser(
        {
          email,
          password: loginPassword,
          role,
        },
        apiBaseUrl,
      );
      setLoginPassword('');
      onAuthSuccess(user);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please check your credentials and backend connection.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const fullName = regFullName.trim();
    const email = regEmail.trim();
    const enrollmentNumber = regEnrollment.trim();
    const department = regDepartment.trim();
    const semester = regSemester.trim();

    if (!fullName || !email || !enrollmentNumber || !department || !semester) {
      setErrorMessage('Please complete all required student registration fields.');
      return;
    }

    if (regPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Password and confirm password do not match.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await registerStudent(
        {
          full_name: fullName,
          email,
          enrollment_number: enrollmentNumber,
          department,
          semester,
          password: regPassword,
        },
        apiBaseUrl,
      );

      setRegPassword('');
      setRegConfirmPassword('');

      if (result.user) {
        onAuthSuccess(result.user);
        return;
      }

      setLoginEmail(email);
      setMode('student-login');
      setSuccessMessage(result.message);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Registration failed. Please verify the backend auth service is running.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-blue-50/50 text-slate-900">
      {/* Minimal University Top Bar */}
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <BrandMark onClick={() => switchMode('role-select')} />

          <button
            type="button"
            onClick={onOpenCampusOverview}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-blue-800 hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Campus Overview</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:px-8">
        {/* Route / Session Banner */}
        {bannerNotice && (
          <div
            role="status"
            className="mx-auto mb-6 flex w-full max-w-3xl items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
          >
            <span>{bannerNotice}</span>
            {onClearBanner && (
              <button
                type="button"
                onClick={onClearBanner}
                className="text-xs font-semibold text-blue-800 hover:underline shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* VIEW 1: Role Selection Welcome Screen */}
        {mode === 'role-select' && (
          <div className="mx-auto w-full max-w-4xl">
            <div className="text-center">
              <p className="text-xs font-semibold tracking-wide text-blue-800">
                {INSTITUTE_FULL_NAME}
              </p>
              <h1 className="font-display mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl text-balance">
                CampusAI · Your Smart Campus Assistant
              </h1>
              <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                Access academic information, timetables, notices, syllabus and more with AI.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* CARD 1: STUDENT */}
              <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-all duration-150 hover:border-blue-300 hover:shadow-md">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <GraduationCap className="h-6 w-6" aria-hidden="true" />
                  </div>

                  <p className="mt-5 text-xs font-semibold tracking-wide text-blue-700">
                    Student Portal
                  </p>
                  <h2 className="font-display mt-1 text-xl font-bold text-slate-900">
                    Continue as Student
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Access academic resources, ask questions and explore college information.
                  </p>
                </div>

                <div className="mt-7 space-y-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => switchMode('student-login')}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
                  >
                    <span>Login as Student</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => switchMode('student-register')}
                    className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900 cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>New student? Register account</span>
                  </button>
                </div>
              </section>

              {/* CARD 2: ADMIN */}
              <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-all duration-150 hover:border-slate-300 hover:shadow-md">
                <div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
                    <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                  </div>

                  <p className="mt-5 text-xs font-semibold tracking-wide text-slate-600">
                    Administration Portal
                  </p>
                  <h2 className="font-display mt-1 text-xl font-bold text-slate-900">
                    Continue as Admin
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Manage college documents, upload notices and maintain academic resources.
                  </p>
                </div>

                <div className="mt-7 space-y-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => switchMode('admin-login')}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 cursor-pointer"
                  >
                    <span>Login as Admin</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <p className="min-h-[40px] flex items-center justify-center text-center text-xs text-slate-500">
                    Restricted to authorized institute administrators
                  </p>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* VIEW 2: Student Login Form */}
        {mode === 'student-login' && (
          <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <button
              type="button"
              onClick={() => switchMode('role-select')}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-800 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back to role selection</span>
            </button>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 shrink-0">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900">
                  Student Login
                </h1>
                <p className="text-xs text-slate-500">
                  Sign in with your college email (new accounts are saved on first login)
                </p>
              </div>
            </div>

            {successMessage && (
              <div
                role="status"
                className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs font-medium text-emerald-900"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs font-medium text-rose-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 text-rose-700 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form
              onSubmit={(e) => void handleLoginSubmit(e, 'student')}
              className="mt-6 space-y-4"
            >
              <div>
                <label
                  htmlFor="student-email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  College or Registered Email
                </label>
                <input
                  id="student-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="student@college.edu"
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="student-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotHelp((prev) => !prev)}
                    className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="relative mt-1.5">
                  <input
                    id="student-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {showForgotHelp && (
                  <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                    Password resets are handled by the CampusAI authentication service and the BGIEM IT administration desk. Contact your department coordinator if you cannot access your registered email.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
              >
                <span>{isSubmitting ? 'Signing in...' : 'Login as Student'}</span>
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-600">
              <span>New to CampusAI? </span>
              <button
                type="button"
                onClick={() => switchMode('student-register')}
                className="font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                Register as a Student
              </button>
            </div>
          </div>
        )}

        {/* VIEW 3: Admin Login Form */}
        {mode === 'admin-login' && (
          <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <button
              type="button"
              onClick={() => switchMode('role-select')}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-800 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back to role selection</span>
            </button>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shrink-0">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900">
                  Admin Login
                </h1>
                <p className="text-xs text-slate-500">
                  Authorized document &amp; portal administration
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">
              Admin accounts are verified by the backend and cannot be created through public registration.
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs font-medium text-rose-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 text-rose-700 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form
              onSubmit={(e) => void handleLoginSubmit(e, 'admin')}
              className="mt-5 space-y-4"
            >
              <div>
                <label
                  htmlFor="admin-email"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Admin Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@college.edu"
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Password
                </label>

                <div className="relative mt-1.5">
                  <input
                    id="admin-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter admin password"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 cursor-pointer"
              >
                <span>{isSubmitting ? 'Verifying...' : 'Login as Admin'}</span>
              </button>
            </form>
          </div>
        )}

        {/* VIEW 4: Public Student Registration Form */}
        {mode === 'student-register' && (
          <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <button
              type="button"
              onClick={() => switchMode('role-select')}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-800 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Back to role selection</span>
            </button>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700 shrink-0">
                <UserPlus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900">
                  Student Registration
                </h1>
                <p className="text-xs text-slate-500">
                  Create your CampusAI student account (student role only)
                </p>
              </div>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs font-medium text-rose-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 text-rose-700 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form
              onSubmit={(e) => void handleRegisterSubmit(e)}
              className="mt-6 space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="reg-full-name"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Full Name *
                  </label>
                  <input
                    id="reg-full-name"
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="reg-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    College Email *
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="student@college.edu"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reg-enrollment"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Enrollment Number *
                  </label>
                  <input
                    id="reg-enrollment"
                    type="text"
                    required
                    value={regEnrollment}
                    onChange={(e) => setRegEnrollment(e.target.value)}
                    placeholder="Enrollment ID"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reg-department"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Department *
                  </label>
                  <input
                    id="reg-department"
                    type="text"
                    required
                    value={regDepartment}
                    onChange={(e) => setRegDepartment(e.target.value)}
                    placeholder="e.g., B.Tech CSE"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="reg-semester"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Semester *
                  </label>
                  <input
                    id="reg-semester"
                    type="text"
                    required
                    value={regSemester}
                    onChange={(e) => setRegSemester(e.target.value)}
                    placeholder="e.g., 2nd Semester"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="reg-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Password *
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="reg-password"
                      type={showRegPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword((prev) => !prev)}
                      aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                    >
                      {showRegPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-confirm-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Confirm Password *
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="reg-confirm-password"
                      type={showRegConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-3.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPassword((prev) => !prev)}
                      aria-label={
                        showRegConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                      }
                      className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                    >
                      {showRegConfirmPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
              >
                <span>{isSubmitting ? 'Creating account...' : 'Register Student Account'}</span>
              </button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-600">
              <span>Already have a student account? </span>
              <button
                type="button"
                onClick={() => switchMode('student-login')}
                className="font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                Login as Student
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200/80 bg-white/80 py-5 text-center text-xs text-slate-500">
        CampusAI · {INSTITUTE_FULL_NAME}
      </footer>
    </div>
  );
}
