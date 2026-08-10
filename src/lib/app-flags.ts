/**
 * 배포별 기능 토글 — 환경변수로 제어.
 * Vercel 환경변수에 'true' 로 설정하면 활성화.
 */

const truthy = (v: string | undefined): boolean => {
  if (!v) return false;
  const lower = v.toLowerCase().trim();
  return lower === 'true' || lower === '1' || lower === 'yes';
};

/** 주식 메뉴/페이지 숨김 (NEXT_PUBLIC_DISABLE_STOCKS=true) */
export const STOCKS_DISABLED: boolean = truthy(process.env.NEXT_PUBLIC_DISABLE_STOCKS);

/**
 * 단독 사용자 모드 — 가족 기능 (멤버, 멤버 필터, 색상별 멤버) 숨김.
 * 데이터 모델은 그대로지만 UI 만 가린다. 모든 거래/할일은 자동으로 단일 본인 데이터로 취급.
 * (NEXT_PUBLIC_SOLO_MODE=true)
 */
export const SOLO_MODE: boolean = truthy(process.env.NEXT_PUBLIC_SOLO_MODE);

/**
 * 시간 기록 계열 UI 숨김 — 활동 추적(▶ 시작/정지), 할일 타이머, Daily Track.
 *
 * 셋 다 '매번 시작/정지를 눌러야 하는' 기능이라 실제로 쓰이지 않았다
 * (마지막 기록: 활동 5/25 · 타이머 5/9 · 트랙 5/1).
 * 기능과 데이터는 그대로 두고 화면에서만 감춘다.
 * 다시 쓰려면 NEXT_PUBLIC_SHOW_TRACKING=true 를 설정하면 된다.
 */
export const TRACKING_HIDDEN: boolean = !truthy(process.env.NEXT_PUBLIC_SHOW_TRACKING);
