'use client';

import { useEffect, useState } from 'react';
import { Loader2, Award, Star, Flame, Target, Trophy, BookOpen, Zap, Heart, Shield, Crown, Gem, Footprints, Sword, MessageCircle } from 'lucide-react';

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
      footprints: <Footprints className="w-6 h-6" />,
      sword: <Sword className="w-6 h-6" />,
      'message-circle': <MessageCircle className="w-6 h-6" />,
    };
    return iconMap[iconName] || <Award className="w-6 h-6" />;
  };

  // Matches BADGE_DEFINITIONS' stored category values (gamification.ts):
  // 'achievement' | 'milestone' | 'special'.
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'achievement': return 'from-amber-400 to-yellow-500';
      case 'milestone': return 'from-orange-400 to-red-500';
      case 'special': return 'from-pink-400 to-rose-500';
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
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-brand dark:to-brand-violet p-4 rounded-xl text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold font-display">{earnedCount}/{badges.length}</div>
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
                ? 'bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet text-white'
                : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
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
                ? 'border-indigo-300 dark:border-brand/30 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-brand/10 dark:to-brand-violet/10 shadow-sm'
                : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 opacity-75'
            }`}
          >
            {/* Badge Icon */}
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 ${
                badge.isEarned
                  ? `bg-gradient-to-br ${getCategoryColor(badge.category)} text-white shadow-md`
                  : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500'
              }`}
            >
              {getIcon(badge.icon)}
            </div>

            {/* Badge Info */}
            <div className="text-center">
              <h4 className="font-display font-medium text-sm text-slate-800 dark:text-white truncate">{badge.name}</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{badge.description}</p>
              {badge.isEarned && badge.earnedAt && (
                <div className="text-xs text-indigo-600 dark:text-brand mt-2">
                  Earned {new Date(badge.earnedAt).toLocaleDateString()}
                </div>
              )}
              {!badge.isEarned && (
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-2 flex items-center justify-center gap-1">
                  <Star className="w-3 h-3" /> {badge.points} pts
                </div>
              )}
            </div>

            {/* Earned Badge */}
            {badge.isEarned && (
              <div className="absolute top-2 right-2">
                <div className="w-4 h-4 bg-emerald-500 dark:bg-emerald-400 rounded-full flex items-center justify-center">
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
        <div className="text-center p-8 text-slate-500 dark:text-slate-400">
          <Award className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          <p>No badges to display</p>
        </div>
      )}
    </div>
  );
}
