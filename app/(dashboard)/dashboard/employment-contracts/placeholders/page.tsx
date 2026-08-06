'use client';

import { Braces } from 'lucide-react';
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
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <PlaceholderSources fillHeight />
      </div>
    </div>
  );
}
