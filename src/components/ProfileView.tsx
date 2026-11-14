import { useState } from 'react';
import { CheckCircle2, RotateCcw, Save, Server } from 'lucide-react';
import { EMPTY_STUDENT_PROFILE, INSTITUTE_FULL_NAME } from '../data/portalConfig';
import type { StudentProfile } from '../types/portal';

interface ProfileViewProps {
  profile: StudentProfile;
  apiBaseUrl: string;
  onSaveProfile: (nextProfile: StudentProfile) => void;
  onSaveApiBaseUrl: (nextUrl: string) => void;
}

export function ProfileView({
  profile,
  apiBaseUrl,
  onSaveProfile,
  onSaveApiBaseUrl,
}: ProfileViewProps) {
  const [formState, setFormState] = useState<StudentProfile>(profile);
  const [endpointInput, setEndpointInput] = useState(apiBaseUrl);
  const [profileSavedMessage, setProfileSavedMessage] = useState('');
  const [apiSavedMessage, setApiSavedMessage] = useState('');

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveProfile({
      fullName: formState.fullName.trim(),
      enrollmentNumber: formState.enrollmentNumber.trim(),
      department: formState.department.trim(),
      semester: formState.semester.trim(),
      academicEmail: formState.academicEmail.trim(),
    });
    setProfileSavedMessage('Student preferences saved locally for this browser session.');
  };

  const handleClearProfile = () => {
    setFormState(EMPTY_STUDENT_PROFILE);
    onSaveProfile(EMPTY_STUDENT_PROFILE);
    setProfileSavedMessage('Local profile fields cleared.');
  };

  const handleApiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = endpointInput.trim().replace(/\/+$/, '');
    setEndpointInput(cleaned);
    onSaveApiBaseUrl(cleaned);
    setApiSavedMessage(
      cleaned
        ? `FastAPI backend URL set to ${cleaned}`
        : 'Cleared custom override. Using VITE_API_BASE_URL (default http://localhost:8000).',
    );
  };

  return (
    <div className="space-y-6">
      {/* Student Profile Form */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="font-display text-xl font-bold text-slate-900">
            Student Profile
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {INSTITUTE_FULL_NAME} · Manage your student details and academic preferences.
          </p>
        </div>

        <form onSubmit={handleProfileSubmit} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="profile-name"
                className="block text-sm font-medium text-slate-700"
              >
                Full Name
              </label>
              <input
                id="profile-name"
                type="text"
                value={formState.fullName}
                onChange={(e) => {
                  setProfileSavedMessage('');
                  setFormState({ ...formState, fullName: e.target.value });
                }}
                placeholder="Enter your name"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="profile-enrollment"
                className="block text-sm font-medium text-slate-700"
              >
                Enrollment Number
              </label>
              <input
                id="profile-enrollment"
                type="text"
                value={formState.enrollmentNumber}
                onChange={(e) => {
                  setProfileSavedMessage('');
                  setFormState({ ...formState, enrollmentNumber: e.target.value });
                }}
                placeholder="Enter your enrollment number"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="profile-department"
                className="block text-sm font-medium text-slate-700"
              >
                Department / Branch
              </label>
              <input
                id="profile-department"
                type="text"
                value={formState.department}
                onChange={(e) => {
                  setProfileSavedMessage('');
                  setFormState({ ...formState, department: e.target.value });
                }}
                placeholder="e.g., B.Tech CSE"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="profile-semester"
                className="block text-sm font-medium text-slate-700"
              >
                Semester
              </label>
              <input
                id="profile-semester"
                type="text"
                value={formState.semester}
                onChange={(e) => {
                  setProfileSavedMessage('');
                  setFormState({ ...formState, semester: e.target.value });
                }}
                placeholder="e.g., 2nd Semester"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="profile-email"
                className="block text-sm font-medium text-slate-700"
              >
                Academic Email
              </label>
              <input
                id="profile-email"
                type="email"
                value={formState.academicEmail}
                onChange={(e) => {
                  setProfileSavedMessage('');
                  setFormState({ ...formState, academicEmail: e.target.value });
                }}
                placeholder="Enter your institutional email"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                <span>Save Profile</span>
              </button>
              <button
                type="button"
                onClick={handleClearProfile}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Clear</span>
              </button>
            </div>

            {profileSavedMessage && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800">
                <CheckCircle2 className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
                <span>{profileSavedMessage}</span>
              </p>
            )}
          </div>
        </form>
      </section>

      {/* Backend Server Configuration */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700 shrink-0">
            <Server className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-900">
              Backend Server Configuration
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Optionally override the API server URL (for example, <code className="font-mono text-xs text-slate-800">http://localhost:8000</code>) to route chat and document requests to a custom backend instance.
            </p>
          </div>
        </div>

        <form onSubmit={handleApiSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="fastapi-base-url"
              className="block text-sm font-medium text-slate-700"
            >
              Backend Base URL
            </label>
            <input
              id="fastapi-base-url"
              type="url"
              value={endpointInput}
              onChange={(e) => {
                setApiSavedMessage('');
                setEndpointInput(e.target.value);
              }}
              placeholder="http://localhost:8000"
              className="mt-1.5 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>Apply Endpoint</span>
            </button>

            {apiSavedMessage && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800">
                <CheckCircle2 className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
                <span>{apiSavedMessage}</span>
              </p>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
