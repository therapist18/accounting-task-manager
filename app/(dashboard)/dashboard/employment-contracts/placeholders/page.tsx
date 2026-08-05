'use client';

import Link from 'next/link';
import { Braces, FileSignature, Briefcase, BookText } from 'lucide-react';
import { PlaceholderSources } from '../components/PlaceholderSources';

// Every ec_placeholders row, independent of which clause (if any) currently
// references its {{token}} - PlaceholderSources embedded in Clause Library
// always passes filterByKeys, scoping it down to the selected clause's own
// tokens. This route calls it with neither highlightKeys nor filterByKeys,
// so nothing narrows the list - the one place to browse, edit, or delete the
// full placeholder registry regardless of clause linkage.
export default function PlaceholdersPage() {
  return (
    <div className="h-[calc(100vh-1rem)] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="flex items-center gap-3">
          <Braces className="w-5 h-5 text-custom-blue" />
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">Placeholders</h1>
          <p className="hidden md:block text-sm text-slate-400 ml-2">Every token used across all clauses, job profiles and offers - edit, relink, lock or delete any of them here.</p>
        </div>
        <div className="hidden lg:flex items-center bg-slate-50 dark:bg-slate-900 p-1 rounded-full border border-slate-200 dark:border-slate-800/80 shadow-sm gap-1">
          <Link href="/dashboard/employment-contracts" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-all"><FileSignature className="w-3.5 h-3.5" /> Contracts</Link>
          <Link href="/dashboard/employment-contracts/job-profiles" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-all"><Briefcase className="w-3.5 h-3.5" /> Job Profiles</Link>
          <Link href="/dashboard/employment-contracts/clause-library" className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-white dark:hover:bg-slate-800 rounded-full transition-all"><BookText className="w-3.5 h-3.5" /> Clauses</Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <PlaceholderSources />
        </div>
      </div>
    </div>
  );
}
