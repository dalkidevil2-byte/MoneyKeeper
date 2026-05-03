'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ArchiveEntry, ArchiveProperty } from '@/types';

interface Props {
  entries: ArchiveEntry[];
  schema: ArchiveProperty[];
  dateKey: string; // 어느 date 속성 기준으로 배치할지
  onSelectDate: (entryId: string | null, date?: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function ArchiveCalendarView({
  entries,
  schema,
  dateKey,
  onSelectDate,
}: Props) {
  const [cursor, setCursor] = useState(dayjs());
  const titleProp = schema[0];
  const titleKey = titleProp?.key;

  const monthStart = cursor.startOf('month');
  const monthEnd = cursor.endOf('month');
  const calStart = monthStart.startOf('week');
  const calEnd = monthEnd.endOf('week');

  // 날짜별 항목 매핑
  const entriesByDate = useMemo(() => {
    const map = new Map<string, ArchiveEntry[]>();
    for (const e of entries) {
      const d = (e.data ?? {}) as Record<string, unknown>;
      const raw = d[dateKey];
      if (!raw) continue;
      const dateStr = String(raw).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(e);
    }
    return map;
  }, [entries, dateKey]);

  // 격자 채우기
  const days: dayjs.Dayjs[] = [];
  let d = calStart;
  while (d.isBefore(calEnd) || d.isSame(calEnd, 'day')) {
    days.push(d);
    d = d.add(1, 'day');
  }

  const todayKey = dayjs().format('YYYY-MM-DD');

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <button
          onClick={() => setCursor(cursor.subtract(1, 'month'))}
          className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-bold text-gray-900">
          {cursor.format('YYYY년 M월')}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(dayjs())}
            className="text-[11px] px-2 py-1 rounded-lg bg-gray-100 text-gray-600 font-semibold"
          >
            오늘
          </button>
          <button
            onClick={() => setCursor(cursor.add(1, 'month'))}
            className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-500"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-[10px] font-bold text-center py-1.5 ${
              i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 격자 */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {days.map((day) => {
          const key = day.format('YYYY-MM-DD');
          const inMonth = day.month() === cursor.month();
          const isToday = key === todayKey;
          const isSun = day.day() === 0;
          const isSat = day.day() === 6;
          const dayEntries = entriesByDate.get(key) ?? [];
          return (
            <button
              key={key}
              onClick={() => {
                if (dayEntries.length === 0) {
                  onSelectDate(null, key);
                } else if (dayEntries.length === 1) {
                  onSelectDate(dayEntries[0].id, key);
                } else {
                  // 여러 개면 첫 번째 열어주고, 사용자가 카드를 직접 누르면 거기로
                  onSelectDate(dayEntries[0].id, key);
                }
              }}
              className={`min-h-[64px] border-b border-r border-gray-50 p-1 text-left flex flex-col gap-0.5 transition-colors ${
                inMonth ? 'bg-white' : 'bg-gray-50/50'
              } active:bg-violet-50 hover:bg-violet-50/50`}
            >
              <div
                className={`text-[10px] font-bold leading-none ${
                  !inMonth
                    ? 'text-gray-300'
                    : isToday
                      ? 'text-white bg-violet-600 rounded-full w-4 h-4 flex items-center justify-center mx-auto'
                      : isSun
                        ? 'text-rose-500'
                        : isSat
                          ? 'text-blue-500'
                          : 'text-gray-700'
                }`}
              >
                {day.date()}
              </div>
              {/* 항목 미리보기 — 최대 3개, 더 있으면 +N */}
              <div className="space-y-0.5 overflow-hidden">
                {dayEntries.slice(0, 3).map((e) => {
                  const dt = (e.data ?? {}) as Record<string, unknown>;
                  const title = titleKey ? String(dt[titleKey] ?? '') : '';
                  return (
                    <div
                      key={e.id}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectDate(e.id, key);
                      }}
                      className="text-[9px] leading-tight bg-violet-100 text-violet-700 rounded px-1 py-0.5 truncate"
                    >
                      {title || '(제목 없음)'}
                    </div>
                  );
                })}
                {dayEntries.length > 3 && (
                  <div className="text-[9px] text-gray-400 px-1">
                    +{dayEntries.length - 3}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
