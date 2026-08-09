-- 카드 별칭 컬럼 추가.
--
-- 삼성카드는 카드 끝 4자리를 주지만(card_last4),
-- 토스뱅크는 끝자리 대신 카드 별칭을 준다.
--   예) "[토스뱅크] 체크카드 국내 결제 / 김*진님의 생활비카드 카드 / 53,200원 결제 | 쿠팡"
-- 결제수단 자동 매칭에 쓰기 위해 별도 컬럼으로 보관한다.

ALTER TABLE card_notifications
  ADD COLUMN IF NOT EXISTS card_alias TEXT DEFAULT '';

-- 확인용:
-- SELECT issuer, card_last4, card_alias, merchant, amount
-- FROM card_notifications ORDER BY created_at DESC LIMIT 10;
