import Link from 'next/link';
import { ArrowRight, Check, GraduationCap, type LucideIcon } from 'lucide-react';

type JourneyPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  highlights: Array<{ title: string; description: string }>;
  steps: string[];
  ctaLabel?: string;
  ctaHref?: string;
};

export default function JourneyPage({ eyebrow, title, description, icon: Icon, highlights, steps, ctaLabel = 'Start learning free', ctaHref = '/register' }: JourneyPageProps) {
  return <div className="min-h-screen bg-[#fbfcff] text-slate-950 dark:bg-[#0c0c16] dark:text-white">
    <section className="border-b border-indigo-100 bg-[radial-gradient(circle_at_85%_10%,#ddd6fe_0%,transparent_28%),linear-gradient(135deg,#f8fbff_0%,#f4f1ff_100%)] px-5 pb-20 pt-28 dark:border-white/10 dark:bg-[radial-gradient(circle_at_85%_10%,#312e81_0%,transparent_28%),linear-gradient(135deg,#10101d_0%,#17122b_100%)] sm:px-8 lg:pb-28 lg:pt-36">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_.7fr]">
        <div><p className="text-xs font-black uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-300">{eyebrow}</p><h1 className="mt-5 max-w-3xl font-display text-5xl font-black leading-[.98] tracking-[-.05em] sm:text-6xl">{title}</h1><p className="mt-7 max-w-2xl text-lg font-medium leading-8 text-slate-600 dark:text-slate-300">{description}</p><Link href={ctaHref} className="mt-10 inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-indigo-600/25 transition hover:-translate-y-0.5">{ctaLabel}<ArrowRight className="h-4 w-4" /></Link></div>
        <div className="rounded-[2rem] border border-white/80 bg-white/75 p-8 shadow-2xl shadow-indigo-950/10 backdrop-blur dark:border-white/10 dark:bg-white/[.05]"><div className="grid h-16 w-16 place-items-center rounded-3xl bg-indigo-600 text-white"><Icon className="h-8 w-8" /></div><p className="mt-9 text-sm font-black uppercase tracking-[.16em] text-indigo-600 dark:text-indigo-300">Your next step</p><p className="mt-3 font-display text-3xl font-black tracking-tight">A clearer plan for every maths goal.</p><div className="mt-8 space-y-3">{steps.map((step, i) => <div key={step} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold dark:bg-white/[.06]"><span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-100 text-xs text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-200">{i + 1}</span>{step}</div>)}</div></div>
      </div>
    </section>
    <section className="px-5 py-20 sm:px-8 lg:py-28"><div className="mx-auto max-w-6xl"><div className="grid gap-5 md:grid-cols-3">{highlights.map((item, i) => <article key={item.title} className="rounded-[1.6rem] border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[.03]"><span className="text-xs font-black tracking-[.18em] text-indigo-600 dark:text-indigo-300">0{i + 1}</span><h2 className="mt-8 text-xl font-black">{item.title}</h2><p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">{item.description}</p></article>)}</div><div className="mt-14 rounded-[2rem] bg-slate-950 p-8 text-white sm:p-12"><div className="flex flex-col justify-between gap-8 md:flex-row md:items-center"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-indigo-300"><GraduationCap className="h-4 w-4" />Mathswiz learning loop</div><h2 className="mt-4 font-display text-3xl font-black tracking-tight">Start with the next right action.</h2></div><Link href={ctaHref} className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-indigo-700">{ctaLabel}<ArrowRight className="h-4 w-4" /></Link></div><div className="mt-9 grid gap-3 sm:grid-cols-3">{steps.map(step => <div key={step} className="flex items-center gap-2 text-sm font-bold text-slate-200"><Check className="h-4 w-4 text-emerald-400" />{step}</div>)}</div></div></div></section>
  </div>;
}
