import { Client } from '@notionhq/client';
import type { Transaction } from '@/types';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;

// ─────────────────────────────────────────
// 매핑 헬퍼
// ─────────────────────────────────────────
const TYPE_EMOJI: Record<string, string> = {
  income: '💰',
  fixed_expense: '🔒',
  variable_expense: '💳',
  transfer: '🔄',
  refund: '↩️',
  adjustment: '⚙️',
};

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

function buildPageTitle(tx: Transaction, cancelled = false): string {
  const emoji = TYPE_EMOJI[tx.type] ?? '';
  const label = tx.name || tx.merchant_name || '거래';
  return `${cancelled ? '[취소] ' : ''}${emoji} ${label}`;
}

// 거래 레코드 → Notion properties payload
function buildProperties(tx: Transaction, cancelled = false) {
  return {
    Name: {
      title: [{ text: { content: buildPageTitle(tx, cancelled) } }],
    },
    날짜: { date: { start: tx.date } },
    금액: { number: tx.amount },
    유형: { select: { name: getTypeLabel(tx.type) } },
    ...(tx.category_main
      ? { 카테고리: { select: { name: tx.category_main } } }
      : { 카테고리: { select: null } }),
    가맹점: {
      rich_text: tx.merchant_name ? [{ text: { content: tx.merchant_name } }] : [],
    },
    메모: {
      rich_text: tx.memo ? [{ text: { content: tx.memo } }] : [],
    },
    내부ID: {
      rich_text: [{ text: { content: tx.id } }],
    },
  };
}

// 세부 품목 → Notion body blocks (테이블 대신 bulleted_list_item로)
// DELETE_ALL 섹션이 필요 없어 replace 시 모든 children 삭제 후 재삽입
export type ItemForNotion = {
  name: string;
  quantity: number;
  price: number;
  unit?: string;
  category_main?: string;
  category_sub?: string;
};

function buildItemBlocks(items: ItemForNotion[]) {
  if (!items.length) return [];

  const rows = items.map((it) => {
    const unit = it.unit || '개';
    const parts = [
      `${it.name}`,
      `${it.quantity}${unit}`,
      `${Math.round(it.price).toLocaleString('ko-KR')}원`,
    ];
    const cat = [it.category_main, it.category_sub].filter(Boolean).join('/');
    if (cat) parts.push(`[${cat}]`);
    return {
      object: 'block' as const,
      type: 'bulleted_list_item' as const,
      bulleted_list_item: {
        rich_text: [{ type: 'text' as const, text: { content: parts.join(' · ') } }],
      },
    };
  });

  return [
    {
      object: 'block' as const,
      type: 'heading_3' as const,
      heading_3: {
        rich_text: [{ type: 'text' as const, text: { content: '🛒 세부 품목' } }],
      },
    },
    ...rows,
  ];
}

// ─────────────────────────────────────────
// 생성
// ─────────────────────────────────────────
export async function createNotionPage(
  tx: Transaction,
  items: ItemForNotion[] = []
): Promise<string | null> {
  if (!process.env.NOTION_TOKEN || !DATABASE_ID) return null;

  try {
    const response = await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: buildProperties(tx) as never,
      children: buildItemBlocks(items) as never,
    });
    return response.id;
  } catch (error) {
    console.error('[Notion] create 실패:', error);
    return null;
  }
}

// ─────────────────────────────────────────
// 수정 (전체 필드)
// ─────────────────────────────────────────
export async function updateNotionPage(
  pageId: string,
  tx: Transaction,
  items?: ItemForNotion[]
): Promise<boolean> {
  if (!process.env.NOTION_TOKEN) return false;

  try {
    // 1) 속성 갱신
    await notion.pages.update({
      page_id: pageId,
      properties: buildProperties(tx) as never,
    });

    // 2) 세부 품목 본문 교체 (items가 주어진 경우만)
    if (items !== undefined) {
      // 기존 children 조회 후 삭제
      const children = await notion.blocks.children.list({ block_id: pageId });
      for (const b of children.results) {
        try {
          await notion.blocks.delete({ block_id: b.id });
        } catch {
          /* ignore - 이미 삭제된 블록 */
        }
      }
      // 새 블록 추가
      const blocks = buildItemBlocks(items);
      if (blocks.length) {
        await notion.blocks.children.append({
          block_id: pageId,
          children: blocks as never,
        });
      }
    }
    return true;
  } catch (error) {
    console.error('[Notion] update 실패:', error);
    return false;
  }
}

// ─────────────────────────────────────────
// 아카이브 (삭제 시)
// ─────────────────────────────────────────
export async function archiveNotionPage(pageId: string, tx?: Transaction): Promise<boolean> {
  if (!process.env.NOTION_TOKEN) return false;

  try {
    // 제목에 [취소] 프리픽스
    if (tx) {
      await notion.pages.update({
        page_id: pageId,
        properties: {
          Name: {
            title: [{ text: { content: buildPageTitle(tx, true) } }],
          },
        } as never,
      });
    }
    // archive
    await notion.pages.update({
      page_id: pageId,
      archived: true,
    });
    return true;
  } catch (error) {
    console.error('[Notion] archive 실패:', error);
    return false;
  }
}

export { notion };
