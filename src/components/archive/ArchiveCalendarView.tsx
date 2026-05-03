'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ArchiveEntry, ArchiveProperty } from '@/types';

interface Props {
  entries: ArchiveEntry[];
  schema: ArchiveProperty[];
  dateKey: string; // 시작 date 속성 (또는 단일 date 속성)
  endDateKey?: string; // 종료 date 속성 (있으면 range 모드)
  onSelectDate: (entryId: string | null, date?: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function ArchiveCalendarView({
  entries,
  schema,
  dateKey,
  endDateKey,
  onSelectDate,
}: Props) {
  const [cursor, setCursor] = useState(dayjs());
  const titleProp = schema[0];
  const titleKey = titleProp?.key;

  const monthStart = cursor.startOf('month');
  const monthEnd = cursor.endOf('month');
  const calStart = monthStart.startOf('week');
  const calEnd = monthEnd.endOf('week');

  // 날짜별 항목 매핑 — endDateKey 가 있으면 시작~종료 범위 내 모든 날짜에 표시
  // 각 항목이 "이 날에 있다 + 시작/종료 위치" 정보를 함께 들고 다님
  type DayEntry = {
    entry: ArchiveEntry;
    isStart: boolean; // 이 셀이 시작 날
    isEnd: boolean; // 이 셀이 종료 날
    isRange: boolean; // 다일짜 range 여부
  };
  const entriesByDate = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const norm = (v: unknown): string | null => {
      if (!v) return null;
      const s = String(v).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    };
    for (const e of entries) {
      const d = (e.data ?? {}) as Record<string, unknown>;
      const start = norm(d[dateKey]);
      if (!start) continue;
      const end = endDateKey ? norm(d[endDateKey]) : null;
      // end 가 start 보다 빠르면 무시 (잘못된 데이터)
      const validEnd = end && end >= start ? end : null;
      const isRange = !!validEnd && validEnd !== start;
      if (!isRange) {
        if (!map.has(start)) map.set(start, []);
        map.get(start)!.push({ entry: e, isStart: true, isEnd: true, isRange: false });
        continue;
      }
      // range — 시작~종료 사이 모든 날짜에 push
      let cur = dayjs(start);
      const last = dayjs(validEnd!);
      while (cur.isBefore(last) || cur.isSame(last, 'day')) {
        const k = cur.format('YYYY-MM-DD');
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push({
          entry: e,
          isStart: cur.isSame(dayjs(start), 'day'),
          isEnd: cur.isSame(last, 'day'),
          isRange: true,
        });
        cur = cur.add(1, 'day');
      }
    }
    return map;
  }, [entries, dateKey, endDateKey]);

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
                  onSelectDate(dayEntries[0].entry.id, key);
                } else {
                  onSelectDate(dayEntries[0].entry.id, key);
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
                {dayEntries.slice(0, 3).map((de, di) => {
                  const dt = (de.entry.data ?? {}) as Record<string, unknown>;
                  const title = titleKey ? String(dt[titleKey] ?? '') : '';
                  // range 표시: 시작은 둥근 좌측, 끝은 둥근 우측, 중간은 직각
                  const radius = de.isRange
                    ? `${de.isStart ? 'rounded-l ' : ''}${de.isEnd ? 'rounded-r ' : ''}${!de.isStart && !de.isEnd ? '' : ''}`
                    : 'rounded';
                  // 중간 칸은 음각/짙은 색으로 연결 표시 (margin 으로 살짝 밀착)
                  const mx = de.isRange
                    ? `${!de.isStart ? '-ml-1 ' : ''}${!de.isEnd ? '-mr-1 ' : ''}`
                    : '';
                  // 시작 셀에만 제목 표시, 그 외엔 "→" 빈 띠
                  const label = de.isRange && !de.isStart
                    ? ' ' // 비-breaking space, 띠만 표시
                    : title || '(제목 없음)';
                  return (
                    <div
                      key={`${de.entry.id}-${di}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelectDate(de.entry.id, key);
                      }}
                      className={`text-[9px] leading-tight px-1 py-0.5 truncate ${radius} ${mx} ${
                        de.isRange
                          ? 'bg-violet-500 text-white'
                          : 'bg-violet-100 text-violet-700'
                      }`}
                      title={title}
                    >
                      {label}
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
