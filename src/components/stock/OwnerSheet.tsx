'use client';

import { useCallback, useState } from 'react';
import { X, Trash2 } from 'lucide-react';

export type Owner = { id: string; name: string };

interface Props {
  mode: 'create' | 'edit';
  owner?: Owner;
  apiBase?: string; // default: '/api/stocks/owners'
  onClose: () => void;
  onSaved: () => void;
}

export default function OwnerSheet({
  mode,
  owner,
  apiBase = '/api/stocks/owners',
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(owner?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setErrorMsg(null);
    if (!name.trim()) return setErrorMsg('이름을 입력해주세요.');

    setSaving(true);
    try {
      const url = mode === 'edit' && owner ? `${apiBase}/${owner.id}` : apiBase;
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [name, mode, owner, apiBase, onSaved, onClose]);

  const handleDelete = useCallback(async () => {
    if (mode !== 'edit' || !owner) return;
    if (
      !confirm(
        `"${owner.name}"을(를) 삭제하면 하위 계좌·거래내역도 모두 삭제됩니다. 계속할까요?`
      )
    )
      return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/${owner.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }, [mode, owner, apiBase, onSaved, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900">
            {mode === 'edit' ? '소유자 수정' : '소유자 추가'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">이름</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 홍길동"
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-5 pt-2 pb-6 border-t border-gray-100 flex gap-2">
          {mode === 'edit' && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="px-4 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : mode === 'edit' ? '수정' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
