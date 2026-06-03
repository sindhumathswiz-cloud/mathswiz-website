'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send, Reply, Mail, User, ChevronDown, ChevronUp } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  subject: string | null;
  priority: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  senderId?: string;
  sender: { id?: string; firstName: string; lastName: string; role: string };
  receiver: { id?: string; firstName: string; lastName: string; role: string };
  replies?: Message[];
}

export default function StudentMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [expandedMessages, setExpandedMessages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = () => {
    fetch('/api/student/messages')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMessages(data.messages);
          setUnreadCount(data.unreadCount);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const sendReply = async (messageId: string) => {
    const content = replyContent[messageId];
    if (!content?.trim()) return;

    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    await fetch('/api/student/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replyToId: messageId,
        content,
        receiverId: message.senderId || message.receiver?.id,
      }),
    });

    setReplyContent(prev => ({ ...prev, [messageId]: '' }));
    fetchMessages();
  };

  const markAsRead = async (messageId: string) => {
    await fetch('/api/student/messages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    });
    fetchMessages();
  };

  const toggleExpand = (id: string) => {
    setExpandedMessages(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'bg-red-100 text-red-700 border-red-200';
      case 'URGENT': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg text-sm text-indigo-700">
          You have {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
        </div>
      )}

      {messages.length === 0 ? (
        <div className="text-center p-8 text-slate-500">
          <Mail className="w-12 h-12 mx-auto mb-2 text-slate-300" />
          <p>No messages yet</p>
        </div>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={`bg-white border rounded-xl overflow-hidden transition-all ${
              !message.isRead ? 'border-indigo-300 shadow-sm' : 'border-slate-200'
            }`}
          >
            <div
              className="p-4 cursor-pointer hover:bg-slate-50"
              onClick={() => {
                toggleExpand(message.id);
                if (!message.isRead) markAsRead(message.id);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-800">
                      {message.sender?.firstName} {message.sender?.lastName}
                      {message.priority !== 'NORMAL' && (
                        <span className={`ml-2 px-2 py-0.5 text-xs rounded-full border ${getPriorityColor(message.priority)}`}>
                          {message.priority}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-600">
                      {message.subject || 'No subject'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{formatTime(message.createdAt)}</span>
                  {expandedMessages[message.id] ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>
            </div>

            {expandedMessages[message.id] && (
              <div className="border-t p-4 bg-slate-50">
                <div className="text-sm text-slate-700 mb-4 whitespace-pre-wrap">
                  {message.content}
                </div>

                {/* Reply Box */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyContent[message.id] || ''}
                    onChange={(e) => setReplyContent(prev => ({ ...prev, [message.id]: e.target.value }))}
                    placeholder="Type your reply..."
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendReply(message.id);
                    }}
                  />
                  <button
                    onClick={() => sendReply(message.id)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
