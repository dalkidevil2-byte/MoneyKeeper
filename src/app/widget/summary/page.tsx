import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { createServerSupabaseClient } from '@/lib/supabase';
import { shouldShowOnCalendar } from '@/lib/task-recurrence';
import type { Task } from '@/types';

dayjs.locale('ko');

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────
// 홈 화면 위젯용 요약 화면.
//
// 웹 위젯 앱(Web Widget 등)이 로그인 없이 읽을 수 있어야 하므로
// URL 의 token 으로만 접근을 허용한다. 읽기 전용이며 이 화면만 열린다.
// (proxy.ts 에서도 같은 토큰을 검사한다 — 이중 확인)
//
// PWA 표준은 네이티브 위젯을 지원하지 않는다.
// '홈 화면에 추가' 또는 웹 위젯 앱으로 띄우는 것이 현실적인 대안이다.
// ─────────────────────────────────────────

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

function won(n: number): string {
  return n.toLocaleString('ko-KR');
}

export default async function WidgetSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const expected = process.env.WIDGET_TOKEN;

  if (!expected || token !== expected) {
    return (
      <main style={{ padding: 16, fontFamily: 'sans-serif', color: '#9ca3af', fontSize: 13 }}>
        접근 권한이 없어요.
      </main>
    );
  }

  const supabase = createServerSupabaseClient();
  const today = dayjs();
  const todayStr = today.format('YYYY-MM-DD');
  const monthStart = today.startOf('month').format('YYYY-MM-DD');
  const monthEnd = today.endOf('month').format('YYYY-MM-DD');

  // ── 오늘 일정 (반복 일정 포함) ──
  const { data: taskRows } = await supabase
    .from('tasks')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('is_active', true);

  const todayTasks = ((taskRows ?? []) as Task[])
    .filter((t) => shouldShowOnCalendar(t, todayStr))
    .sort((a, b) => (a.due_time ?? '99').localeCompare(b.due_time ?? '99'));

  // ── 지출 (이번 달 / 오늘) ──
  const { data: txRows } = await supabase
    .from('transactions')
    .select('amount, date, type, status')
    .eq('household_id', HOUSEHOLD_ID)
    .gte('date', monthStart)
    .lte('date', monthEnd)
    .neq('status', 'cancelled');

  const expenses = (txRows ?? []).filter((t) =>
    ['variable_expense', 'fixed_expense'].includes(t.type as string),
  );
  const monthSpent = expenses.reduce((s, t) => s + (t.amount as number), 0);
  const todaySpent = expenses
    .filter((t) => t.date === todayStr)
    .reduce((s, t) => s + (t.amount as number), 0);

  // ── 예산 (등록돼 있으면 남은 금액) ──
  const { data: budgets } = await supabase
    .from('budgets')
    .select('amount')
    .eq('household_id', HOUSEHOLD_ID)
    .lte('start_date', todayStr)
    .gte('end_date', todayStr);

  const budgetTotal = (budgets ?? []).reduce((s, b) => s + (b.amount as number), 0);
  const budgetLeft = budgetTotal > 0 ? budgetTotal - monthSpent : null;

  // ── Inbox 대기 ──
  // Inbox 는 '확인이 필요하고 아직 Notion 에 안 올라간 거래' 다.
  // status 만 보면 이미 처리된 옛 거래까지 세어져 숫자가 터무니없이 커진다.
  const { count: inboxCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', HOUSEHOLD_ID)
    .eq('status', 'reviewed')
    .in('sync_status', ['pending', 'failed']);

  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 14,
    padding: '10px 12px',
    border: '1px solid #f0f0f2',
  };
  const label: React.CSSProperties = { fontSize: 11, color: '#9ca3af', marginBottom: 2 };
  const value: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: '#111827' };

  return (
    <main
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#f7f7f9',
        padding: 12,
        minHeight: '100vh',
      }}
    >
      {/* 위젯은 눌러서 앱으로 들어갈 수 있어야 편하다 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
          {today.format('M월 D일 (ddd)')}
        </span>
        <span style={{ fontSize: 10, color: '#c0c4cc' }}>{today.format('HH:mm')} 기준</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div style={card}>
          <div style={label}>오늘 쓴 돈</div>
          <div style={value}>{won(todaySpent)}원</div>
        </div>
        <div style={card}>
          <div style={label}>{budgetLeft !== null ? '남은 예산' : '이번 달 지출'}</div>
          <div style={{ ...value, color: budgetLeft !== null && budgetLeft < 0 ? '#e11d48' : '#111827' }}>
            {won(budgetLeft !== null ? budgetLeft : monthSpent)}원
          </div>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 8 }}>
        <div style={label}>오늘 일정 {todayTasks.length > 0 && `· ${todayTasks.length}건`}</div>
        {todayTasks.length === 0 ? (
          <div style={{ fontSize: 13, color: '#c0c4cc', paddingTop: 2 }}>없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 }}>
            {todayTasks.slice(0, 4).map((t) => (
              <div key={t.id} style={{ fontSize: 13, color: '#374151', display: 'flex', gap: 6 }}>
                <span style={{ color: '#6366f1', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {t.due_time ? t.due_time.slice(0, 5) : '종일'}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.title}
                </span>
              </div>
            ))}
            {todayTasks.length > 4 && (
              <div style={{ fontSize: 11, color: '#c0c4cc' }}>외 {todayTasks.length - 4}건</div>
            )}
          </div>
        )}
      </div>

      {(inboxCount ?? 0) > 0 && (
        <div style={{ ...card, background: '#fff7ed', borderColor: '#fed7aa' }}>
          <span style={{ fontSize: 13, color: '#c2410c', fontWeight: 600 }}>
            📥 확인할 거래 {inboxCount}건
          </span>
        </div>
      )}
    </main>
  );
}
