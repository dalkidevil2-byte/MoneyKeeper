import { Client } from '@notionhq/client';
import type { Transaction } from '@/types';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;

// ─────────────────────────────────────────
// 거래 → Notion 페이지 생성
// ─────────────────────────────────────────
export async function createNotionPage(tx: Transaction): Promise<string | null> {
  if (!process.env.NOTION_TOKEN || !DATABASE_ID) return null;

  try {
    const typeEmoji: Record<string, string> = {
      income: '💰',
      fixed_expense: '🔒',
      variable_expense: '💳',
      transfer: '🔄',
      refund: '↩️',
      adjustment: '⚙️',
    };

    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        // 제목 (Name 필드)
        Name: {
          title: [
            {
              text: {
                content: `${typeEmoji[tx.type] ?? ''} ${tx.name || tx.merchant_name || '거래'}`,
              },
            },
          ],
        },
        // 날짜
        날짜: { date: { start: tx.date } },
        // 금액
        금액: { number: tx.amount },
        // 유형
        유형: { select: { name: getTypeLabel(tx.type) } },
        // 카테고리
        ...(tx.category_main && {
          카테고리: { select: { name: tx.category_main } },
        }),
        // 가맹점
        ...(tx.merchant_name && {
          가맹점: { rich_text: [{ text: { content: tx.merchant_name } }] },
        }),
        // 메모
        ...(tx.memo && {
          메모: { rich_text: [{ text: { content: tx.memo } }] },
        }),
        // 내부 ID (역추적용)
        내부ID: { rich_text: [{ text: { content: tx.id } }] },
      },
    });

    return response.id;
  } catch (error) {
    console.error('[Notion] 페이지 생성 실패:', error);
    return null;
  }
}

// ─────────────────────────────────────────
// 거래 → Notion 페이지 업데이트 (메모, 태그 등)
// ─────────────────────────────────────────
export async function updateNotionPage(
  pageId: string,
  updates: Pick<Transaction, 'memo' | 'tags' | 'category_main' | 'category_sub' | 'essential'>
): Promise<boolean> {
  if (!process.env.NOTION_TOKEN) return false;

  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        ...(updates.memo !== undefined && {
          메모: { rich_text: [{ text: { content: updates.memo } }] },
        }),
        ...(updates.category_main && {
          카테고리: { select: { name: updates.category_main } },
        }),
      },
    });
    return true;
  } catch (error) {
    console.error('[Notion] 페이지 업데이트 실패:', error);
    return false;
  }
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    income: '수입',
    fixed_expense: '고정지출',
    variable_expense: '변동지출',
    transfer: '자금이동',
    refund: '환불',
    adjustment: '조정',
  };
  return labels[type] ?? type;
}

export { notion };
