/**
 * 한국 주식 시장 거래 시간 유틸.
 *
 * KRX 정규장: 평일 09:00 ~ 15:30
 * NXT 프리마켓: 평일 08:00 ~ 08:50
 * NXT 메인:    평일 09:00 ~ 15:20 (KRX 와 동시 운영)
 * NXT 애프터:  평일 15:30 ~ 20:00
 *
 * 통합: 평일 08:00 ~ 20:00 = "거래 가능 시간".
 * 그 외 시간 (저녁 / 새벽 / 주말 / 공휴일) 은 종가 캐시 사용 → 외부 API 호출 안 함.
 */
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

export type MarketState =
  | 'PRE_NXT'      // 08:00–08:50 NXT 프리
  | 'KRX_OPEN'     // 09:00–15:20 KRX + NXT 둘 다 열림
  | 'KRX_CLOSE'    // 15:20–15:30 KRX 종료 직후
  | 'POST_NXT'     // 15:30–20:00 NXT 애프터
  | 'CLOSED';      // 그 외

/** 한국 시간 기준 현재 시장 상태 (공휴일 고려 X — 단순 평일/시각만) */
export function getMarketState(now: dayjs.Dayjs = dayjs().tz(KST)): MarketState {
  const day = now.day(); // 0=일, 6=토
  if (day === 0 || day === 6) return 'CLOSED';

  const minutes = now.hour() * 60 + now.minute();
  // 08:00 = 480, 08:50 = 530, 09:00 = 540, 15:20 = 920, 15:30 = 930, 20:00 = 1200
  if (minutes >= 480 && minutes < 530) return 'PRE_NXT';
  if (minutes >= 540 && minutes < 920) return 'KRX_OPEN';
  if (minutes >= 920 && minutes < 930) return 'KRX_CLOSE';
  if (minutes >= 930 && minutes < 1200) return 'POST_NXT';
  return 'CLOSED';
}

/** 현재 외부 시세 API 호출이 의미 있나? (= 가격이 움직일 가능성 있음) */
export function isLiveTradingNow(now?: dayjs.Dayjs): boolean {
  const s = getMarketState(now);
  return s !== 'CLOSED';
}

/** NXT 시간대 (KRX 정규장 밖)에서 NXT 가격을 우선 노출할지 */
export function shouldPreferNxtPrice(now?: dayjs.Dayjs): boolean {
  const s = getMarketState(now);
  return s === 'PRE_NXT' || s === 'POST_NXT' || s === 'KRX_CLOSE';
}

/**
 * 캐시 TTL — 시장 상태별 다르게.
 * 거래 시간엔 짧게, 종료 후엔 길게.
 */
export function quoteCacheTtlMs(now?: dayjs.Dayjs): number {
  const s = getMarketState(now);
  switch (s) {
    case 'KRX_OPEN':
      return 30_000; // 30초
    case 'PRE_NXT':
    case 'POST_NXT':
      return 60_000; // 1분
    case 'KRX_CLOSE':
      return 60_000;
    case 'CLOSED':
    default:
      return 12 * 60 * 60_000; // 12시간 (장 다시 열릴 때까지 거의 안 호출)
  }
}
