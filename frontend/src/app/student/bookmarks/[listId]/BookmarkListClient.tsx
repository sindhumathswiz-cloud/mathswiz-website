'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import MathRenderer from '@/components/MathRenderer';
import { readJsonResponse } from '@/lib/http-json';

type Item = {
  id: string;
  note: string | null;
  question: { id: string; content: string; topic: string | null; subject: string | null; difficulty: string };
};
type ListInfo = { id: string; name: string; description: string | null };

export default function BookmarkListClient({ listId }: { listId: string }) {
  const [list, setList] = useState<ListInfo | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/student/bookmarks/lists/${listId}/items`)
      .then(async (response) => {
        if (response.status === 404) { setNotFound(true); return; }
        const data = await response.json();
        setList(data.list);
        setItems(data.items || []);
      })
      .finally(() => setLoading(false));
  }, [listId]);

  const remove = async (itemId: string) => {
    setRemovingId(itemId);
    try {
      const response = await fetch(`/api/student/bookmarks/items/${itemId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await readJsonResponse(response);
        toast.error(body?.error as string || 'Could not remove bookmark');
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <main className="min-h-screen bg-slate-50 dark:bg-background p-10"><Loader2 className="mx-auto my-20 h-8 w-8 animate-spin text-indigo-600 dark:text-brand" /></main>;
  if (notFound) return <main className="min-h-screen bg-slate-50 dark:bg-background p-10"><div className="mx-auto max-w-4xl rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">List not found.</div></main>;

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-background p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/student/bookmarks" className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-brand">
          <ArrowLeft className="h-4 w-4" />All bookmark lists
        </Link>
        <div className="mb-8">
          <h1 className="font-display text-3xl font-black text-slate-900 dark:text-white">{list?.name}</h1>
          {list?.description && <p className="mt-1 text-slate-600 dark:text-slate-400">{list.description}</p>}
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed dark:border-white/10 bg-white dark:bg-surface p-16 text-center font-bold text-slate-600 dark:text-slate-400">
            No questions in this list yet.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} data-testid={`bookmark-item-${item.question.id}`} className="rounded-2xl border dark:border-white/10 bg-white dark:bg-surface p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide">
                  {item.question.topic && <span className="rounded-full bg-slate-100 dark:bg-white/5 px-2.5 py-1 text-slate-500 dark:text-slate-400">{item.question.topic}</span>}
                  <span className="rounded-full bg-slate-100 dark:bg-white/5 px-2.5 py-1 text-slate-500 dark:text-slate-400">{item.question.difficulty}</span>
                </div>
                <div className="mb-3 text-sm text-slate-800 dark:text-slate-200"><MathRenderer content={item.question.content} /></div>
                {item.note && <p className="mb-3 text-xs italic text-slate-500 dark:text-slate-400">"{item.note}"</p>}
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  disabled={removingId === item.id}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" />Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
