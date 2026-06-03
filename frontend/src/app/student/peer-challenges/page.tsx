'use client';

import { useEffect, useState } from 'react';
import { Swords, Users, Check, X, Loader2, Trophy, Clock, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function PeerChallengesPage() {
  const [peers, setPeers] = useState<any[]>([]);
  const [incoming, setIncoming] = useState<any[]>([]);
  const [active, setActive] = useState<any[]>([]);
  const [completed, setCompleted] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState('');
  const [topic, setTopic] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    fetch('/api/user/status').then(res => res.json()).then(data => {
      if (data.success) setUserId(data.user.id);
    });

    Promise.all([
      fetch('/api/student/challenges').then(res => res.json()),
      fetch('/api/student/challenges?type=incoming').then(res => res.json()),
      fetch('/api/student/challenges?type=active').then(res => res.json()),
      fetch('/api/student/challenges?type=completed').then(res => res.json()),
    ]).then(([peersData, incomingData, activeData, completedData]) => {
      if (peersData.success) setPeers(peersData.peers || []);
      if (incomingData.success) setIncoming(incomingData.challenges || []);
      if (activeData.success) setActive(activeData.challenges || []);
      if (completedData.success) setCompleted(completedData.challenges || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleCreateChallenge = async () => {
    if (!selectedPeer || !topic) {
      toast.error('Please select a peer and enter a topic');
      return;
    }
    setProcessing('create');
    try {
      const res = await fetch('/api/student/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opponentId: selectedPeer, topic }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Challenge sent!');
        setShowCreateForm(false);
        setSelectedPeer('');
        setTopic('');
      } else {
        toast.error(data.error || 'Failed to send challenge');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(null);
    }
  };

  const handleAction = async (challengeId: string, action: 'accept' | 'decline') => {
    setProcessing(challengeId);
    try {
      const res = await fetch('/api/student/challenges', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(action === 'accept' ? 'Challenge accepted!' : 'Challenge declined');
        setIncoming(incoming.filter(c => c.id !== challengeId));
        if (action === 'accept') setActive([...active, data.challenge]);
      } else {
        toast.error(data.error || 'Action failed');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Swords className="w-8 h-8 text-indigo-600" />
            Peer Challenges
          </h1>
          <p className="text-slate-500 mt-1">Challenge your classmates and compete to improve</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Challenge
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Create a Challenge</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Select Opponent</label>
              <select
                value={selectedPeer}
                onChange={(e) => setSelectedPeer(e.target.value)}
                className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Choose a classmate...</option>
                {peers.map((peer) => (
                  <option key={peer.id} value={peer.id}>
                    {peer.firstName || peer.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Calculus, Trigonometry"
                className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreateChallenge}
                disabled={processing === 'create'}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {processing === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
                Send Challenge
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="bg-slate-100 text-slate-700 px-5 py-2 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {incoming.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            Incoming Challenges ({incoming.length})
          </h2>
          <div className="grid gap-4">
            {incoming.map((challenge) => (
              <div key={challenge.id} className="bg-white p-6 rounded-xl border shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{challenge.topic}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      From: {challenge.challenger?.firstName || 'Classmate'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(challenge.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(challenge.id, 'accept')}
                      disabled={processing === challenge.id}
                      className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      Accept
                    </button>
                    <button
                      onClick={() => handleAction(challenge.id, 'decline')}
                      disabled={processing === challenge.id}
                      className="flex items-center gap-2 bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Swords className="w-5 h-5 text-indigo-600" />
            Active Challenges
          </h2>
          <div className="grid gap-4">
            {active.map((challenge) => {
              const isChallenger = challenge.challengerId === userId;
              const opponent = isChallenger ? challenge.opponent : challenge.challenger;
              return (
                <div key={challenge.id} className="bg-white p-6 rounded-xl border shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{challenge.topic}</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        vs {opponent?.firstName || 'Classmate'}
                      </p>
                    </div>
                    <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                      In Progress
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-emerald-600" />
            Completed Challenges
          </h2>
          <div className="grid gap-4">
            {completed.map((challenge) => {
              const isChallenger = challenge.challengerId === userId;
              const opponent = isChallenger ? challenge.opponent : challenge.challenger;
              const winner = challenge.winnerId === challenge.challengerId ? challenge.challenger : challenge.opponent;
              return (
                <div key={challenge.id} className="bg-white p-6 rounded-xl border shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{challenge.topic}</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        vs {opponent?.firstName || 'Classmate'}
                      </p>
                    </div>
                    {winner && (
                      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full">
                        <Trophy className="w-4 h-4" />
                        <span className="text-sm font-medium">
                          Winner: {winner?.firstName || 'Unknown'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {incoming.length === 0 && active.length === 0 && completed.length === 0 && (
        <div className="bg-white p-12 rounded-xl border text-center">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700">No challenges yet</h3>
          <p className="text-slate-500 mt-1">Create a new challenge to get started!</p>
        </div>
      )}
    </div>
  );
}
