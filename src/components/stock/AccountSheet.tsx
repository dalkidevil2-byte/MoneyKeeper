'use client';

import { useCallback, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { Owner } from './OwnerSheet';

export type StockAccountRow = {
  id: string;
  owner_id: string;
  broker_name: string;
  account_number: string;
  owner?: Owner;
};

interface Props {
  mode: 'create' | 'edit';
  account?: StockAccountRow;
  owners: Owner[];
  defaultOwnerId?: string;
  apiBase?: string; // default: '/api/stocks/accounts'
  onClose: () => void;
  onSaved: () => void;
}

export default function AccountSheet({
  mode,
  account,
  owners,
  defaultOwnerId,
  apiBase = '/api/stocks/accounts',
  onClose,
  onSaved,
}: Props) {
  const [ownerId, setOwnerId] = useState<string>(
    account?.owner_id ?? defaultOwnerId ?? owners[0]?.id ?? ''
  );
  const [brokerName, setBrokerName] = useState(account?.broker_name ?? '');
  const [accountNumber, setAccountNumber] = useState(account?.account_number ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setErrorMsg(null);
    if (!ownerId) return setErrorMsg('소유자를 선택해주세요.');
    if (!brokerName.trim()) return setErrorMsg('증권사 이름을 입력해주세요.');

    const payload = {
      owner_id: ownerId,
      broker_name: brokerName.trim(),
      account_number: accountNumber.trim(),
    };

    setSaving(true);
    try {
      const url =
        mode === 'edit' && account
          ? `${apiBase}/${account.id}`
          : apiBase;
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
  }, [ownerId, brokerName, accountNumber, mode, account, apiBase, onSaved, onClose]);

  const handleDelete = useCallback(async () => {
    if (mode !== 'edit' || !account) return;
    if (
      !confirm(
        `"${account.broker_name}" 계좌를 삭제하면 이 계좌의 거래내역도 모두 삭제됩니다. 계속할까요?`
      )
    )
      return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/${account.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }, [mode, account, apiBase, onSaved, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900">
            {mode === 'edit' ? '계좌 수정' : '계좌 추가'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">소유자</label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="" disabled>
                소유자 선택
              </option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">증권사</label>
            <input
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              placeholder="예: 토스증권, 유안타증권"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">계좌번호 (선택)</label>
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="예: 123-456-789"
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
