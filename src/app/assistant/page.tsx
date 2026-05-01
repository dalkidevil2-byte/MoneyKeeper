'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Send, Sparkles, Loader2, Mic, MicOff } from 'lucide-react';
import MessageContent from '@/components/assistant/MessageContent';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  '오늘 일정 알려줘',
  '이번 주 어떤 일에 시간 가장 많이 썼어?',
  '내일 오후 빈 시간 알려줘',
  '목표들 진행 상황은?',
  '지난주에 운동 몇 번 했어?',
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [autoSendOnFinish, setAutoSendOnFinish] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    return () => {
      const r = recognitionRef.current as { stop?: () => void } | null;
      if (r?.stop) r.stop();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const toggleVoice = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown;
      webkitSpeechRecognition?: new () => unknown;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      alert('이 브라우저는 음성 인식을 지원하지 않아요. 크롬/엣지 또는 OS 키보드 마이크를 사용해주세요.');
      return;
    }
    if (listening) {
      const r = recognitionRef.current as { stop?: () => void } | null;
      r?.stop?.();
      setListening(false);
      return;
    }
    const rec = new SR() as {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      const newText = input ? `${input} ${transcript}` : transcript;
      setInput(newText);
      setListening(false);
      if (autoSendOnFinish) {
        // 음성 종료 후 자동 전송
        setTimeout(() => send(newText), 100);
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const userMsg: Msg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const j = await res.json();
      const reply = j.content ?? '답변을 생성하지 못했어요.';
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
    } catch {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: '오류가 발생했어요. 다시 시도해주세요.' },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-white pb-24 flex flex-col">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-700"
          >
            <ChevronLeft size={22} />
          </Link>
          <div className="flex items-center gap-1.5 flex-1">
            <Sparkles size={18} className="text-violet-600" />
            <h1 className="text-lg font-bold text-gray-900">AI 어시스턴트</h1>
          </div>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        {messages.length === 0 ? (
          <div className="max-w-md mx-auto pt-10 space-y-4">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-3">
                <Sparkles size={28} className="text-violet-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">무엇을 도와드릴까요?</h2>
              <p className="text-sm text-gray-500 mt-1">
                일정, 할일, 시간, 목표 — 자연스럽게 물어보세요
              </p>
            </div>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left text-sm bg-white rounded-2xl px-4 py-3 border border-gray-100 active:bg-gray-50 hover:border-violet-300"
                >
                  💬 {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-violet-600 text-white rounded-br-sm'
                      : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm'
                  }`}
                >
                  <MessageContent
                    text={m.content}
                    linkClassName={
                      m.role === 'user'
                        ? 'underline underline-offset-2 break-all text-violet-100 hover:text-white'
                        : 'underline underline-offset-2 break-all text-violet-600 hover:text-violet-700'
                    }
                  />
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-400 shadow-sm inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> 데이터 확인 중…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 입력창 */}
      <div className="sticky bottom-0 z-10 bg-white border-t border-gray-100 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="max-w-md mx-auto">
          {listening && (
            <div className="text-[11px] text-rose-500 font-semibold text-center pb-1.5 animate-pulse">
              🎙 듣는 중… 말해주세요
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={listening ? '말해보세요...' : '입력 또는 🎤 음성'}
              rows={1}
              disabled={busy}
              className="flex-1 resize-none rounded-2xl bg-gray-100 px-4 py-2.5 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-300 max-h-32"
            />
            <button
              onClick={toggleVoice}
              disabled={busy}
              className={`w-10 h-10 rounded-full inline-flex items-center justify-center disabled:opacity-30 ${
                listening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
              aria-label="음성"
              title={listening ? '듣기 정지' : '음성으로 입력'}
            >
              {listening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="w-10 h-10 rounded-full bg-violet-600 text-white inline-flex items-center justify-center disabled:opacity-30"
              aria-label="전송"
            >
              <Send size={16} />
            </button>
          </div>
          <label className="flex items-center justify-end gap-1 text-[10px] text-gray-400 mt-1.5 select-none">
            <input
              type="checkbox"
              checked={autoSendOnFinish}
              onChange={(e) => setAutoSendOnFinish(e.target.checked)}
              className="accent-violet-600"
            />
            음성 끝나면 자동 전송
          </label>
        </div>
      </div>
    </div>
  );
}
