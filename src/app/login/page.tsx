'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleLogin = async () => {
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace('/');
      } else {
        let msg = '로그인에 실패했어요';
        try {
          const data = await res.json();
          msg = data.error ?? msg;
        } catch { /* non-JSON response */ }
        setError(msg);
        setPassword('');
        inputRef.current?.focus();
      }
    } catch {
      setError('서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* 아이콘 */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center shadow-sm">
            <Lock size={36} className="text-indigo-600" strokeWidth={2} />
          </div>
        </div>

        {/* 타이틀 */}
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-1">My Assistant</h1>
        <p className="text-sm text-gray-500 text-center mb-8">비밀번호를 입력해주세요</p>

        {/* 입력폼 */}
        <div className="space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="비밀번호"
              className={`w-full border rounded-2xl px-4 py-3.5 text-base pr-12 focus:outline-none focus:ring-2 transition-all ${
                error
                  ? 'border-rose-300 focus:ring-rose-200 bg-rose-50'
                  : 'border-gray-200 focus:ring-indigo-200 bg-white'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-sm text-rose-500 text-center">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={!password || loading}
            className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-semibold text-base active:scale-[0.98] transition-all disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                확인 중...
              </span>
            ) : (
              '입장하기'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
