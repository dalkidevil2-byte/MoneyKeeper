import KoreanLunarCalendar from 'korean-lunar-calendar';
import dayjs from 'dayjs';

// ─────────────────────────────────────────
// 한국 공휴일 계산
// - 양력 고정 + 음력 명절(설/추석/부처님오신날) + 일요일 대체공휴일
// - 어린이날은 토요일도 대체공휴일
// - 라이브러리 지원 범위: 1391~2050
// ─────────────────────────────────────────

export interface Holiday {
  date: string;          // YYYY-MM-DD (양력)
  name: string;
  isSubstitute?: boolean; // 대체공휴일 여부
}

interface FixedRule {
  md: string;            // 'MM-DD'
  name: string;
  substitute: 'sun' | 'sun_sat' | 'none';
}

const FIXED: FixedRule[] = [
  { md: '01-01', name: '신정',       substitute: 'sun'     },
  { md: '03-01', name: '삼일절',     substitute: 'sun'     },
  { md: '05-05', name: '어린이날',   substitute: 'sun_sat' },
  { md: '06-06', name: '현충일',     substitute: 'none'    },
  { md: '08-15', name: '광복절',     substitute: 'sun'     },
  { md: '10-03', name: '개천절',     substitute: 'sun'     },
  { md: '10-09', name: '한글날',     substitute: 'sun'     },
  { md: '12-25', name: '크리스마스', substitute: 'sun'     },
];

function lunarToSolar(year: number, month: number, day: number): string | null {
  try {
    const cal = new KoreanLunarCalendar();
    if (!cal.setLunarDate(year, month, day, false)) return null;
    const s = cal.getSolarCalendar();
    return dayjs(`${s.year}-${String(s.month).padStart(2, '0')}-${String(s.day).padStart(2, '0')}`).format(
      'YYYY-MM-DD'
    );
  } catch {
    return null;
  }
}

const cache = new Map<number, Holiday[]>();

export function getHolidaysForYear(year: number): Holiday[] {
  if (cache.has(year)) return cache.get(year)!;
  const list: Holiday[] = [];

  // 양력 고정
  for (const f of FIXED) {
    const date = `${year}-${f.md}`;
    list.push({ date, name: f.name });
    const dow = dayjs(date).day(); // 0=일, 6=토
    if (f.substitute === 'sun' && dow === 0) {
      list.push({
        date: dayjs(date).add(1, 'day').format('YYYY-MM-DD'),
        name: `${f.name} 대체`,
        isSubstitute: true,
      });
    } else if (f.substitute === 'sun_sat') {
      if (dow === 0) {
        list.push({
          date: dayjs(date).add(1, 'day').format('YYYY-MM-DD'),
          name: `${f.name} 대체`,
          isSubstitute: true,
        });
      } else if (dow === 6) {
        // 토요일 → 다음 월요일
        list.push({
          date: dayjs(date).add(2, 'day').format('YYYY-MM-DD'),
          name: `${f.name} 대체`,
          isSubstitute: true,
        });
      }
    }
  }

  // 설날 연휴 (음 1/1 전날·당일·다음날)
  const seol = lunarToSolar(year, 1, 1);
  if (seol) {
    const d = dayjs(seol);
    list.push({ date: d.subtract(1, 'day').format('YYYY-MM-DD'), name: '설날 연휴' });
    list.push({ date: seol, name: '설날' });
    list.push({ date: d.add(1, 'day').format('YYYY-MM-DD'), name: '설날 연휴' });
    // 일요일 겹침 → 다음 평일 대체 (간이 처리: 3일 중 일요일이 있으면 그 다음 첫 평일)
    addLunarSubstitute(list, [d.subtract(1, 'day'), d, d.add(1, 'day')], '설날 대체');
  }

  // 부처님오신날 (음 4/8)
  const buddha = lunarToSolar(year, 4, 8);
  if (buddha) {
    list.push({ date: buddha, name: '부처님오신날' });
    if (dayjs(buddha).day() === 0) {
      list.push({
        date: dayjs(buddha).add(1, 'day').format('YYYY-MM-DD'),
        name: '부처님오신날 대체',
        isSubstitute: true,
      });
    }
  }

  // 추석 연휴 (음 8/15 전날·당일·다음날)
  const chuseok = lunarToSolar(year, 8, 15);
  if (chuseok) {
    const d = dayjs(chuseok);
    list.push({ date: d.subtract(1, 'day').format('YYYY-MM-DD'), name: '추석 연휴' });
    list.push({ date: chuseok, name: '추석' });
    list.push({ date: d.add(1, 'day').format('YYYY-MM-DD'), name: '추석 연휴' });
    addLunarSubstitute(list, [d.subtract(1, 'day'), d, d.add(1, 'day')], '추석 대체');
  }

  cache.set(year, list);
  return list;
}

// 설날/추석 연휴 3일 중 일요일이 있으면 다음 평일 1일을 대체로 추가
function addLunarSubstitute(list: Holiday[], days: dayjs.Dayjs[], name: string) {
  const hasSunday = days.some((d) => d.day() === 0);
  if (!hasSunday) return;
  // 연휴 마지막 날 다음의 첫 평일
  let cur = days[days.length - 1].add(1, 'day');
  // 평일이면서 기존 공휴일과 겹치지 않을 때까지
  for (let i = 0; i < 5; i++) {
    const k = cur.format('YYYY-MM-DD');
    const isWeekend = cur.day() === 0 || cur.day() === 6;
    const overlaps = list.some((h) => h.date === k);
    if (!isWeekend && !overlaps) {
      list.push({ date: k, name, isSubstitute: true });
      return;
    }
    cur = cur.add(1, 'day');
  }
}

/**
 * year 의 공휴일을 { 'YYYY-MM-DD': Holiday[] } 형태로 반환.
 * 같은 날짜에 여러 공휴일이 겹칠 수 있음(예: 신정 + 어린이날 매우 드물게).
 */
export function getHolidaysMap(year: number): Record<string, Holiday[]> {
  const map: Record<string, Holiday[]> = {};
  for (const h of getHolidaysForYear(year)) {
    (map[h.date] ??= []).push(h);
  }
  return map;
}

/** 표시용 짧은 이름 (예: "설날 연휴" → "설날") */
export function shortHolidayName(name: string): string {
  return name
    .replace(' 연휴', '')
    .replace(' 대체', '');
}
