'use client';

import { useEffect, useState } from 'react';
import { Trophy, Medal, Award, Loader2, TrendingUp, Flame, Star } from 'lucide-react';

interface LeaderboardEntry {
  userId: string;
  name: string;
  image: string | null;
  rank: number;
  avgTestScore: number;
  totalPoints: number;
  streak: number;
  testsCompleted: number;
  combinedScore: number;
}

export default function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/leaderboard')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setLeaderboard(data.leaderboard);
          setUserRank(data.userRank);
          setTotalStudents(data.totalStudents);
        }
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

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="text-sm font-medium text-slate-500">#{rank}</span>;
    }
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white';
      case 2:
        return 'bg-gradient-to-r from-gray-300 to-gray-400 text-white';
      case 3:
        return 'bg-gradient-to-r from-amber-500 to-amber-700 text-white';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top 3 Podium */}
      {leaderboard.length >= 3 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {/* 2nd Place */}
          <div className="flex flex-col items-center justify-end">
            <div className="bg-gradient-to-b from-gray-100 to-gray-200 p-3 rounded-xl text-center w-full">
              <div className="w-10 h-10 rounded-full bg-gray-400 text-white flex items-center justify-center mx-auto mb-1">
                {leaderboard[1].name.charAt(0)}
              </div>
              <div className="text-xs font-medium truncate">{leaderboard[1].name.split(' ')[0]}</div>
              <div className="text-xs text-gray-600">{leaderboard[1].combinedScore} pts</div>
            </div>
            <div className="h-16 w-full bg-gray-200 rounded-b-lg flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-500">2</span>
            </div>
          </div>
          
          {/* 1st Place */}
          <div className="flex flex-col items-center justify-end">
            <div className="bg-gradient-to-b from-yellow-100 to-amber-200 p-3 rounded-xl text-center w-full">
              <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center mx-auto mb-1">
                <Trophy className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold truncate">{leaderboard[0].name.split(' ')[0]}</div>
              <div className="text-xs text-amber-700">{leaderboard[0].combinedScore} pts</div>
            </div>
            <div className="h-24 w-full bg-amber-200 rounded-b-lg flex items-center justify-center">
              <span className="text-3xl font-bold text-amber-600">1</span>
            </div>
          </div>
          
          {/* 3rd Place */}
          <div className="flex flex-col items-center justify-end">
            <div className="bg-gradient-to-b from-amber-50 to-amber-100 p-3 rounded-xl text-center w-full">
              <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center mx-auto mb-1">
                {leaderboard[2].name.charAt(0)}
              </div>
              <div className="text-xs font-medium truncate">{leaderboard[2].name.split(' ')[0]}</div>
              <div className="text-xs text-amber-600">{leaderboard[2].combinedScore} pts</div>
            </div>
            <div className="h-12 w-full bg-amber-100 rounded-b-lg flex items-center justify-center">
              <span className="text-xl font-bold text-amber-500">3</span>
            </div>
          </div>
        </div>
      )}

      {/* Full Leaderboard List */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-3 border-b bg-slate-50">
          <h3 className="font-semibold text-sm text-slate-700">All Rankings</h3>
        </div>
        <div className="divide-y">
          {leaderboard.map((entry) => (
            <div
              key={entry.userId}
              className={`p-3 flex items-center gap-3 ${
                entry.userId === leaderboard.find(e => e.rank === userRank)?.userId
                  ? 'bg-indigo-50 border-l-4 border-indigo-500'
                  : ''
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${getRankBadge(entry.rank)}`}>
                {entry.rank <= 3 ? getRankIcon(entry.rank) : entry.rank}
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-slate-600">
                {entry.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{entry.name}</div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" /> {entry.totalPoints} pts
                  </span>
                  <span className="flex items-center gap-1">
                    <Flame className="w-3 h-3" /> {entry.streak}🔥
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" /> {entry.testsCompleted} tests
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-800">{entry.combinedScore}</div>
                <div className="text-xs text-slate-500">score</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Your Rank */}
      {userRank && (
        <div className="bg-indigo-600 text-white p-4 rounded-xl text-center">
          <div className="text-2xl font-bold">#{userRank}</div>
          <div className="text-sm opacity-90">Your rank out of {totalStudents} students</div>
        </div>
      )}
    </div>
  );
}
