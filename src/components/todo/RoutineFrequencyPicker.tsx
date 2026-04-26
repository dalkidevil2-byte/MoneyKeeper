'use client';

import { useState, useEffect } from 'react';
import type { RecurrenceRule } from '@/types';
import { WEEKDAY_LABELS } from '@/types';

interface Props {
  value: RecurrenceRule | null;
  onChange: (v: RecurrenceRule) => void;
  /** 시작일 (음력 라벨 미리보기에 사용) */
  startDate?: string;
}

type Mode = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'interval' | 'count_per_period';

export default function RoutineFrequencyPicker({ value, onChange, startDate }: Props) {
  const [mode, setMode] = useState<Mode>(value?.freq ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(
    value?.freq === 'weekly' ? value.weekdays : [1, 2, 3, 4, 5]
  );
  const [everyDays, setEveryDays] = useState<number>(
    value?.freq === 'interval' ? value.every_days : 7
  );
  const [count, setCount] = useState<number>(
    value?.freq === 'count_per_period' ? value.count : 2
  );
  const [period, setPeriod] = useState<'week' | 'month'>(
    value?.freq === 'count_per_period' ? value.period : 'week'
  );
  const [lunar, setLunar] = useState<boolean>(
    (value?.freq === 'monthly' || value?.freq === 'yearly') ? !!value.lunar : false
  );

  // mode/state 변경 시 onChange 통지
  useEffect(() => {
    let rule: RecurrenceRule;
    switch (mode) {
      case 'daily':
        rule = { freq: 'daily' };
        break;
      case 'weekly':
        rule = { freq: 'weekly', weekdays };
        break;
      case 'monthly':
        rule = { freq: 'monthly', lunar };
        break;
      case 'yearly':
        rule = { freq: 'yearly', lunar };
        break;
      case 'interval':
        rule = { freq: 'interval', every_days: Math.max(1, everyDays) };
        break;
      case 'count_per_period':
        rule = { freq: 'count_per_period', count: Math.max(1, count), period };
        break;
    }
    onChange(rule);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, weekdays, everyDays, count, period, lunar]);

  const toggleDay = (d: number) => {
    setWeekdays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const ModeBtn = ({ m, label }: { m: Mode; label: string }) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
        mode === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5">
        <ModeBtn m="daily" label="매일" />
        <ModeBtn m="weekly" label="요일별" />
        <ModeBtn m="monthly" label="매월" />
        <ModeBtn m="yearly" label="매년" />
        <ModeBtn m="interval" label="N일마다" />
        <ModeBtn m="count_per_period" label="N회" />
      </div>

      {mode === 'weekly' && (
        <div className="flex gap-1.5">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                weekdays.includes(i)
                  ? 'bg-indigo-100 text-indigo-700 font-bold'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              } ${i === 0 ? 'text-rose-500' : ''} ${i === 6 ? 'text-blue-500' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {(mode === 'monthly' || mode === 'yearly') && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setLunar(false)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border ${
                !lunar
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              양력
            </button>
            <button
              type="button"
              onClick={() => setLunar(true)}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border ${
                lunar
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              음력
            </button>
          </div>
          <div className="text-[11px] text-gray-500 px-1">
            {mode === 'monthly'
              ? lunar
                ? '시작일을 음력으로 변환한 일자에 매월 반복합니다.'
                : '시작일에 지정한 날짜(예: 매월 15일)에 매월 반복합니다.'
              : lunar
                ? '시작일을 음력으로 변환한 월/일에 매년 반복합니다 (전통 생일/제사 등).'
                : '시작일에 지정한 날짜(예: 매년 5월 30일)에 매년 반복합니다.'}
          </div>
          {lunar && startDate && <LunarPreview solarDate={startDate} />}
        </div>
      )}

      {mode === 'interval' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={everyDays}
            onChange={(e) => setEveryDays(parseInt(e.target.value) || 1)}
            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <span className="text-sm text-gray-600">일마다 반복</span>
        </div>
      )}

      {mode === 'count_per_period' && (
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'week' | 'month')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="week">매주</option>
            <option value="month">매월</option>
          </select>
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <span className="text-sm text-gray-600">회</span>
        </div>
      )}
    </div>
  );
}

// 음력 미리보기 (시작일을 음력으로 변환해 보여줌)
function LunarPreview({ solarDate }: { solarDate: string }) {
  // 동적 import 회피하고 dayjs 정도만 활용
  // task-recurrence 와 동일한 lib 함수를 호출
  const [label, setLabel] = useState<string>('');
  useEffect(() => {
    let alive = true;
    import('@/lib/lunar')
      .then(({ formatLunarLabel }) => {
        if (alive) setLabel(formatLunarLabel(solarDate));
      })
      .catch(() => {
        /* noop */
      });
    return () => {
      alive = false;
    };
  }, [solarDate]);
  if (!label) return null;
  return (
    <div className="text-[11px] text-indigo-600 px-1 font-medium">
      📌 {solarDate} → {label}
    </div>
  );
}
