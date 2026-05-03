'use client';
import { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';

interface ChartSpec {
  type: 'bar' | 'pie' | 'line' | 'waffle' | 'stat' | string;
  title: string;
  data: unknown;
}

interface Result {
  summary: string;
  insights: string[];
  charts: ChartSpec[];
  entry_count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  collectionName: string;
}

const COLORS = [
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
];

export default function AnalyzeModal({
  open,
  onClose,
  collectionId,
  collectionName,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/archive/${collectionId}/analyze`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? '분석 실패');
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !result && !loading) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-xl bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-600" />
            <div>
              <div className="font-bold">AI 분석</div>
              <div className="text-xs text-gray-500">{collectionName}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={run}
              disabled={loading}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              title="다시 분석"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-2 text-gray-400">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-16 flex-col gap-2">
              <Loader2 size={24} className="text-violet-500 animate-spin" />
              <div className="text-sm text-gray-500">데이터 분석 중…</div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 text-rose-700 rounded-xl text-sm">
              ⚠️ {error}
            </div>
          )}

          {result && !loading && (
            <>
              {/* 요약 */}
              {result.summary && (
                <div className="p-4 bg-violet-50 rounded-xl">
                  <div className="text-xs text-violet-700 font-bold mb-1">
                    📋 요약 · 항목 {result.entry_count}건
                  </div>
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">
                    {result.summary}
                  </div>
                </div>
              )}

              {/* 인사이트 */}
              {result.insights.length > 0 && (
                <div className="space-y-1.5">
                  {result.insights.map((ins, i) => (
                    <div
                      key={i}
                      className="p-3 bg-gray-50 rounded-xl text-sm text-gray-800"
                    >
                      {ins}
                    </div>
                  ))}
                </div>
              )}

              {/* 차트들 */}
              {result.charts.map((ch, i) => (
                <ChartRender key={i} spec={ch} />
              ))}

              {result.charts.length === 0 && result.insights.length === 0 && (
                <div className="text-center text-sm text-gray-400 py-8">
                  분석할 데이터가 충분하지 않아요.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartRender({ spec }: { spec: ChartSpec }) {
  const data = spec.data as Record<string, unknown>;

  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <div className="text-xs font-semibold text-gray-700 mb-2">
        📊 {spec.title}
      </div>
      <div>
        {(() => {
          try {
            switch (spec.type) {
              case 'bar': {
                const labels = (data.labels as string[]) ?? [];
                const values = (data.values as number[]) ?? [];
                const chartData = labels.map((l, idx) => ({
                  name: l,
                  value: values[idx] ?? 0,
                }));
                return (
                  <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 28)}>
                    <BarChart data={chartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                );
              }
              case 'pie': {
                const labels = (data.labels as string[]) ?? [];
                const values = (data.values as number[]) ?? [];
                const chartData = labels.map((l, idx) => ({
                  name: l,
                  value: values[idx] ?? 0,
                }));
                return (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        label={(e: { name?: string }) => e.name ?? ''}
                      >
                        {chartData.map((_, idx) => (
                          <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                );
              }
              case 'line': {
                const points = (data.points as Array<{ x: string; y: number }>) ?? [];
                return (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={points}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="x" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="y"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                );
              }
              case 'waffle': {
                const cats = (data.categories as Array<{
                  label: string;
                  count: number;
                  color?: string;
                }>) ?? [];
                // 100 셀로 정규화
                const totalRaw = cats.reduce((s, c) => s + (c.count || 0), 0);
                if (totalRaw === 0) return <div className="text-xs text-gray-400">데이터 없음</div>;
                const normalized: string[] = [];
                cats.forEach((c, idx) => {
                  const cells = Math.round((c.count / totalRaw) * 100);
                  for (let i = 0; i < cells; i++) {
                    normalized.push(c.color ?? COLORS[idx % COLORS.length]);
                  }
                });
                while (normalized.length < 100) normalized.push('#e5e7eb');
                normalized.length = 100;
                return (
                  <div>
                    <div className="grid grid-cols-10 gap-0.5 mb-2">
                      {normalized.map((color, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {cats.map((c, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <span
                            className="w-3 h-3 rounded-sm"
                            style={{
                              backgroundColor: c.color ?? COLORS[idx % COLORS.length],
                            }}
                          />
                          <span className="text-gray-700">
                            {c.label} ({c.count}
                            {totalRaw > 0
                              ? ` · ${Math.round((c.count / totalRaw) * 100)}%`
                              : ''}
                            )
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              case 'stat': {
                const value = data.value as string | number;
                const label = data.label as string;
                const sublabel = data.sublabel as string | undefined;
                return (
                  <div className="text-center py-3">
                    <div className="text-3xl font-bold text-violet-600">
                      {value}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">{label}</div>
                    {sublabel && (
                      <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>
                    )}
                  </div>
                );
              }
              default:
                return (
                  <div className="text-xs text-gray-400">
                    지원하지 않는 차트 타입: {spec.type}
                  </div>
                );
            }
          } catch (e) {
            return (
              <div className="text-xs text-rose-500">
                차트 렌더링 실패: {e instanceof Error ? e.message : ''}
              </div>
            );
          }
        })()}
      </div>
    </div>
  );
}
