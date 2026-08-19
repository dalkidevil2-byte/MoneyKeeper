'use client';

import type { Transaction } from '@/types';
import { TRANSACTION_TYPE_COLORS, TRANSACTION_TYPE_LABELS } from '@/types';
import { formatAmount, formatDate, formatDateShort, isToday, isYesterday } from '@/lib/parser';
import { ArrowLeftRight, Cloud, CloudOff } from 'lucide-react';

interface Props {
  transaction: Transaction;
  showDate?: boolean;
}

export default function TransactionCard({ transaction: tx, showDate = true }: Props) {
  const isExpense = ['variable_expense', 'fixed_expense'].includes(tx.type);
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';

  function getDateLabel(dateStr: string) {
    if (isToday(dateStr)) return '오늘';
    if (isYesterday(dateStr)) return '어제';
    return formatDateShort(dateStr);
  }

  return (
    <div className="flex items-center gap-3 py-3.5 px-1">
      {/* 카테고리 아이콘 */}
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${
        isTransfer ? 'bg-blue-100' :
        isIncome ? 'bg-emerald-100' :
        'bg-gray-100'
      }`}>
        {getCategoryEmoji(tx.category_main, tx.type)}
      </div>

      {/* 내용 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-gray-900 text-sm truncate">
            {tx.name || tx.merchant_name || TRANSACTION_TYPE_LABELS[tx.type]}
          </p>
          {/* Notion 동기 상태 */}
          {tx.sync_status === 'synced' && (
            <Cloud size={12} className="text-indigo-400 flex-shrink-0" />
          )}
          {tx.sync_status === 'failed' && (
            <CloudOff size={12} className="text-gray-300 flex-shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-0.5">
          {/* 카테고리 */}
          {tx.category_main && (
            <span className="text-xs text-gray-400">{tx.category_main}</span>
          )}
          {tx.category_sub && (
            <>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs text-gray-400">{tx.category_sub}</span>
            </>
          )}

          {/* 자금이동 계좌 표시 */}
          {isTransfer && tx.account_from && tx.account_to && (
            <span className="text-xs text-blue-500 flex items-center gap-0.5">
              {tx.account_from.name}
              <ArrowLeftRight size={10} />
              {tx.account_to.name}
            </span>
          )}

          {/* 결제수단 — 카드 이름에 이미 지출자 이름이 들어 있으면 생략(같은 이름 두 번 노출 방지) */}
          {tx.payment_method && !isTransfer && !cardNameHasMemberName(tx.payment_method.name, tx.member?.name) && (
            <span className="text-xs text-gray-400">{tx.payment_method.name}</span>
          )}

          {/* 지출자(결제자) */}
          {tx.member && (
            <>
              <span className="text-gray-300 text-xs">·</span>
              <span
                className="text-xs font-medium"
                style={{ color: tx.member.color }}
              >
                {tx.member.name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* 금액 + 날짜 */}
      <div className="text-right flex-shrink-0">
        <p className={`font-bold text-base ${
          isTransfer ? 'text-blue-500' :
          isIncome   ? 'text-emerald-500' :
          tx.type === 'refund' ? 'text-purple-500' :
          'text-rose-500'
        }`}>
          {isExpense ? '-' : isIncome ? '+' : isTransfer ? '' : ''}
          {formatAmount(tx.amount)}
        </p>
        {showDate && (
          <p className="text-xs text-gray-400 mt-0.5">{getDateLabel(tx.date)}</p>
        )}
      </div>
    </div>
  );
}

/**
 * 카드 이름이 사실상 지출자 이름을 담고 있는지 판단한다.
 * 예: 카드 '성진 온누리' + 지출자 '김성진' → true (성을 뺀 '성진' 이 카드 이름에 들어 있음)
 *     카드 '우리 체크카드' + 지출자 '김성진' → false (다른 정보이므로 카드 이름을 남긴다)
 * 지출자와 카드 주인이 다를 때는 카드 이름이 유용한 정보라 그대로 보여준다.
 */
function cardNameHasMemberName(cardName?: string, memberName?: string): boolean {
  if (!cardName || !memberName) return false;
  const compact = cardName.replace(/\s/g, '');
  // 이름 전체(김성진)와 성을 뺀 이름(성진) 두 가지로 확인
  return [memberName, memberName.slice(1)]
    .filter((v) => v.length >= 2)
    .some((v) => compact.includes(v));
}

function getCategoryEmoji(category: string, type: string): string {
  if (type === 'transfer') return '🔄';
  if (type === 'income') return '💰';
  if (type === 'refund') return '↩️';

  const emojiMap: Record<string, string> = {
    '식비': '🍽️',
    '카페': '☕',
    '교통': '🚌',
    '쇼핑': '🛍️',
    '의료': '💊',
    '교육': '📚',
    '취미': '🎮',
    '고정비': '🔒',
    '주거': '🏠',
    '저축/투자': '📈',
    '생활': '🧺',
    '육아': '👶',
    '수입': '💰',
    '출장': '✈️',
    '기타': '📝',
  };

  return emojiMap[category] ?? '💳';
}
