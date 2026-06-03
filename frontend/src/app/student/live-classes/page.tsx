'use client';

import { useEffect, useState } from 'react';
import { Calendar, Video, Clock, Loader2, PlayCircle } from 'lucide-react';

export default function StudentLiveClassesPage() {
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [past, setPast] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/live-classes')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setUpcoming(data.upcoming || []);
          setPast(data.past || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Live Classes</h1>
        <p className="text-slate-500 mt-1">Join your scheduled classes and watch recordings</p>
      </div>

      <section>
        <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          Upcoming Classes
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-slate-500 bg-white p-6 rounded-lg border">No upcoming classes scheduled.</p>
        ) : (
          <div className="grid gap-4">
            {upcoming.map((cls: any) => (
              <div key={cls.id} className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900">{cls.title}</h3>
                    <p className="text-sm text-slate-500">{cls.batch?.name}</p>
                    <div className="flex items-center gap-4 text-sm text-slate-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(cls.startTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(cls.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - 
                        {new Date(cls.endTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <a
                    href={cls.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
                  >
                    <Video className="w-4 h-4" />
                    Join Now
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-emerald-600" />
            Recordings
          </h2>
          <div className="grid gap-4">
            {past.map((cls: any) => (
              <div key={cls.id} className="bg-white p-6 rounded-xl shadow-sm border hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900">{cls.title}</h3>
                    <p className="text-sm text-slate-500">{cls.batch?.name}</p>
                    <div className="flex items-center gap-4 text-sm text-slate-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(cls.startTime).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {new Date(cls.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  {cls.recordingUrl && (
                    <a
                      href={cls.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-emerald-700 transition-colors"
                    >
                      <PlayCircle className="w-4 h-4" />
                      Watch Recording
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
