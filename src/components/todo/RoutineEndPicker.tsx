'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

interface Props {
  untilDate: string | null;
  untilCount: number | null;
  onChange: (untilDate: string | null, untilCount: number | null) => void;
  /** 시작일 (until_date min 으로 사용) */
  startDate?: string;
}

type Mode = 'forever' | 'until_date' | 'until_count';

export default function RoutineEndPicker({
  untilDate,
  untilCount,
  onChange,
  startDate,
}: Props) {
  const initialMode: Mode = untilDate ? 'until_date' : untilCount != null ? 'until_count' : 'forever';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [date, setDate] = useState<string>(
    untilDate ?? dayjs(startDate ?? undefined).add(3, 'month').format('YYYY-MM-DD')
  );
  const [count, setCount] = useState<number>(untilCount ?? 10);

  useEffect(() => {
    if (mode === 'forever') onChange(null, null);
    else if (mode === 'until_date') onChange(date, null);
    else onChange(null, Math.max(1, count));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, count]);

  const Btn = ({ m, label }: { m: Mode; label: string }) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        mode === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Btn m="forever" label="계속" />
        <Btn m="until_date" label="기한" />
        <Btn m="until_count" label="횟수" />
      </div>
      {mode === 'until_date' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-12">~</span>
          <input
            type="date"
            value={date}
            min={startDate}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <span className="text-xs text-gray-500">까지</span>
        </div>
      )}
      {mode === 'until_count' && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-12">총</span>
          <input
            type="number"
            min={1}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <span className="text-xs text-gray-500">회 완료까지</span>
        </div>
      )}
    </div>
  );
}
