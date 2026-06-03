'use client';

import { useEffect, useState, useRef } from 'react';
import { Bell, Loader2, CheckCheck, Award, Flame, Star, MessageSquare, AlertCircle } from 'lucide-react';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = () => {
    fetch('/api/student/notifications')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNotifications(data.notifications);
          setUnreadCount(data.unreadCount);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const markAsRead = async (id: string) => {
    await fetch('/api/student/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationIds: [id] }),
    });
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    await fetch('/api/student/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationIds: [] }),
    });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'BADGE_EARNED':
        return <Award className="w-4 h-4 text-amber-500" />;
      case 'POINTS_AWARDED':
        return <Star className="w-4 h-4 text-yellow-500" />;
      case 'STREAK_MILESTONE':
        return <Flame className="w-4 h-4 text-orange-500" />;
      case 'MESSAGE':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'REMINDER':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border overflow-hidden z-50">
          <div className="p-3 border-b bg-slate-50 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-slate-700">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 border-b last:border-b-0 cursor-pointer transition-colors ${
                    !notification.isRead ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">{getIcon(notification.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">
                        {notification.title}
                      </div>
                      <div className="text-xs text-slate-600 line-clamp-2">
                        {notification.message}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {formatTime(notification.createdAt)}
                      </div>
                    </div>
                    {!notification.isRead && (
                      <div className="w-2 h-2 bg-indigo-600 rounded-full mt-1 flex-shrink-0"></div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
