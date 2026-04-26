import KoreanLunarCalendar from 'korean-lunar-calendar';
import dayjs, { type Dayjs } from 'dayjs';

// ─────────────────────────────────────────
// 한국 음력 ↔ 양력 변환 헬퍼
// 라이브러리 지원 범위: 1391~2050
// ─────────────────────────────────────────

export interface LunarDate {
  year: number;
  month: number;       // 1-12
  day: number;         // 1-30
  intercalation: boolean; // 윤달 여부
}

/**
 * 양력 날짜 → 음력 날짜.
 * 변환 실패 시(범위 밖 등) null 반환.
 */
export function solarToLunar(date: Dayjs | string): LunarDate | null {
  try {
    const d = dayjs(date);
    const cal = new KoreanLunarCalendar();
    const ok = cal.setSolarDate(d.year(), d.month() + 1, d.date()); // dayjs month: 0-11
    if (!ok) return null;
    const lunar = cal.getLunarCalendar();
    return {
      year: lunar.year,
      month: lunar.month,
      day: lunar.day,
      intercalation: !!lunar.intercalation,
    };
  } catch {
    return null;
  }
}

/**
 * 두 양력 날짜를 각각 음력으로 변환했을 때 같은 음력 날짜인지(같은 month+day, 윤달 무시).
 * 매년/매월 음력 루틴 매칭에 사용.
 */
export function isSameLunarMonthDay(a: Dayjs | string, b: Dayjs | string): boolean {
  const la = solarToLunar(a);
  const lb = solarToLunar(b);
  if (!la || !lb) return false;
  // 윤달 차이는 무시 (둘 다 평달 또는 둘 다 같은 음력 일자)
  return la.month === lb.month && la.day === lb.day && !la.intercalation && !lb.intercalation;
}

export function isSameLunarDay(a: Dayjs | string, b: Dayjs | string): boolean {
  const la = solarToLunar(a);
  const lb = solarToLunar(b);
  if (!la || !lb) return false;
  return la.day === lb.day && !la.intercalation && !lb.intercalation;
}

/**
 * 양력 날짜를 "음력 X월 Y일" 한글 라벨로.
 */
export function formatLunarLabel(date: Dayjs | string): string {
  const lunar = solarToLunar(date);
  if (!lunar) return '';
  const leap = lunar.intercalation ? '윤' : '';
  return `음 ${leap}${lunar.month}월 ${lunar.day}일`;
}
