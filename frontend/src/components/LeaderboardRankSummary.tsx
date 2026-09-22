'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Trophy, ArrowRight } from 'lucide-react';

export default function LeaderboardRankSummary() {
    const [state, setState] = useState<{ enabled: boolean; optedIn: boolean; userRank: number | null; totalStudents: number } | null>(null);

    useEffect(() => {
        fetch('/api/student/leaderboard')
            .then((res) => res.json())
            .then((data) => {
                if (data.success) setState({ enabled: data.enabled, optedIn: data.optedIn, userRank: data.userRank, totalStudents: data.totalStudents });
            })
            .catch(() => {});
    }, []);

    if (!state || !state.enabled) return null;

    return (
        <Link
            href="/student/leaderboard"
            className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl p-5 hover:shadow-lg transition-shadow"
        >
            <div className="flex items-center gap-3">
                <Trophy className="w-8 h-8 text-indigo-100" />
                <div>
                    <p className="text-xs font-black uppercase tracking-widest text-indigo-100">Batch Leaderboard</p>
                    <p className="font-bold">
                        {state.optedIn && state.userRank
                            ? `You're ranked #${state.userRank} of ${state.totalStudents}`
                            : "You haven't opted in yet"}
                    </p>
                </div>
            </div>
            <ArrowRight className="w-5 h-5 text-indigo-100" />
        </Link>
    );
}
