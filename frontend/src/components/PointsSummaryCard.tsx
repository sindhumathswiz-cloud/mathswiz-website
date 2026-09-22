'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';

export default function PointsSummaryCard() {
    const [totalPoints, setTotalPoints] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/student/points-summary')
            .then((res) => res.json())
            .then((data) => setTotalPoints(typeof data.totalPoints === 'number' ? data.totalPoints : 0))
            .catch(() => {});
    }, []);

    if (totalPoints === null) return null;

    return (
        <div className="flex items-center gap-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-2xl p-5">
            <Zap className="w-8 h-8 text-amber-100" />
            <div>
                <p className="text-xs font-black uppercase tracking-widest text-amber-100">Total Points</p>
                <p className="text-2xl font-black">{totalPoints.toLocaleString('en-IN')}</p>
            </div>
        </div>
    );
}
