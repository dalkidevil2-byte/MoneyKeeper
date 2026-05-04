/**
 * Naver CLOVA Receipt OCR — 한국 영수증 특화.
 * 무료 티어 (1000 건/월) 로 가계부 영수증 처리.
 *
 * 환경변수:
 *   CLOVA_OCR_INVOKE_URL — 도메인 생성 후 받는 Invoke URL
 *   CLOVA_OCR_SECRET_KEY — Secret Key
 *
 * 둘 다 없으면 isClovaConfigured() 가 false → 호출자가 gpt-4o fallback.
 *
 * 셋업: https://www.ncloud.com/product/aiService/ocr
 *   Console → AI Service → CLOVA OCR → Domain 생성 (영수증/Receipt)
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
};

export function isClovaConfigured(): boolean {
  return !!process.env.CLOVA_OCR_INVOKE_URL && !!process.env.CLOVA_OCR_SECRET_KEY;
}

interface ClovaSubResultItem {
  name?: { formatted?: { value?: string }; text?: string };
  count?: { formatted?: { value?: string }; text?: string };
  unitPrice?: { formatted?: { value?: string }; text?: string };
  price?: { formatted?: { value?: string }; text?: string };
}

interface ClovaSubResult {
  items?: ClovaSubResultItem[];
}

interface ClovaReceiptObj {
  result?: {
    storeInfo?: {
      name?: { formatted?: { value?: string }; text?: string };
    };
    paymentInfo?: {
      date?: { formatted?: { year?: string; month?: string; day?: string }; text?: string };
      time?: { formatted?: { hour?: string; minute?: string }; text?: string };
      cardCompany?: { formatted?: { value?: string }; text?: string };
      cardNumber?: { formatted?: { value?: string }; text?: string };
    };
    totalPrice?: {
      price?: { formatted?: { value?: string }; text?: string };
    };
    subResults?: ClovaSubResult[];
  };
}

interface ClovaImage {
  receipt?: ClovaReceiptObj;
  inferResult?: string; // SUCCESS | FAILURE
  message?: string;
}

interface ClovaResponse {
  version?: string;
  requestId?: string;
  timestamp?: number;
  images?: ClovaImage[];
}

const numFromText = (val: string | undefined): number | undefined => {
  if (!val) return undefined;
  const cleaned = val.replace(/[,\s원]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * 이미지 (data URL 또는 base64) 를 CLOVA Receipt OCR 으로 호출.
 */
export async function runClovaReceiptOcr(
  imageBase64OrUrl: string,
): Promise<ClovaReceiptResult | null> {
  const url = process.env.CLOVA_OCR_INVOKE_URL;
  const secret = process.env.CLOVA_OCR_SECRET_KEY;
  if (!url || !secret) return null;

  // base64 부분만 추출
  let base64 = imageBase64OrUrl;
  let format = 'jpg';
  const mtMatch = imageBase64OrUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (mtMatch) {
    format = mtMatch[1] === 'jpeg' ? 'jpg' : mtMatch[1];
    base64 = mtMatch[2];
  } else if (imageBase64OrUrl.startsWith('http')) {
    // 외부 URL → 다운로드
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
    const json = (await res.json()) as ClovaResponse;
    const img = json.images?.[0];
    if (!img || img.inferResult !== 'SUCCESS' || !img.receipt?.result) {
      console.warn('[CLOVA OCR] inferResult', img?.inferResult, img?.message);
      return null;
    }
    const r = img.receipt.result;

    // 가게명
    const storeName =
      r.storeInfo?.name?.formatted?.value || r.storeInfo?.name?.text || undefined;

    // 날짜 — formatted 가 yyyy/mm/dd 같은 식으로 분리됨
    let date: string | undefined;
    const yr = r.paymentInfo?.date?.formatted?.year;
    const mo = r.paymentInfo?.date?.formatted?.month;
    const dy = r.paymentInfo?.date?.formatted?.day;
    if (yr && mo && dy) {
      date = `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}`;
    }

    // 결제수단
    const paymentMethod =
      r.paymentInfo?.cardCompany?.formatted?.value ||
      r.paymentInfo?.cardCompany?.text ||
      undefined;

    // 합계
    const total = numFromText(
      r.totalPrice?.price?.formatted?.value || r.totalPrice?.price?.text,
    );

    // 품목들 (subResults[].items[])
    const items: ClovaReceiptItem[] = [];
    for (const sr of r.subResults ?? []) {
      for (const it of sr.items ?? []) {
        const itemName =
          it.name?.formatted?.value || it.name?.text || '';
        if (!itemName.trim()) continue;
        const count = numFromText(
          it.count?.formatted?.value || it.count?.text,
        );
        const unitPrice = numFromText(
          it.unitPrice?.formatted?.value || it.unitPrice?.text,
        );
        const price =
          numFromText(it.price?.formatted?.value || it.price?.text) ?? 0;
        items.push({ name: itemName.trim(), count, unitPrice, price });
      }
    }

    return { storeName, date, total, items, paymentMethod };
  } catch (e) {
    console.warn('[CLOVA OCR] error', (e as Error).message);
    return null;
  }
}
