'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { Plus, Trash2, RefreshCw, ExternalLink, X, Settings as SettingsIcon } from 'lucide-react';
import type { TodoNotionSource } from '@/types';

dayjs.locale('ko');

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export default function TodoSettingsPage() {
  const [sources, setSources] = useState<TodoNotionSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const fetchSources = () => {
    setLoading(true);
    fetch(`/api/todo/notion-sources?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setSources(d.sources ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSources();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-white pb-24">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">할일 설정</h1>
        <p className="text-sm text-gray-500 mt-1">노션 연동 등 할일 관련 설정</p>
      </div>

      <div className="px-5 space-y-5">
        <NotificationSettingsSection />
        <TelegramSettingsSection />

        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-700">📒 노션 가져오기</h2>
            <button
              onClick={() => setAdding(true)}
              className="text-xs font-semibold text-indigo-600 inline-flex items-center gap-1"
            >
              <Plus size={14} /> 소스 추가
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            노션 Integration 토큰 + Date 속성이 있는 DB URL을 등록하면, 그 DB의 페이지들을
            할일로 가져올 수 있어요. (단방향 · 가져온 후 수정해도 노션엔 반영 안 됨)
            <br />
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-indigo-500 underline mt-1"
            >
              <ExternalLink size={11} /> Notion Integration 만들기
            </a>
          </p>

          {loading ? (
            <div className="text-sm text-gray-400 py-6 text-center">불러오는 중…</div>
          ) : sources.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              등록된 소스가 없어요.
            </div>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <SourceCard key={s.id} source={s} onChanged={fetchSources} />
              ))}
            </div>
          )}
        </section>
      </div>

      {adding && <AddSourceSheet onClose={() => setAdding(false)} onSaved={fetchSources} />}
    </div>
  );
}

function SourceCard({
  source,
  onChanged,
}: {
  source: TodoNotionSource;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const handleImport = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/todo/notion-sources/${source.id}/import`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실패');
      setResult(
        `총 ${data.total}건 · 추가 ${data.inserted}` +
          (data.updated ? ` · 변경 ${data.updated}` : '') +
          ` · 스킵 ${data.skipped}` +
          (data.removed ? ` · 삭제 ${data.removed}` : ''),
      );
      onChanged();
    } catch (e: unknown) {
      setResult('❌ ' + (e instanceof Error ? e.message : '실패'));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`"${source.name}" 소스를 삭제할까요? (가져온 할일은 그대로 남아요)`)) return;
    await fetch(`/api/todo/notion-sources/${source.id}`, { method: 'DELETE' });
    onChanged();
  };

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-800 truncate">{source.name}</div>
          <div className="text-[11px] text-gray-400 mt-0.5 truncate">
            {source.database_url || source.database_id}
          </div>
          <div className="text-[11px] text-gray-500 mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
            <span>제목: {source.title_property || '(자동)'}</span>
            <span>날짜: {source.date_property || '(자동)'}</span>
            {source.category_property && <span>분류: {source.category_property}</span>}
            {source.member_property && <span>담당: {source.member_property}</span>}
            {source.filter_property && (
              <span className="text-amber-600 font-semibold">
                필터: ☑ {source.filter_property}
              </span>
            )}
          </div>
          {source.last_imported_at && (
            <div className="text-[11px] text-gray-400 mt-1">
              마지막 가져오기: {dayjs(source.last_imported_at).format('YYYY-MM-DD HH:mm')}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 text-gray-400 hover:text-indigo-600"
            aria-label="설정"
          >
            <SettingsIcon size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 text-gray-400 hover:text-rose-500"
            aria-label="삭제"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <button
        onClick={handleImport}
        disabled={busy}
        className="mt-3 w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
      >
        <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        {busy ? '가져오는 중…' : '지금 가져오기'}
      </button>
      {result && <div className="text-xs text-gray-500 mt-2 text-center">{result}</div>}

      {editing && (
        <EditSourceSheet
          source={source}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

interface PropMeta {
  name: string;
  type: string;
}

function EditSourceSheet({
  source,
  onClose,
  onSaved,
}: {
  source: TodoNotionSource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [props, setProps] = useState<PropMeta[]>([]);
  const [scanning, setScanning] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState(source.name);
  const [title, setTitle] = useState(source.title_property);
  const [date, setDate] = useState(source.date_property);
  const [category, setCategory] = useState(source.category_property);
  const [member, setMember] = useState(source.member_property);
  const [filter, setFilter] = useState(source.filter_property);

  useEffect(() => {
    setScanning(true);
    fetch(`/api/todo/notion-sources/${source.id}/scan`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setProps(d.scan?.properties ?? []);
      })
      .catch((e) => setErr(e?.message ?? '스캔 실패'))
      .finally(() => setScanning(false));
  }, [source.id]);

  const titleOpts = props.filter((p) => p.type === 'title').map((p) => p.name);
  const dateOpts = props.filter((p) => p.type === 'date').map((p) => p.name);
  const peopleOpts = props.filter((p) => p.type === 'people').map((p) => p.name);
  const categoryOpts = props
    .filter((p) => p.type === 'select' || p.type === 'multi_select')
    .map((p) => p.name);
  const filterOpts = props.filter((p) => p.type === 'checkbox').map((p) => p.name);

  const submit = async () => {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/todo/notion-sources/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          title_property: title,
          date_property: date,
          category_property: category,
          member_property: member,
          filter_property: filter,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실패');
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '실패');
    } finally {
      setSaving(false);
    }
  };

  const Selector = ({
    label,
    value,
    onChange,
    options,
    hint,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: string[];
    hint?: string;
  }) => (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
      >
        <option value="">(없음)</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <div className="text-[11px] text-gray-400 mt-1">{hint}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">속성 매핑 편집</h2>
          <button onClick={onClose} className="text-gray-400">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">별칭</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </div>
          {scanning ? (
            <div className="text-sm text-gray-400 py-4 text-center">노션 속성 스캔 중…</div>
          ) : (
            <>
              <Selector label="제목 (title)" value={title} onChange={setTitle} options={titleOpts} />
              <Selector
                label="날짜 (date)"
                value={date}
                onChange={setDate}
                options={dateOpts}
                hint="이 속성에 날짜가 있어야 캘린더에 표시돼요."
              />
              <Selector
                label="담당자 (people)"
                value={member}
                onChange={setMember}
                options={peopleOpts}
              />
              <Selector
                label="분류 (select/multi-select)"
                value={category}
                onChange={setCategory}
                options={categoryOpts}
              />
              <Selector
                label="가져오기 필터 (checkbox)"
                value={filter}
                onChange={setFilter}
                options={filterOpts}
                hint="선택 시 그 체크박스가 ☑인 행만 가져와요. 빈 칸이면 모두 가져옴."
              />
            </>
          )}
          {err && (
            <div className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{err}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100">
          <button
            onClick={submit}
            disabled={saving || scanning}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddSourceSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    if (!token.trim() || !url.trim()) {
      setErr('토큰과 DB URL을 모두 입력해주세요.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/todo/notion-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          name,
          notion_token: token.trim(),
          database_url: url.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실패');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">노션 소스 추가</h2>
          <button onClick={onClose} className="text-gray-400">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">별칭 (선택)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 회사 캘린더"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              Integration Token (secret_…)
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ntn_… 또는 secret_…"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono"
            />
            <div className="text-[11px] text-gray-400 mt-1">
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 underline"
              >
                Notion Integration 페이지
              </a>
              에서 새 인테그레이션을 만든 뒤, 그 인테그레이션을 가져올 DB에 "Connect" 해야 해요.
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">노션 DB URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.notion.so/workspace/...?v=..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono"
            />
          </div>
          {err && (
            <div className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{err}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100">
          <button
            onClick={submit}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {busy ? '확인 중…' : '추가하고 스캔'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 인앱 알림 설정 섹션
// ─────────────────────────────────────────
const LEAD_OPTIONS: { min: number; label: string }[] = [
  { min: 0, label: '시작 시점' },
  { min: 5, label: '5분 전' },
  { min: 10, label: '10분 전' },
  { min: 15, label: '15분 전' },
  { min: 30, label: '30분 전' },
  { min: 60, label: '1시간 전' },
  { min: 120, label: '2시간 전' },
  { min: 1440, label: '하루 전' },
];

function NotificationSettingsSection() {
  const [enabled, setEnabled] = useState(true);
  const [leadMinutes, setLeadMinutes] = useState<number[]>([30]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/todo/notifications/settings?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setEnabled(!!d.settings.enabled);
          setLeadMinutes(
            Array.isArray(d.settings.lead_minutes) ? d.settings.lead_minutes : [30],
          );
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const toggle = (min: number) => {
    setLeadMinutes((prev) =>
      prev.includes(min) ? prev.filter((x) => x !== min) : [...prev, min].sort((a, b) => a - b),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await fetch('/api/todo/notifications/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          enabled,
          lead_minutes: leadMinutes,
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h2 className="text-sm font-bold text-gray-700 mb-2">🔔 인앱 알림</h2>
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-700">알림 켜기</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-amber-500 w-5 h-5"
          />
        </label>
        <div className={enabled ? '' : 'opacity-40 pointer-events-none'}>
          <div className="text-xs text-gray-500 mb-2">
            시간 지정 일정의 시작 전에 알려줄 시점 (여러 개 선택 가능)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {LEAD_OPTIONS.map((o) => {
              const on = leadMinutes.includes(o.min);
              return (
                <button
                  key={o.min}
                  type="button"
                  onClick={() => toggle(o.min)}
                  className={`px-3 py-1.5 text-xs rounded-full border ${
                    on
                      ? 'bg-amber-500 text-white border-amber-500 font-semibold'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={save}
          disabled={!loaded || saving}
          className="w-full py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────
// 텔레그램 봇 설정 섹션
// ─────────────────────────────────────────
interface TelegramSettings {
  bot_token: string;       // 마스킹 표시용
  bot_token_masked: string;
  bot_username: string;
  enabled: boolean;
}

interface MemberChatRow {
  id: string;
  name: string;
  color: string;
  telegram_chat_id?: string;
  telegram_username?: string;
}

interface DetectedChat {
  chat_id: string;
  name: string;
  username?: string;
}

function TelegramSettingsSection() {
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [members, setMembers] = useState<MemberChatRow[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [detected, setDetected] = useState<DetectedChat[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchAll = () => {
    fetch(`/api/todo/telegram/settings?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setSettings(d.settings));
    fetch(`/api/members?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []));
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const saveToken = async () => {
    if (!tokenInput.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/todo/telegram/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          bot_token: tokenInput.trim(),
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실패');
      setTokenInput('');
      setMsg('✅ 봇 토큰 저장됨 (@' + (data.settings?.bot_username || '?') + ')');
      fetchAll();
    } catch (e: unknown) {
      setMsg('❌ ' + (e instanceof Error ? e.message : '실패'));
    } finally {
      setBusy(false);
    }
  };

  const detectChats = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/todo/telegram/detect-chats?household_id=${HOUSEHOLD_ID}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실패');
      setDetected(data.chats ?? []);
      setMsg(
        data.chats?.length
          ? `📡 ${data.chats.length}명 감지됨 — 아래에서 멤버에 연결하세요`
          : '봇과 대화한 사람이 없어요. 가족분들이 봇에게 /start 보낸 후 다시 시도하세요.',
      );
    } catch (e: unknown) {
      setMsg('❌ ' + (e instanceof Error ? e.message : '실패'));
    } finally {
      setBusy(false);
    }
  };

  const linkMember = async (memberId: string, chatId: string, username: string) => {
    await fetch(`/api/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_chat_id: chatId,
        telegram_username: username,
      }),
    });
    fetchAll();
    setMsg('✅ 연결됨');
  };

  const unlinkMember = async (memberId: string) => {
    await fetch(`/api/members/${memberId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegram_chat_id: '', telegram_username: '' }),
    });
    fetchAll();
  };

  const sendTest = async (m: MemberChatRow) => {
    if (!m.telegram_chat_id) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/todo/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          chat_id: m.telegram_chat_id,
          member_name: m.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실패');
      setMsg(`✅ ${m.name}에게 테스트 메시지 전송됨`);
    } catch (e: unknown) {
      setMsg('❌ ' + (e instanceof Error ? e.message : '실패'));
    } finally {
      setBusy(false);
    }
  };

  const hasToken = !!settings?.bot_username;

  return (
    <section>
      <h2 className="text-sm font-bold text-gray-700 mb-2">📱 텔레그램 알림</h2>
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
        {/* 봇 토큰 */}
        <div>
          <div className="text-xs text-gray-500 mb-1">봇 토큰 (BotFather에서 받은 secret)</div>
          {hasToken ? (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-gray-700">{settings?.bot_token_masked}</span>
              <span className="text-[11px] text-emerald-600 font-semibold">
                @{settings?.bot_username}
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 mb-2">아직 등록되지 않음</div>
          )}
          <div className="flex gap-1.5">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="123456:ABC-DEF..."
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
            />
            <button
              onClick={saveToken}
              disabled={busy || !tokenInput.trim()}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              저장
            </button>
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            텔레그램에서 <span className="font-mono text-gray-600">@BotFather</span> →{' '}
            <span className="font-mono text-gray-600">/newbot</span> 으로 봇 생성 후 토큰 복사
          </div>
        </div>

        {/* 멤버 연결 */}
        {hasToken && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs text-gray-500">멤버별 chat_id 연결</div>
              <button
                onClick={detectChats}
                disabled={busy}
                className="text-[11px] text-indigo-600 font-semibold"
              >
                📡 자동 감지
              </button>
            </div>
            <div className="text-[11px] text-amber-600 mb-2">
              가족 각자 텔레그램에서{' '}
              <span className="font-mono">@{settings?.bot_username}</span> 검색 →{' '}
              <span className="font-mono">/start</span> 후 위 자동 감지 누르세요.
            </div>
            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-100"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                  />
                  <span className="text-sm font-semibold w-12 shrink-0">{m.name}</span>
                  {m.telegram_chat_id ? (
                    <>
                      <span className="text-[11px] text-gray-500 flex-1 truncate">
                        @{m.telegram_username || m.telegram_chat_id}
                      </span>
                      <button
                        onClick={() => sendTest(m)}
                        disabled={busy}
                        className="text-[11px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-semibold"
                      >
                        테스트
                      </button>
                      <button
                        onClick={() => unlinkMember(m.id)}
                        className="text-[11px] px-2 py-1 rounded bg-rose-50 text-rose-600"
                      >
                        해제
                      </button>
                    </>
                  ) : (
                    <select
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const chat = detected.find((c) => c.chat_id === e.target.value);
                        if (chat) linkMember(m.id, chat.chat_id, chat.username ?? '');
                      }}
                      defaultValue=""
                      className="flex-1 text-xs px-2 py-1 border border-gray-200 rounded"
                    >
                      <option value="">
                        {detected.length === 0 ? '(자동 감지 필요)' : '선택…'}
                      </option>
                      {detected.map((c) => (
                        <option key={c.chat_id} value={c.chat_id}>
                          {c.name} {c.username ? `(@${c.username})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {msg && <div className="text-xs text-center text-gray-600">{msg}</div>}
      </div>
    </section>
  );
}

