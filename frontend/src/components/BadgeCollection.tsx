'use client';

import { useEffect, useState } from 'react';
import { Loader2, Award, Star, Flame, Target, Trophy, BookOpen, Zap, Heart, Shield, Crown, Gem } from 'lucide-react';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  points: number;
  isEarned: boolean;
  earnedAt?: string;
}

export default function BadgeCollection() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'earned' | 'available'>('all');

  useEffect(() => {
    fetch('/api/student/badges?type=all')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setBadges(data.badges);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getIcon = (iconName: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      trophy: <Trophy className="w-6 h-6" />,
      star: <Star className="w-6 h-6" />,
      flame: <Flame className="w-6 h-6" />,
      target: <Target className="w-6 h-6" />,
      book: <BookOpen className="w-6 h-6" />,
      zap: <Zap className="w-6 h-6" />,
      heart: <Heart className="w-6 h-6" />,
      shield: <Shield className="w-6 h-6" />,
      crown: <Crown className="w-6 h-6" />,
      gem: <Gem className="w-6 h-6" />,
      award: <Award className="w-6 h-6" />,
    };
    return iconMap[iconName] || <Award className="w-6 h-6" />;
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ACHIEVEMENT': return 'from-amber-400 to-yellow-500';
      case 'STREAK': return 'from-orange-400 to-red-500';
      case 'PRACTICE': return 'from-emerald-400 to-teal-500';
      case 'TEST': return 'from-indigo-400 to-purple-500';
      case 'SPECIAL': return 'from-pink-400 to-rose-500';
      default: return 'from-slate-400 to-slate-500';
    }
  };

  const filteredBadges = badges.filter(badge => {
    if (filter === 'earned') return badge.isEarned;
    if (filter === 'available') return !badge.isEarned;
    return true;
  });

  const earnedCount = badges.filter(b => b.isEarned).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-4 rounded-xl text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">{earnedCount}/{badges.length}</div>
            <div className="text-sm opacity-90">Badges Earned</div>
          </div>
          <Award className="w-12 h-12 opacity-50" />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'earned', 'available'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filteredBadges.map((badge) => (
          <div
            key={badge.id}
            className={`relative p-4 rounded-xl border transition-all ${
              badge.isEarned
                ? 'border-indigo-300 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 opacity-75'
            }`}
          >
            {/* Badge Icon */}
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                badge.isEarned
                  ? `bg-gradient-to-br ${getCategoryColor(badge.category)} text-white shadow-md`
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              {getIcon(badge.icon)}
            </div>

            {/* Badge Info */}
            <div className="text-center">
              <h4 className="font-medium text-sm text-slate-800 truncate">{badge.name}</h4>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{badge.description}</p>
              {badge.isEarned && badge.earnedAt && (
                <div className="text-xs text-indigo-600 mt-2">
                  Earned {new Date(badge.earnedAt).toLocaleDateString()}
                </div>
              )}
              {!badge.isEarned && (
                <div className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-1">
                  <Star className="w-3 h-3" /> {badge.points} pts
                </div>
              )}
            </div>

            {/* Earned Badge */}
            {badge.isEarned && (
              <div className="absolute top-2 right-2">
                <div className="w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredBadges.length === 0 && (
        <div className="text-center p-8 text-slate-500">
          <Award className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p>No badges to display</p>
        </div>
      )}
    </div>
  );
}
