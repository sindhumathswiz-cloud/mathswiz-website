'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bookmark, Loader2, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { readJsonResponse } from '@/lib/http-json';

type ListRow = { id: string; name: string; description: string | null; updatedAt: string; _count: { items: number } };

export default function BookmarksClient() {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/student/bookmarks/lists')
      .then((response) => response.json())
      .then((data) => setLists(data.lists || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createList = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const response = await fetch('/api/student/bookmarks/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        toast.error(body?.error || 'Could not create list');
        return;
      }
      setName('');
      setShowForm(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/student/dashboard" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />Student dashboard
        </Link>
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bookmark className="h-9 w-9 text-indigo-600 dark:text-brand" />
            <div>
              <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">Bookmarks</h1>
              <p className="text-slate-600 dark:text-slate-400">Personal revision lists you've saved questions into.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200 dark:shadow-none hover:opacity-90 transition-colors"
          >
            <Plus className="h-4 w-4" />New list
          </button>
        </div>

        {showForm && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border dark:border-white/10 bg-white dark:bg-surface p-4">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createList(); }}
              placeholder="e.g. Weak spots before Unit Test 3"
              className="flex-1 rounded-xl border border-slate-200 dark:border-white/10 dark:bg-white/5 px-4 py-2 text-sm font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-400 dark:focus:border-brand"
            />
            <button
              type="button"
              onClick={createList}
              disabled={creating || !name.trim()}
              className="rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet px-4 py-2 text-xs font-black text-white disabled:opacity-40"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {loading ? (
          <Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" />
        ) : lists.length === 0 ? (
          <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">
            No bookmark lists yet — save a question from Practice Arena, or create a list above.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {lists.map((list) => (
              <Link
                key={list.id}
                data-testid={`bookmark-list-${list.id}`}
                href={`/student/bookmarks/${list.id}`}
                className="rounded-2xl border dark:border-white/10 bg-white dark:bg-surface p-5 hover:border-indigo-300 dark:hover:border-brand/40 hover:shadow-md transition-all"
              >
                <p className="mb-1 text-lg font-black text-slate-900 dark:text-white">{list.name}</p>
                {list.description && <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">{list.description}</p>}
                <p className="text-xs font-black uppercase tracking-wide text-indigo-600 dark:text-brand">{list._count.items} question{list._count.items === 1 ? '' : 's'}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
