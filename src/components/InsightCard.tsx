'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, TrendingUp, RotateCcw, ShoppingCart, X } from 'lucide-react';
import { formatAmount } from '@/lib/parser';

interface Insight {
  type: 'overdue_merchant' | 'recurring_merchant' | 'category_spike' | 'frequent_items';
  // overdue_merchant / recurring_merchant
  merchant?: string;
  frequency?: 'weekly' | 'biweekly' | 'monthly';
  daysSinceLast?: number;
  avgAmount?: number;
  avgGap?: number;
  visitCount?: number;
  lastDate?: string;
  category?: string;
  // category_spike
  category_spike?: string;
  thisMonth?: number;
  lastMonth?: number;
  pct?: number;
  // frequent_items
  items?: { name: string; count: number; avgAmount: number; lastDate: string }[];
}

const FREQ_LABEL: Record<string, string> = {
  weekly: '매주',
  biweekly: '격주',
  monthly: '매달',
};

const CATEGORY_EMOJI: Record<string, string> = {
  식비: '🍽️', 카페: '☕', 교통: '🚌', 쇼핑: '🛍️', 의료: '💊',
  교육: '📚', 취미: '🎮', 고정비: '🔒', 생활: '🧺',
  주거: '🏠', '저축/투자': '📈', 육아: '👶', 기타: '📝',
};

function InsightItem({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  const dismissBtn = (
    <button onClick={onDismiss} className="p-1 text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5">
      <X size={14} />
    </button>
  );

  if (insight.type === 'overdue_merchant') {
    return (
      <div className="flex items-start gap-3 py-3">
        <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
          <RotateCcw size={15} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            <span className="text-amber-600">{insight.merchant}</span>에 {insight.daysSinceLast}일째 안 가셨네요
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            보통 {FREQ_LABEL[insight.frequency!]} 방문 · 평균 {formatAmount(insight.avgAmount!)}
          </p>
        </div>
        {dismissBtn}
      </div>
    );
  }

  if (insight.type === 'recurring_merchant') {
    return (
      <div className="flex items-start gap-3 py-3">
        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-base">{CATEGORY_EMOJI[insight.category!] ?? '🏪'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            {insight.merchant}
            {insight.frequency && (
              <span className="text-xs text-gray-400 font-normal ml-1.5">{FREQ_LABEL[insight.frequency]}</span>
            )}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            3개월간 {insight.visitCount}회 방문 · 평균 {formatAmount(insight.avgAmount!)}
          </p>
        </div>
        {dismissBtn}
      </div>
    );
  }

  if (insight.type === 'category_spike') {
    return (
      <div className="flex items-start gap-3 py-3">
        <div className="w-8 h-8 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
          <TrendingUp size={15} className="text-rose-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800">
            <span className="text-rose-500">{insight.category}</span> 지출이 급증했어요
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            전월 {formatAmount(insight.lastMonth!)} → 이번 달 {formatAmount(insight.thisMonth!)}
            <span className="text-rose-400 font-medium ml-1">(+{insight.pct}%)</span>
          </p>
        </div>
        {dismissBtn}
      </div>
    );
  }

  if (insight.type === 'frequent_items' && insight.items && insight.items.length > 0) {
    return (
      <div className="flex items-start gap-3 py-3">
        <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
          <ShoppingCart size={15} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 mb-1.5">자주 구매하는 품목</p>
          <div className="flex flex-wrap gap-1.5">
            {insight.items.map((item) => (
              <span
                key={item.name}
                className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg font-medium"
              >
                {item.name} <span className="text-emerald-400">{item.count}회</span>
              </span>
            ))}
          </div>
        </div>
        {dismissBtn}
      </div>
    );
  }

  return null;
}

export default function InsightCard() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch('/api/insights')
      .then((r) => r.json())
      .then((d) => setInsights(d.insights ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  if (insights.length === 0) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-2 px-1">
          <Sparkles size={15} className="text-indigo-500" />
          <h2 className="font-semibold text-gray-800">소비 인사이트</h2>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-5 text-center">
          <p className="text-2xl mb-2">📊</p>
          <p className="text-sm font-medium text-gray-600">데이터를 수집하고 있어요</p>
          <p className="text-xs text-gray-400 mt-1">거래 내역이 쌓이면 소비 패턴을 분석해드려요</p>
        </div>
      </section>
    );
  }

  const PREVIEW = 2;
  const visible = expanded ? insights : insights.slice(0, PREVIEW);
  const hasMore = insights.length > PREVIEW;

  const dismiss = (ins: Insight) => {
    setInsights((prev) => prev.filter((x) => x !== ins));
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <Sparkles size={15} className="text-indigo-500" />
        <h2 className="font-semibold text-gray-800">소비 인사이트</h2>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 px-4 divide-y divide-gray-50">
        {visible.map((ins, i) => (
          <InsightItem key={i} insight={ins} onDismiss={() => dismiss(ins)} />
        ))}

        {hasMore && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full py-3 flex items-center justify-center gap-1 text-xs text-indigo-500 font-medium"
          >
            {expanded ? (
              <><ChevronUp size={14} /> 접기</>
            ) : (
              <><ChevronDown size={14} /> {insights.length - PREVIEW}개 더 보기</>
            )}
          </button>
        )}
      </div>
    </section>
  );
}
