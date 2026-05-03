export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { logAiUsage } from '@/lib/ai-usage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/tts
 * body: { text: string, voice?: 'alloy'|'nova'|'shimmer'|'echo'|'onyx'|'fable'|'coral' }
 * 응답: audio/mpeg (mp3 스트림)
 *
 * 비용: $0.015 / 1k chars (TTS-1) — 브리핑 1건 ≈ $0.005 (약 7원)
 */
export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY 미설정' },
      { status: 500 },
    );
  }
  try {
    const body = await req.json();
    const text: string = String(body.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ error: 'text 필요' }, { status: 400 });
    }
    if (text.length > 4096) {
      return NextResponse.json(
        { error: '4096자 이하로 보내주세요' },
        { status: 400 },
      );
    }
    // 가능한 voice: alloy / echo / fable / nova / onyx / shimmer / coral
    // nova / shimmer / coral 이 한국어 자연스러운 편
    const voice = (body.voice ?? 'nova') as
      | 'alloy'
      | 'echo'
      | 'fable'
      | 'nova'
      | 'onyx'
      | 'shimmer'
      | 'coral';

    const speech = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      // speed: 1.0 (기본). 0.25~4.0 가능
    });
    const buf = Buffer.from(await speech.arrayBuffer());
    void logAiUsage({
      model: 'tts-1',
      feature: 'tts',
      audioChars: text.length,
      meta: { voice },
    });
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
