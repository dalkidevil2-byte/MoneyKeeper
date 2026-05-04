'use client';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import dayjs from 'dayjs';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface HistoryPoint {
  date: string;
  total_value: number;
}

const RANGES = [
  { key: '7d', label: '7일', days: 7 },
  { key: '30d', label: '30일', days: 30 },
  { key: '90d', label: '90일', days: 90 },
  { key: '1y', label: '1년', days: 365 },
];

export default function AssetHistoryChart() {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [range, setRange] = useState<string>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const days = RANGES.find((r) => r.key === range)?.days ?? 30;
    const start = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
    setLoading(true);
    fetch(`/api/stocks/asset-history?start_date=${start}`)
      .then((r) => r.json())
      .then((j) => setHistory(j.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [range]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="text-sm text-gray-400 text-center py-8">불러오는 중…</div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-bold text-gray-900">📈 자산 추세</h2>
        </div>
        <div className="text-sm text-gray-400 text-center py-8">
          아직 기록이 없어요.<br />
          <span className="text-xs">매일 16:00 (KST) cron 으로 자동 누적됩니다.</span>
        </div>
      </div>
    );
  }

  if (history.length === 1) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-bold text-gray-900">📈 자산 추세</h2>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                  range === r.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-2xl font-bold text-gray-900 mb-1">
          {history[0].total_value.toLocaleString('ko-KR')}원
        </div>
        <div className="text-[11px] text-gray-400 mb-3">
          {dayjs(history[0].date).format('M월 D일')} 기준 첫 기록
        </div>
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
          💡 추세 그래프는 <b>2일 이상</b> 기록이 쌓여야 그려집니다. 매일 16:00 자동 누적되면 자연스럽게 선으로 표시돼요.
        </div>
      </div>
    );
  }

  const first = history[0]?.total_value ?? 0;
  const last = history[history.length - 1]?.total_value ?? 0;
  const diff = last - first;
  const pct = first > 0 ? (diff / first) * 100 : 0;
  const isUp = diff >= 0;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-bold text-gray-900">📈 자산 추세</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                range === r.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-2xl font-bold text-gray-900">
          {last.toLocaleString('ko-KR')}원
        </div>
        <div className={`text-sm font-semibold ${isUp ? 'text-red-500' : 'text-blue-500'} flex items-center gap-0.5`}>
          {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {isUp ? '+' : ''}
          {diff.toLocaleString('ko-KR')}원 ({isUp ? '+' : ''}
          {pct.toFixed(2)}%)
        </div>
      </div>
      <div className="text-[11px] text-gray-400 mb-2">
        {dayjs(history[0].date).format('M/D')} ~ {dayjs(history[history.length - 1].date).format('M/D')}
        · {history.length}일 기록
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            tickFormatter={(d) => dayjs(d).format('M/D')}
            minTickGap={30}
          />
          <YAxis
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => {
              if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
              if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
              return v.toString();
            }}
            domain={['auto', 'auto']}
            width={45}
          />
          <Tooltip
            formatter={(v) => [Number(v).toLocaleString('ko-KR') + '원', '총 평가']}
            labelFormatter={(d) => dayjs(String(d)).format('YYYY-MM-DD (ddd)')}
            contentStyle={{ fontSize: 12 }}
          />
          {history.length > 1 && (
            <ReferenceLine y={first} stroke="#9ca3af" strokeDasharray="4 4" />
          )}
          <Line
            type="monotone"
            dataKey="total_value"
            stroke={isUp ? '#ef4444' : '#3b82f6'}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
