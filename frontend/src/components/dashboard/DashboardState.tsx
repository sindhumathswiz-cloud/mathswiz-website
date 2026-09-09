import type { LucideIcon } from 'lucide-react';
import { Inbox, LoaderCircle } from 'lucide-react';

interface DashboardStateProps {
    title: string;
    description: string;
    icon?: LucideIcon;
    loading?: boolean;
}

export function DashboardState({ title, description, icon: Icon = Inbox, loading = false }: DashboardStateProps) {
    const StateIcon = loading ? LoaderCircle : Icon;

    return (
        <div className="dashboard-empty" role={loading ? 'status' : undefined} aria-live={loading ? 'polite' : undefined}>
            <StateIcon className={`mx-auto h-9 w-9 text-indigo-400 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <h2 className="mt-4 text-lg font-black text-slate-900">{title}</h2>
            <p className="mx-auto mt-2 max-w-md leading-6">{description}</p>
        </div>
    );
}
