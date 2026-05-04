/**
 * Naver CLOVA OCR (General 도메인) — 한국어 텍스트 추출 특화.
 * 영수증 텍스트만 추출 → gpt-4o-mini 가 구조 파싱.
 *
 * 환경변수:
 *   CLOVA_OCR_INVOKE_URL — Invoke URL (도메인 상세 → API Gateway 연동 후)
 *   CLOVA_OCR_SECRET_KEY — Secret Key
 */

export type ClovaReceiptItem = {
  name: string;
  count?: number;
  unitPrice?: number;
  price: number;
};

export type ClovaReceiptResult = {
  storeName?: string;
  date?: string;
  total?: number;
  items: ClovaReceiptItem[];
  paymentMethod?: string;
  /** 디버깅 용 — CLOVA 가 추출한 raw 텍스트 */
  rawText?: string;
};

export function isClovaConfigured(): boolean {
  return !!process.env.CLOVA_OCR_INVOKE_URL && !!process.env.CLOVA_OCR_SECRET_KEY;
}

interface GeneralField {
  inferText?: string;
  boundingPoly?: {
    vertices?: Array<{ x: number; y: number }>;
  };
  lineBreak?: boolean;
}
interface GeneralImage {
  fields?: GeneralField[];
  inferResult?: string;
  message?: string;
}
interface GeneralResponse {
  images?: GeneralImage[];
}

/**
 * General OCR 의 텍스트 조각들을 줄 단위로 재조합.
 * y 좌표로 그룹핑 (비슷한 y 값끼리 한 줄), 같은 줄에서 x 좌표 순서로 결합.
 */
function fieldsToLines(fields: GeneralField[]): string[] {
  type Box = { text: string; y: number; x: number; ymax: number };
  const boxes: Box[] = [];
  for (const f of fields) {
    if (!f.inferText) continue;
    const verts = f.boundingPoly?.vertices ?? [];
    if (verts.length === 0) continue;
    const ys = verts.map((v) => v.y).filter((y) => typeof y === 'number');
    const xs = verts.map((v) => v.x).filter((x) => typeof x === 'number');
    const y = Math.min(...ys);
    const ymax = Math.max(...ys);
    const x = Math.min(...xs);
    boxes.push({ text: f.inferText, y, ymax, x });
  }

  // y 순으로 정렬 + 줄 단위 그룹핑 (높이 절반 만큼 겹치면 같은 줄)
  boxes.sort((a, b) => a.y - b.y);
  const lines: Box[][] = [];
  for (const b of boxes) {
    const cur = lines[lines.length - 1];
    if (cur) {
      const lastTop = Math.min(...cur.map((c) => c.y));
      const lastBot = Math.max(...cur.map((c) => c.ymax));
      const halfHeight = (lastBot - lastTop) / 2 || 10;
      // 박스의 중심 y 가 직전 줄 범위 안에 들면 같은 줄
      const centerY = (b.y + b.ymax) / 2;
      if (centerY >= lastTop - halfHeight * 0.3 && centerY <= lastBot + halfHeight * 0.3) {
        cur.push(b);
        continue;
      }
    }
    lines.push([b]);
  }

  // 각 줄 내부는 x 순으로 정렬
  return lines.map((line) =>
    line.sort((a, b) => a.x - b.x).map((b) => b.text).join(' '),
  );
}

/**
 * CLOVA General OCR 호출 → 텍스트 줄 배열 + raw 텍스트 반환.
 * 구조 파싱 (가게명/품목/금액) 은 receipt-ocr.ts 가 gpt-4o-mini 로 후처리.
 */
export async function runClovaReceiptOcr(
  imageBase64OrUrl: string,
): Promise<ClovaReceiptResult | null> {
  const url = process.env.CLOVA_OCR_INVOKE_URL;
  const secret = process.env.CLOVA_OCR_SECRET_KEY;
  if (!url || !secret) return null;

  // base64 + format
  let base64 = imageBase64OrUrl;
  let format = 'jpg';
  const mtMatch = imageBase64OrUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (mtMatch) {
    format = mtMatch[1] === 'jpeg' ? 'jpg' : mtMatch[1];
    base64 = mtMatch[2];
  } else if (imageBase64OrUrl.startsWith('http')) {
    try {
      const r = await fetch(imageBase64OrUrl);
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      base64 = Buffer.from(ab).toString('base64');
      const ct = r.headers.get('content-type') ?? '';
      if (ct.includes('png')) format = 'png';
      else if (ct.includes('webp')) format = 'webp';
      else format = 'jpg';
    } catch {
      return null;
    }
  }

  const body = {
    version: 'V2',
    requestId: `mk-${Date.now()}`,
    timestamp: Date.now(),
    images: [{ format, name: 'receipt', data: base64 }],
  };

  let json: GeneralResponse;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-OCR-SECRET': secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn('[CLOVA OCR] HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }
    json = (await res.json()) as GeneralResponse;
  } catch (e) {
    console.warn('[CLOVA OCR] fetch error', (e as Error).message);
    return null;
  }

  const img = json.images?.[0];
  if (!img || img.inferResult !== 'SUCCESS' || !img.fields) {
    console.warn('[CLOVA OCR] inferResult', img?.inferResult, img?.message);
    return null;
  }

  const lines = fieldsToLines(img.fields);
  const rawText = lines.join('\n');

  // 구조 파싱은 호출자가 GPT 로 후처리.
  // 여기서는 텍스트만 반환 (items 빈 배열).
  return {
    items: [],
    rawText,
  };
}
