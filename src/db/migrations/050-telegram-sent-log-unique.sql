-- 텔레그램 알림 중복 발송 방지 — UNIQUE 제약
-- (task_id, occurrence_date, lead_minutes, member_id) 조합 중복 row 거부.
-- 동시 두 요청이 들어와도 두 번째는 insert 실패해서 발송 막힘.

-- 기존 중복 row 정리
DELETE FROM telegram_sent_log a
USING telegram_sent_log b
WHERE a.id < b.id
  AND a.task_id IS NOT DISTINCT FROM b.task_id
  AND a.occurrence_date IS NOT DISTINCT FROM b.occurrence_date
  AND a.lead_minutes IS NOT DISTINCT FROM b.lead_minutes
  AND a.member_id IS NOT DISTINCT FROM b.member_id;

-- UNIQUE 인덱스 (NULL 허용 위해 partial 두 개)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tg_sent_log_with_member
  ON telegram_sent_log(task_id, occurrence_date, lead_minutes, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tg_sent_log_no_member
  ON telegram_sent_log(task_id, occurrence_date, lead_minutes)
  WHERE member_id IS NULL;
