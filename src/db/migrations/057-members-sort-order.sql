-- 구성원 표시 순서.
--
-- 지금은 등록순(created_at)으로 나와서 자주 쓰는 사람이 뒤에 밀린다.
-- (성진 · 보성 · 어머님 · 엄마 · 아빠 · 주희 → 주희가 맨 뒤)
-- 결제자·지출 대상을 고를 때마다 찾아야 하므로 순서를 정할 수 있게 한다.
--
-- 값이 작을수록 앞. 지정하지 않으면 100 이라 기존 구성원은 뒤로 간다.

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 100;

-- 우리가족 먼저, 부모님은 뒤로
UPDATE members SET sort_order = 1  WHERE name = '성진';
UPDATE members SET sort_order = 2  WHERE name = '주희';
UPDATE members SET sort_order = 3  WHERE name = '보성';
UPDATE members SET sort_order = 11 WHERE name = '엄마';
UPDATE members SET sort_order = 12 WHERE name = '아빠';
UPDATE members SET sort_order = 13 WHERE name = '어머님';

-- 확인용:
-- SELECT name, sort_order FROM members WHERE is_active ORDER BY sort_order, created_at;
