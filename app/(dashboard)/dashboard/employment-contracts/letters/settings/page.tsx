import { redirect } from 'next/navigation';

// Letter templates are managed in the Job Profiles settings page's Letter
// Templates tab (components/LetterTemplatesTab.tsx) - this old route just
// forwards there so existing links/bookmarks keep working.
export default function EmploymentLetterSettingsRedirect() {
  redirect('/dashboard/employment-contracts/job-profiles?tab=letters');
}
