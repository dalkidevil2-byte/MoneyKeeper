// 영수증 사진 → OCR 결과.
// 입력 화면과 편집 화면(영수증으로 대체)에서 함께 쓴다.

export interface ReceiptOcrItem {
  name: string;
  amount: number;
  quantity?: number;
  unit?: string;
  category_main?: string;
  category_sub?: string;
}

export interface ReceiptOcrResult {
  store_name?: string;
  date?: string;
  total?: number;
  receipt_url?: string;
  items?: ReceiptOcrItem[];
}

/** 업로드 전에 긴 변을 1200px 로 줄인다 — 원본 그대로는 느리고 실패도 잦다. */
function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      resolve({ base64: canvas.toDataURL('image/jpeg', 0.8).split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * 영수증을 읽어 품목 목록을 돌려준다.
 * 실패 사유는 문자열로 돌려준다 — 호출한 쪽에서 화면에 맞게 보여주도록.
 */
export async function runReceiptOcr(
  file: File,
): Promise<{ result: ReceiptOcrResult } | { error: string }> {
  try {
    const { base64, mimeType } = await compressImage(file);
    const fd = new FormData();
    fd.append('base64', base64);
    fd.append('mimeType', mimeType);

    const res = await fetch('/api/transactions/ocr', { method: 'POST', body: fd });
    const text = await res.text();

    let data: { result?: ReceiptOcrResult; error?: string };
    try {
      data = JSON.parse(text);
    } catch {
      return { error: `서버 응답을 읽지 못했어요 (HTTP ${res.status})` };
    }
    if (!res.ok) return { error: data.error ?? `영수증 읽기 실패 (${res.status})` };
    if (!data.result?.items?.length) {
      return { error: '영수증에서 품목을 못 찾았어요. 더 선명한 사진으로 다시 시도해주세요.' };
    }
    return { result: data.result };
  } catch (e) {
    return { error: e instanceof Error ? e.message : '영수증 처리 중 오류가 발생했어요' };
  }
}

/** 품목들의 금액 가중치로 대표 카테고리를 정한다. */
export function pickCategoryFromItems(items: ReceiptOcrItem[]): { main: string; sub: string } {
  const mainWeight: Record<string, number> = {};
  items.forEach((i) => {
    const k = i.category_main || '기타';
    mainWeight[k] = (mainWeight[k] ?? 0) + Math.abs(i.amount);
  });
  const main = Object.entries(mainWeight).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const subWeight: Record<string, number> = {};
  items
    .filter((i) => (i.category_main || '기타') === main && i.category_sub)
    .forEach((i) => {
      subWeight[i.category_sub!] = (subWeight[i.category_sub!] ?? 0) + Math.abs(i.amount);
    });
  const sub = Object.entries(subWeight).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  return { main, sub };
}

/** 거래 대표 이름 — "우유 외 12건" */
export function representativeName(items: ReceiptOcrItem[]): string {
  if (items.length === 0) return '';
  return items.length === 1 ? items[0].name : `${items[0].name} 외 ${items.length - 1}건`;
}
