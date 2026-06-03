'use client';

import { useEffect, useState } from 'react';
import { Flame, Calendar, TrendingUp, Loader2 } from 'lucide-react';

export default function StreakCalendar() {
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [totalActiveDays, setTotalActiveDays] = useState(0);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/streak')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStreak(data.currentStreak);
          setMaxStreak(data.maxStreak);
          setTotalActiveDays(data.totalActiveDays);
          setCalendar(data.calendar);
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

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-orange-500 to-red-500 p-4 rounded-xl text-white text-center">
          <Flame className="w-6 h-6 mx-auto mb-1" />
          <div className="text-2xl font-bold">{streak}</div>
          <div className="text-xs opacity-80">Current Streak</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-indigo-500 p-4 rounded-xl text-white text-center">
          <TrendingUp className="w-6 h-6 mx-auto mb-1" />
          <div className="text-2xl font-bold">{maxStreak}</div>
          <div className="text-xs opacity-80">Best Streak</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-4 rounded-xl text-white text-center">
          <Calendar className="w-6 h-6 mx-auto mb-1" />
          <div className="text-2xl font-bold">{totalActiveDays}</div>
          <div className="text-xs opacity-80">Active Days</div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white p-4 rounded-xl border">
        <h3 className="font-semibold text-sm text-slate-700 mb-3">Last 30 Days</h3>
        <div className="grid grid-cols-7 gap-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <div key={i} className="text-center text-xs font-medium text-slate-400 py-1">
              {day}
            </div>
          ))}
          {calendar.map((day, idx) => (
            <div
              key={idx}
              className={`aspect-square rounded-md flex items-center justify-center text-xs transition-all ${
                day.isActive
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-400'
              }`}
              title={`${day.date}${day.isActive ? ' - Active!' : ''}`}
            >
              {new Date(day.date).getDate()}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
            <span>Active</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-slate-100 rounded-sm"></div>
            <span>Inactive</span>
          </div>
        </div>
      </div>
    </div>
  );
}
