'use client';

import React, { useState } from 'react';
import { Users, Plus, RefreshCw, CheckCircle, AlertCircle, ExternalLink, BookOpen, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Batch {
    id: string;
    name: string;
    code: string;
    class: string;
    microsoftTeamId: string | null;
    oneNoteUrl: string | null;
    _count: { enrollments: number };
}

interface Props {
    initialBatches: Batch[];
}

export default function BatchManagementClient({ initialBatches }: Props) {
    const [batches, setBatches] = useState<Batch[]>(initialBatches);
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSyncTeams = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/admin/teams/sync', { method: 'POST' });
            const data = await res.json();
            
            if (res.ok) {
                toast.success(data.message || 'Microsoft Teams synced successfully!');
                // Refresh data (simple page reload or fetch again)
                window.location.reload();
            } else {
                toast.error(data.error || 'Failed to sync Teams');
            }
        } catch (error) {
            toast.error('An error occurred during sync');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="font-display text-3xl font-black text-gray-900 dark:text-white tracking-tight">Batch & Roster Management</h1>
                    <p className="text-gray-500 dark:text-slate-400 font-medium">Create batches, manage enrollments, and sync with Microsoft Teams.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleSyncTeams}
                        disabled={isSyncing}
                        className="flex items-center gap-2 bg-white dark:bg-surface border-2 border-indigo-600 dark:border-brand text-indigo-600 dark:text-brand hover:bg-indigo-600 hover:text-white dark:hover:bg-brand dark:hover:text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm disabled:opacity-50"
                    >
                        {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                        Sync Microsoft Teams
                    </button>
                    <button className="flex items-center gap-2 bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white px-5 py-2.5 rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-gray-200 dark:shadow-none">
                        <Plus className="w-5 h-5" />
                        Create Manual Batch
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {batches.length === 0 ? (
                    <div className="col-span-full py-20 text-center bg-gray-50 dark:bg-surface rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10">
                        <Users className="w-16 h-16 text-gray-300 dark:text-slate-600 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">No Batches Found</h3>
                        <p className="text-gray-500 dark:text-slate-400 max-w-xs mx-auto mt-2">Get started by syncing your Microsoft Teams or creating a manual batch.</p>
                    </div>
                ) : (
                    batches.map((batch) => (
                        <div key={batch.id} className="bg-white dark:bg-surface rounded-3xl border border-gray-100 dark:border-white/10 p-6 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                            {batch.microsoftTeamId && (
                                <div className="absolute top-0 right-0 bg-indigo-600 dark:bg-brand text-white px-4 py-1 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest shadow-sm">
                                    MS Teams Synced
                                </div>
                            )}

                            <div className="flex justify-between items-start mb-6">
                                <div className="bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-slate-400 px-3 py-1 rounded-lg text-xs font-black font-mono tracking-tighter">
                                    {batch.code}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                    <CheckCircle className="w-3 h-3" /> Active
                                </div>
                            </div>

                            <h3 className="font-display text-xl font-black text-gray-900 dark:text-white mb-1 group-hover:text-indigo-600 dark:group-hover:text-brand transition-colors uppercase tracking-tight">{batch.name}</h3>
                            <p className="text-gray-500 dark:text-slate-400 text-sm font-bold mb-6 italic">{batch.class}</p>

                            <div className="flex items-center gap-6 mb-8 border-y border-gray-50 dark:border-white/10 py-4">
                                <div>
                                    <p className="text-[10px] text-gray-400 dark:text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Students</p>
                                    <p className="text-lg font-black text-gray-900 dark:text-white">{batch._count.enrollments}</p>
                                </div>
                                <div className="h-8 w-px bg-gray-100 dark:bg-white/10"></div>
                                <div>
                                    <p className="text-[10px] text-gray-400 dark:text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Attendance</p>
                                    <p className="text-lg font-black text-gray-900 dark:text-white">92%</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {batch.oneNoteUrl && (
                                    <a
                                        href={batch.oneNoteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full flex items-center justify-center gap-2 bg-[#7719aa]/10 text-[#7719aa] py-2.5 rounded-xl font-bold hover:bg-[#7719aa] hover:text-white transition-all text-sm border border-[#7719aa]/20"
                                    >
                                        <BookOpen className="w-4 h-4" /> Open Class Notebook
                                    </a>
                                )}
                                <button className="w-full bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white py-2.5 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all text-sm flex items-center justify-center gap-2">
                                    Manage Roster <ExternalLink className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Sync Status Banner */}
            <div className="bg-indigo-50 dark:bg-brand/10 border border-indigo-100 dark:border-brand/20 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6 text-indigo-900 dark:text-slate-200">
                <div className="bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet p-3 rounded-2xl text-white shadow-lg shadow-indigo-200 dark:shadow-none">
                    <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                    <h4 className="font-display font-black text-lg dark:text-white">Pro-Tip for MS Teams Admins</h4>
                    <p className="text-sm opacity-80 font-medium">To sync new members from a Team, simply click the "Sync Microsoft Teams" button again. Existing roster data will be preserved while new students are auto-onboarded.</p>
                </div>
            </div>
        </div>
    );
}
