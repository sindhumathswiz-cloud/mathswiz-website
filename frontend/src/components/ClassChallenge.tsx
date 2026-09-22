'use client';

import { useEffect, useState } from 'react';
import { Trophy, Medal, Award, Loader2, Swords, Target } from 'lucide-react';

interface ChallengeRankEntry {
  userId: string;
  name: string;
  image: string | null;
  value: number;
  rank: number;
}

interface ClassChallengeData {
  id: string;
  title: string;
  metric: 'MOST_PRACTICE' | 'MASTERY_GAIN' | 'POINTS_EARNED';
  startDate: string;
  endDate: string;
}

const METRIC_LABEL: Record<ClassChallengeData['metric'], string> = {
  MOST_PRACTICE: 'questions practiced',
  MASTERY_GAIN: 'mastery gained',
  POINTS_EARNED: 'points earned',
};

function getRankIcon(rank: number) {
  switch (rank) {
    case 1: return <Trophy className="w-5 h-5 text-yellow-500" />;
    case 2: return <Medal className="w-5 h-5 text-gray-400" />;
    case 3: return <Award className="w-5 h-5 text-amber-600" />;
    default: return <span className="text-sm font-medium text-slate-500">#{rank}</span>;
  }
}

function getRankBadge(rank: number) {
  switch (rank) {
    case 1: return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white';
    case 2: return 'bg-gradient-to-r from-gray-300 to-gray-400 text-white';
    case 3: return 'bg-gradient-to-r from-amber-500 to-amber-700 text-white';
    default: return 'bg-slate-100 text-slate-600';
  }
}

export default function ClassChallenge() {
  const [challenge, setChallenge] = useState<ClassChallengeData | null>(null);
  const [ranking, setRanking] = useState<ChallengeRankEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/challenges/class')
      .then((res) => res.json())
      .then((data) => {
        setChallenge(data.challenge ?? null);
        setRanking(data.ranking ?? []);
        setUserRank(data.userRank ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="text-center p-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        <Swords className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="font-medium text-slate-600">No class challenge is running in your batch right now.</p>
      </div>
    );
  }

  const endDate = new Date(challenge.endDate);
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000));

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-xl">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-5 h-5" />
          <h3 className="font-bold">{challenge.title}</h3>
        </div>
        <p className="text-sm opacity-90">
          Ranked by {METRIC_LABEL[challenge.metric]} · {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'ending soon'}
        </p>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-3 border-b bg-slate-50">
          <h3 className="font-semibold text-sm text-slate-700">Standings</h3>
        </div>
        {ranking.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No activity yet — be the first to make a move.</p>
        ) : (
          <div className="divide-y">
            {ranking.map((entry) => (
              <div
                key={entry.userId}
                className={`p-3 flex items-center gap-3 ${entry.rank === userRank ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${getRankBadge(entry.rank)}`}>
                  {entry.rank <= 3 ? getRankIcon(entry.rank) : entry.rank}
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-600">
                  {entry.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{entry.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-800">{entry.value}</div>
                  <div className="text-xs text-slate-500">{METRIC_LABEL[challenge.metric]}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {userRank && (
        <div className="bg-indigo-600 text-white p-4 rounded-xl text-center">
          <div className="text-2xl font-bold">#{userRank}</div>
          <div className="text-sm opacity-90">Your rank out of {ranking.length} students</div>
        </div>
      )}
    </div>
  );
}
