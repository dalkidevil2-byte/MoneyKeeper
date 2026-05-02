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
