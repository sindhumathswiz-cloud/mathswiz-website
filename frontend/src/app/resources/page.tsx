import Link from 'next/link';
import { ArrowRight, ClipboardCheck, Files, Lightbulb } from 'lucide-react';

export default function ResourcesPage() {
    const resources = [
        { title: 'Mock-test guide', text: 'Understand the test format, what to review afterwards, and how a report becomes your next revision plan.', href: '/resources/mock-tests', icon: ClipboardCheck },
        { title: 'Previous-year paper method', text: 'Learn how to attempt, mark and revisit a past paper so it improves more than one score.', href: '/resources/pyq', icon: Files },
        { title: 'Study smarter', text: 'Explore the Mathswiz learning loop: learn, practise, test, review and revise with a clear next action.', href: '/learn', icon: Lightbulb },
    ];
    return <div className="min-h-screen bg-[#fbfcff] px-5 pb-20 pt-28 text-slate-950 dark:bg-[#0c0c16] dark:text-white sm:px-8 lg:pt-36"><div className="mx-auto max-w-6xl"><p className="text-xs font-black uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-300">Resources</p><h1 className="mt-5 max-w-3xl font-display text-5xl font-black leading-[.98] tracking-[-.05em] sm:text-6xl">Helpful tools for a more thoughtful maths routine.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">Use these guides alongside your course and teacher support to make practice, testing and revision more deliberate.</p><div className="mt-12 grid gap-5 md:grid-cols-3">{resources.map(({ title, text, href, icon: Icon }) => <article key={title} className="flex min-h-64 flex-col rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-white/[.03]"><Icon className="h-8 w-8 text-indigo-600"/><h2 className="mt-6 text-xl font-black">{title}</h2><p className="mt-3 flex-1 leading-7 text-slate-600 dark:text-slate-300">{text}</p><Link href={href} className="mt-7 inline-flex items-center gap-2 text-sm font-black text-indigo-600 dark:text-indigo-300">Open guide <ArrowRight className="h-4 w-4"/></Link></article>)}</div></div></div>;
}
