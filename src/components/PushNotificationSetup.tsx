'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

export default function PushNotificationSetup() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setSupported(ok);
    if (ok) {
      setPermission(Notification.permission);
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription().then((s) => setSubscribed(!!s)),
      ).catch(() => setSubscribed(false));
    }
  }, []);

  const subscribe = async () => {
    if (!VAPID_PUBLIC) {
      setMsg('VAPID 공개키가 설정 안 됨 (NEXT_PUBLIC_VAPID_PUBLIC_KEY).');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // 1) 권한 요청
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setMsg('알림 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.');
        return;
      }
      // 2) Service Worker 등록
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // 3) 푸시 구독
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as unknown as ArrayBuffer,
      });
      // 4) 서버 저장
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          ua: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? '서버 저장 실패');
      }
      setSubscribed(true);
      setMsg('✅ 알림 활성화됨');
    } catch (e) {
      setMsg(`실패: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: 'DELETE' },
        );
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg('알림 해제됨');
    } catch (e) {
      setMsg(`실패: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      setMsg(`전송: ${j.sent}건 / 실패: ${j.failed}건`);
    } catch (e) {
      setMsg(`실패: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-xs text-gray-500">
        🚫 이 브라우저는 푸시 알림을 지원하지 않아요. iOS Safari 면 홈 화면에 추가한 후 사용해주세요.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {subscribed ? (
            <Bell size={16} className="text-emerald-600" />
          ) : (
            <BellOff size={16} className="text-gray-400" />
          )}
          <span className="text-sm font-bold text-gray-900">앱 알림</span>
          {subscribed && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">
              ON
            </span>
          )}
        </div>
        {subscribed === null ? (
          <Loader2 size={14} className="animate-spin text-gray-400" />
        ) : subscribed ? (
          <button
            onClick={unsubscribe}
            disabled={busy}
            className="text-xs text-rose-500 font-semibold disabled:opacity-50"
          >
            해제
          </button>
        ) : (
          <button
            onClick={subscribe}
            disabled={busy || permission === 'denied'}
            className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin inline" /> : '🔔 알림 켜기'}
          </button>
        )}
      </div>

      {permission === 'denied' && (
        <p className="text-[11px] text-rose-500 leading-relaxed">
          ⚠️ 브라우저에서 알림 권한이 차단됨. 주소창 자물쇠 아이콘 → 사이트 설정 →
          알림 → 허용으로 변경 후 새로고침.
        </p>
      )}

      {subscribed && (
        <button
          onClick={sendTest}
          disabled={busy}
          className="w-full py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold disabled:opacity-50"
        >
          🧪 테스트 알림 보내기
        </button>
      )}

      {msg && (
        <p className="text-[11px] text-gray-500 px-1">{msg}</p>
      )}

      <p className="text-[10px] text-gray-400 leading-relaxed">
        📱 모바일은 홈 화면에 PWA 로 추가한 후 알림 켜기 권장. iOS 는 16.4+ 에서만 PWA 푸시 지원.
      </p>
    </div>
  );
}
