import OpenAI from 'openai';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ConditionContext = {
  activityName: string;
  startAtIso: string;
  endAtIso: string | null;
  durationMinutes: number | null;
};

export type ConditionResult = {
  met: boolean;
  reason: string;
};

/**
 * 자연어 조건이 충족됐는지 판단.
 * 예: "12시 전 취침" + 23:30 시작 → met=true
 *     "12시 전 취침" + 01:00 시작 → met=false
 *     "30분 이상 운동" + 25분 → met=false
 */
export async function evaluateCondition(
  conditionText: string,
  ctx: ConditionContext,
): Promise<ConditionResult> {
  if (!conditionText.trim()) {
    return { met: true, reason: '조건 없음 (기본 충족)' };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { met: true, reason: 'OpenAI 키 없음 — 기본 충족 처리' };
  }

  const startKst = dayjs(ctx.startAtIso).tz(KST);
  const endKst = ctx.endAtIso ? dayjs(ctx.endAtIso).tz(KST) : null;

  const prompt = `다음 조건이 충족됐는지 판단해주세요.

조건: "${conditionText}"

활동 정보:
- 활동 이름: ${ctx.activityName}
- 시작: ${startKst.format('YYYY-MM-DD HH:mm:ss')} (KST, ${startKst.format('dddd')})
- 종료: ${endKst ? endKst.format('YYYY-MM-DD HH:mm:ss') : '진행 중'} (KST)
- 지속 시간: ${ctx.durationMinutes != null ? `${ctx.durationMinutes}분` : '미정'}

판단 기준:
- "X시 전" → 시작 시간이 X시 이전인지 (예: "12시 전" = 24:00 이전 = 23:59:59 까지)
- "X시 전 취침" 처럼 시간 명시면 시작 시간(취침 시작)을 기준으로
- "X분 이상" / "X시간 이상" → duration_minutes 기준
- 모호하면 활동의 의도를 합리적으로 추론

JSON 만 응답 (마크다운 X):
{"met": boolean, "reason": "한 줄 한국어 설명"}`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });
    const raw = res.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { met?: boolean; reason?: string };
    return {
      met: !!parsed.met,
      reason: parsed.reason ?? '판단 결과',
    };
  } catch (e) {
    console.error('[evaluateCondition]', e);
    return { met: false, reason: 'AI 평가 실패' };
  }
}
