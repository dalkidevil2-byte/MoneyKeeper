'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Link as LinkIcon, X, CheckCircle2 } from 'lucide-react';
import dayjs from 'dayjs';

type Status =
  | { connected: false }
  | {
      connected: true;
      email: string | null;
      calendar_id: string;
      connected_at: string;
      last_synced_at: string | null;
    };

export default function GoogleCalendarSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/google-calendar/status');
      const j = await res.json();
      setStatus(j);
    } catch {
      setStatus({ connected: false });
    }
  };

  useEffect(() => {
    load();
    // 콜백 후 쿼리 파라미터 처리
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('gcal') === 'connected') {
      setMsg('구글 캘린더 연결 완료!');
      // URL 정리
      window.history.replaceState({}, '', window.location.pathname);
    } else if (sp.get('gcal_error')) {
      setMsg(`연결 실패: ${sp.get('gcal_error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const connect = () => {
    window.location.href = '/api/google-calendar/auth';
  };

  const disconnect = async () => {
    if (!confirm('구글 캘린더 연결을 해제할까요?\n(이미 동기화된 일정은 그대로 둡니다)')) return;
    setBusy(true);
    try {
      await fetch('/api/google-calendar/status', { method: 'DELETE' });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/google-calendar/sync', { method: 'POST' });
      if (!res.ok) {
        setSyncResult('동기화 실패');
        return;
      }
      const j = await res.json();
      const { pushed, pulled } = j;
      setSyncResult(
        `↑ 보냄 ${pushed} · ↓ 받음 신규 ${pulled.created}, 수정 ${pulled.updated}, 삭제 ${pulled.deleted}`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="text-sm font-bold text-gray-700 mb-2">📅 구글 캘린더 동기화</h2>

      {msg && (
        <div className="mb-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-3 py-2 text-xs">
          {msg}
        </div>
      )}

      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        {!status ? (
          <div className="text-sm text-gray-400 text-center py-3">불러오는 중…</div>
        ) : !status.connected ? (
          <>
            <p className="text-sm text-gray-600 mb-3">
              우리 앱의 일정을 구글 캘린더로 자동 동기화해요.
              <br />
              <span className="text-xs text-gray-400">
                Galaxy 의 구글 캘린더 위젯에서 바로 보기 가능
              </span>
            </p>
            <button
              onClick={connect}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 active:bg-indigo-700"
            >
              <LinkIcon size={14} /> 구글 계정 연결
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2 mb-3">
              <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {status.email ?? '연결됨'}
                </div>
                <div className="text-[11px] text-gray-500">
                  연결: {dayjs(status.connected_at).format('YYYY.MM.DD HH:mm')}
                  {status.last_synced_at && (
                    <span className="ml-2">
                      · 동기화: {dayjs(status.last_synced_at).format('M/D HH:mm')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {syncResult && (
              <div className="mb-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg px-3 py-2 text-xs">
                {syncResult}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={sync}
                disabled={busy}
                className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1 active:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> 지금 동기화
              </button>
              <button
                onClick={disconnect}
                disabled={busy}
                className="px-4 py-2 rounded-xl border border-rose-200 text-rose-500 text-sm font-semibold inline-flex items-center gap-1 active:bg-rose-50 disabled:opacity-50"
              >
                <X size={13} /> 해제
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
              일정 추가/수정/삭제 시 자동으로 구글 캘린더에 반영돼요.
              <br />
              구글에서 만든 일정은 "지금 동기화" 버튼으로 가져옵니다.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
