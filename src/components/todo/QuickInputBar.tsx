'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Sparkles, X } from 'lucide-react';
import type { Task, TaskPriority, RecurrenceRule } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

interface ParsedDraft {
  kind: 'event' | 'todo';
  start_date: string | null;
  deadline_date: string | null;
  deadline_time: string | null;
  type: 'one_time' | 'routine';
  title: string;
  is_fixed: boolean;
  due_date: string | null;
  end_date: string | null;
  due_time: string | null;
  end_time: string | null;
  member_ids: string[];
  category_main: string;
  category_sub: string;
  priority: TaskPriority;
  recurrence: RecurrenceRule | null;
  memo: string;
  confidence: 'high' | 'medium' | 'low';
}

interface Props {
  /** 파싱 성공 후 미리보기 후 "수정 후 저장" 누르면 이 함수가 호출됨 — 상위가 TaskFormSheet 열기 */
  onPrefillForm: (draft: Partial<Task>) => void;
  /** 직접 저장(수정 없이) 도 지원 */
  onSavedDirectly?: () => void;
}

export default function QuickInputBar({ onPrefillForm, onSavedDirectly }: Props) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const toggleVoice = () => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('이 브라우저는 음성 인식을 지원하지 않아요. 크롬을 사용하시거나 텍스트로 입력해주세요.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setText((prev) => (prev ? prev + ' ' + transcript : transcript));
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const parse = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    setDraft(null);
    try {
      const res = await fetch('/api/tasks/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), household_id: HOUSEHOLD_ID }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '파싱 실패');
      setDraft(data.draft);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '파싱 실패');
    } finally {
      setBusy(false);
    }
  };

  const directSave = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const payload = draftToTaskPayload(draft);
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, household_id: HOUSEHOLD_ID, raw_input: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장 실패');
      setText('');
      setDraft(null);
      onSavedDirectly?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const editAndSave = () => {
    if (!draft) return;
    const payload = draftToTaskPayload(draft);
    onPrefillForm(payload);
    setText('');
    setDraft(null);
  };

  const dismiss = () => {
    setDraft(null);
    setErr(null);
  };

  return (
    <div className="px-3 py-2 bg-white border border-amber-200 rounded-2xl shadow-sm">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-amber-500 shrink-0" />
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) parse();
          }}
          placeholder="자연어로 일정 추가  예: 내일 오후 3시 회의"
          className="flex-1 bg-transparent text-sm focus:outline-none placeholder-gray-400"
          disabled={busy}
        />
        <button
          type="button"
          onClick={toggleVoice}
          aria-label={listening ? '듣는 중 (눌러서 중지)' : '음성 입력'}
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            listening
              ? 'bg-rose-500 text-white animate-pulse'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {listening ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button
          type="button"
          onClick={parse}
          disabled={busy || !text.trim()}
          className="shrink-0 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-bold disabled:opacity-50"
        >
          {busy && !draft ? '…' : 'AI'}
        </button>
      </div>

      {err && <div className="text-[11px] text-rose-500 mt-1.5 px-1">{err}</div>}

      {draft && (
        <div className="mt-2 p-3 bg-amber-50 rounded-xl border border-amber-100 relative">
          <button
            onClick={dismiss}
            className="absolute top-1.5 right-1.5 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
          <div className="text-[11px] text-amber-700 font-bold mb-1">
            🤖 이렇게 이해했어요{draft.confidence === 'low' ? ' (확신 낮음)' : ''}
          </div>
          <div className="text-sm font-bold text-gray-800 mb-1">
            <span className="mr-1 text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-amber-200">
              {draft.kind === 'todo' ? '✅ 할일' : '📅 일정'}
            </span>
            {draft.title}
          </div>
          <div className="text-xs text-gray-600 space-y-0.5">
            {draft.kind === 'todo' ? (
              <div>
                📌
                {draft.start_date && draft.start_date !== draft.deadline_date
                  ? ` ${draft.start_date} ~ ${draft.deadline_date ?? '?'}`
                  : ` ${draft.deadline_date ?? '?'}`}
                {draft.deadline_time ? ` ${draft.deadline_time.slice(0, 5)}` : ''}
              </div>
            ) : (
              <div>
                📅 {draft.due_date ?? '?'}
                {draft.end_date && draft.end_date !== draft.due_date
                  ? ` ~ ${draft.end_date}`
                  : ''}
                {draft.is_fixed && draft.due_time
                  ? ` · ⏰ ${draft.due_time.slice(0, 5)}` +
                    (draft.end_time && draft.end_time !== draft.due_time
                      ? `~${draft.end_time.slice(0, 5)}`
                      : '')
                  : ' · 종일'}
              </div>
            )}
            {draft.type === 'routine' && draft.recurrence && (
              <div>🔁 {describeRecurrence(draft.recurrence)}</div>
            )}
            {draft.member_ids.length > 0 && <div>👤 {draft.member_ids.length}명 담당</div>}
            {draft.category_main && (
              <div>
                🏷 {draft.category_main}
                {draft.category_sub ? ` · ${draft.category_sub}` : ''}
              </div>
            )}
            {draft.priority !== 'normal' && (
              <div>{draft.priority === 'high' ? '⚠ 높음' : '⬇ 낮음'}</div>
            )}
          </div>
          <div className="flex gap-1.5 mt-3">
            <button
              onClick={editAndSave}
              className="flex-1 py-2 rounded-lg bg-white border border-amber-300 text-amber-700 text-sm font-semibold"
            >
              수정 후 저장
            </button>
            <button
              onClick={directSave}
              disabled={busy}
              className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy ? '저장 중…' : '바로 추가'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function describeRecurrence(rule: RecurrenceRule): string {
  switch (rule.freq) {
    case 'daily':
      return '매일';
    case 'weekly': {
      const labels = ['일', '월', '화', '수', '목', '금', '토'];
      const days = (rule.weekdays ?? []).map((d) => labels[d]).join('·');
      return days ? `매주 ${days}요일` : '매주';
    }
    case 'monthly':
      return rule.lunar ? '매월(음력)' : '매월';
    case 'yearly':
      return rule.lunar ? '매년(음력)' : '매년';
    case 'interval':
      return `${rule.every_days}일마다`;
    default:
      return '';
  }
}

// Draft 를 task POST 페이로드로 변환
function draftToTaskPayload(draft: ParsedDraft): Partial<Task> & {
  type: Task['type'];
  title: string;
} {
  return {
    kind: draft.kind,
    start_date: draft.kind === 'todo' ? draft.start_date : null,
    deadline_date: draft.kind === 'todo' ? draft.deadline_date : null,
    deadline_time: draft.kind === 'todo' ? draft.deadline_time : null,
    type: draft.type,
    title: draft.title,
    memo: draft.memo,
    category_main: draft.category_main,
    category_sub: draft.category_sub,
    member_id: draft.member_ids[0] ?? null,
    target_member_ids: draft.member_ids,
    is_fixed: draft.kind === 'event' ? draft.is_fixed : false,
    due_date: draft.kind === 'event' ? draft.due_date : null,
    end_date:
      draft.kind === 'event' && draft.type === 'one_time' ? draft.end_date : null,
    due_time: draft.kind === 'event' ? draft.due_time : null,
    end_time: draft.kind === 'event' ? draft.end_time : null,
    priority: draft.priority,
    recurrence:
      draft.kind === 'event' && draft.type === 'routine' ? draft.recurrence : null,
  };
}
