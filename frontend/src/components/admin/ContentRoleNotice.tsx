import Link from 'next/link';
import { contentRole } from '@/lib/content-role';

/** A thin strip across every admin page of the staging site, so nobody mistakes it for the live one. */
export function StagingSiteStrip() {
  if (contentRole() !== 'staging') return null;
  return (
    <div data-testid="staging-strip" className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs font-bold text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      Staging site: changes here reach students only after they are approved and{' '}
      <Link href="/admin/content-sync" className="underline underline-offset-2">published to live</Link>.
    </div>
  );
}

/** On the live site's import pages: imports happen in staging, and these pages are read-only here. */
export function ImportsOnStagingNotice() {
  if (contentRole() !== 'live') return null;
  return (
    <div role="note" data-testid="imports-on-staging" className="mx-6 mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
      <p className="font-bold">This is the live site. Importing and extracting questions happens on the staging site.</p>
      <p className="mt-1">You can look at books and pages here, but uploads, extraction and imports are turned off. On this computer, start staging with{' '}
        <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs dark:bg-white/10">npm run dev:staging</code> and open{' '}
        <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs dark:bg-white/10">http://localhost:3200</code>.</p>
    </div>
  );
}
