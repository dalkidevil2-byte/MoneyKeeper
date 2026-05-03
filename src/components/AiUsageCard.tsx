'use client';

import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

type GroupRow = { key: string; krw: number; usd: number; count: number };
type Sum = { krw: number; usd: number; count: number };

type UsageData = {
  ok: boolean;
  today: Sum;
  month: Sum;
  todayByFeature: GroupRow[];
  monthByFeature: GroupRow[];
  monthByModel: GroupRow[];
  usdKrw: number;
};

const FEATURE_LABEL: Record<string, string> = {
  briefing: '🌅 AI 브리핑',
  tts: '🔊 음성 읽기',
  stt: '🎤 음성 인식',
  assistant: '💬 AI 어시스턴트',
  condition: '✅ Daily Track 판단',
  ocr: '📷 영수증 OCR',
  parse: '📝 자연어 파싱',
  archive_ai: '📚 아카이브 AI',
  weekly_report: '📊 주간 리포트',
  reminder: '⏰ 리마인더',
  other: '기타',
};

function fmtKrw(v: number): string {
  return v.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
}

export default function AiUsageCard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-usage');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      setData(j as UsageData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <Sparkles size={16} className="text-violet-600" /> AI 사용량 / 비용
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-violet-600 inline-flex items-center gap-1 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          새로고침
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading && !data ? (
          <div className="p-6 flex justify-center">
            <Loader2 size={18} className="animate-spin text-violet-500" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-rose-500">{error}</div>
        ) : data ? (
          <>
            {/* 합계 */}
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-4">
                <p className="text-xs text-gray-500 mb-1">오늘</p>
                <p className="text-lg font-bold text-gray-900">
                  {fmtKrw(data.today.krw)}
                  <span className="text-xs font-normal text-gray-500 ml-1">원</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {data.today.count}건 호출
                </p>
              </div>
              <div className="p-4">
                <p className="text-xs text-gray-500 mb-1">이번 달</p>
                <p className="text-lg font-bold text-violet-600">
                  {fmtKrw(data.month.krw)}
                  <span className="text-xs font-normal text-gray-500 ml-1">원</span>
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {data.month.count}건 · ${data.month.usd.toFixed(4)}
                </p>
              </div>
            </div>

            {/* 펼치기 */}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full px-4 py-2.5 border-t border-gray-100 text-xs text-gray-600 flex items-center justify-center gap-1 hover:bg-gray-50"
            >
              {expanded ? (
                <>
                  접기 <ChevronUp size={12} />
                </>
              ) : (
                <>
                  자세히 보기 <ChevronDown size={12} />
                </>
              )}
            </button>

            {expanded && (
              <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
                {/* 이번 달 기능별 */}
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 mb-1.5">
                    이번 달 — 기능별
                  </p>
                  {data.monthByFeature.length === 0 ? (
                    <p className="text-xs text-gray-400">사용 내역 없음</p>
                  ) : (
                    <div className="space-y-1">
                      {data.monthByFeature.map((row) => (
                        <div
                          key={row.key}
                          className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2"
                        >
                          <span className="text-gray-700">
                            {FEATURE_LABEL[row.key] ?? row.key}
                          </span>
                          <span className="text-gray-500">
                            <span className="font-semibold text-gray-800">
                              {fmtKrw(row.krw)}원
                            </span>
                            <span className="text-gray-400 ml-1.5">
                              ({row.count}건)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 모델별 */}
                {data.monthByModel.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500 mb-1.5">
                      이번 달 — 모델별
                    </p>
                    <div className="space-y-1">
                      {data.monthByModel.map((row) => (
                        <div
                          key={row.key}
                          className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2"
                        >
                          <span className="font-mono text-gray-600">
                            {row.key}
                          </span>
                          <span>
                            <span className="font-semibold text-gray-800">
                              {fmtKrw(row.krw)}원
                            </span>
                            <span className="text-gray-400 ml-1.5">
                              ({row.count}건)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 leading-relaxed">
                  * 환율 1$={data.usdKrw}원 기준 추정치 (실제 청구액과 ±5% 오차)
                  <br />
                  * 외부 cron 으로 자동 호출되는 브리핑도 포함됩니다
                </p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
