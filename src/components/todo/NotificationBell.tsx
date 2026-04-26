'use client';

import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';

export default function NotificationBell({ className = '' }: { className?: string }) {
  const { items } = useNotifications();
  const [open, setOpen] = useState(false);
  const count = items.length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="알림"
        className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full text-gray-500 hover:bg-gray-100 ${className}`}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-amber-500" />
                <h2 className="text-lg font-bold">알림 ({count})</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400">
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {items.length === 0 ? (
                <div className="text-sm text-gray-400 py-10 text-center">
                  알림이 없어요.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((n) => (
                    <NotifRow key={`${n.task_id}-${n.lead_minutes}`} item={n} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function NotifRow({ item }: { item: NotificationItem }) {
  const time = new Date(item.due_at);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const remaining = item.remaining_min;
  const remainingLabel =
    remaining < 1
      ? '곧 시작'
      : remaining < 60
        ? `${remaining}분 후`
        : `${Math.floor(remaining / 60)}시간 ${remaining % 60}분 후`;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-amber-50 rounded-xl border border-amber-100">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-800 truncate">{item.title}</div>
        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
          <span className="text-amber-700 font-bold">{hh}:{mm}</span>
          <span>· {remainingLabel}</span>
          {item.member && (
            <span className="inline-flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.member.color }}
              />
              {item.member.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
