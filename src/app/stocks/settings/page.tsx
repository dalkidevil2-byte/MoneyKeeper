'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Pencil, Wallet } from 'lucide-react';
import OwnerSheet, { type Owner } from '@/components/stock/OwnerSheet';
import AccountSheet, { type StockAccountRow } from '@/components/stock/AccountSheet';
import CashFlowSheet from '@/components/stock/CashFlowSheet';

export default function StockSettingsPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [accounts, setAccounts] = useState<StockAccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ownerSheet, setOwnerSheet] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; owner: Owner }
    | null
  >(null);

  const [accountSheet, setAccountSheet] = useState<
    | { mode: 'create'; defaultOwnerId?: string }
    | { mode: 'edit'; account: StockAccountRow }
    | null
  >(null);

  const [cashFlowAccount, setCashFlowAccount] = useState<{
    accountId: string;
    label: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [oRes, aRes] = await Promise.all([
        fetch('/api/stocks/owners'),
        fetch('/api/stocks/accounts'),
      ]);
      if (!oRes.ok || !aRes.ok) throw new Error('불러오기 실패');
      const o = await oRes.json();
      const a = await aRes.json();
      setOwners(o.owners ?? []);
      setAccounts(a.accounts ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // owner별 계좌 수 / 계좌 리스트
  const accountsByOwner = useMemo(() => {
    const map = new Map<string, StockAccountRow[]>();
    for (const a of accounts) {
      const arr = map.get(a.owner_id) ?? [];
      arr.push(a);
      map.set(a.owner_id, arr);
    }
    return map;
  }, [accounts]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">소유자 · 계좌 관리</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-4 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-8">불러오는 중…</div>
        ) : (
          <>
            {/* 소유자 섹션 */}
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-base font-bold text-gray-900">소유자</h2>
                <button
                  onClick={() => setOwnerSheet({ mode: 'create' })}
                  className="text-xs font-semibold text-indigo-600 flex items-center gap-1"
                >
                  <Plus size={14} />
                  추가
                </button>
              </div>

              {owners.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                  <p className="text-sm text-gray-500">등록된 소유자가 없습니다</p>
                  <button
                    onClick={() => setOwnerSheet({ mode: 'create' })}
                    className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                  >
                    첫 소유자 추가
                  </button>
                </div>
              ) : (
                <ul className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                  {owners.map((o) => {
                    const accCount = accountsByOwner.get(o.id)?.length ?? 0;
                    return (
                      <li key={o.id}>
                        <button
                          onClick={() => setOwnerSheet({ mode: 'edit', owner: o })}
                          className="w-full flex items-center justify-between px-5 py-3 text-left active:bg-gray-50"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-9 h-9 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                              {o.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {o.name}
                              </div>
                              <div className="text-[11px] text-gray-400">계좌 {accCount}개</div>
                            </div>
                          </div>
                          <Pencil size={14} className="text-gray-300" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* 계좌 섹션 */}
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-base font-bold text-gray-900">계좌</h2>
                <button
                  disabled={owners.length === 0}
                  onClick={() => setAccountSheet({ mode: 'create' })}
                  className="text-xs font-semibold text-indigo-600 flex items-center gap-1 disabled:opacity-40"
                >
                  <Plus size={14} />
                  추가
                </button>
              </div>

              {owners.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
                  <p className="text-xs text-gray-500">먼저 소유자를 추가해주세요</p>
                </div>
              ) : accounts.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
                  <p className="text-sm text-gray-500">등록된 계좌가 없습니다</p>
                  <button
                    onClick={() => setAccountSheet({ mode: 'create' })}
                    className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                  >
                    첫 계좌 추가
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {owners.map((o) => {
                    const accs = accountsByOwner.get(o.id) ?? [];
                    if (accs.length === 0) return null;
                    return (
                      <div
                        key={o.id}
                        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                      >
                        <div className="px-5 pt-3 pb-2 flex items-baseline justify-between">
                          <span className="text-xs font-bold text-gray-600">{o.name}</span>
                          <button
                            onClick={() =>
                              setAccountSheet({ mode: 'create', defaultOwnerId: o.id })
                            }
                            className="text-[11px] text-indigo-600 font-semibold flex items-center gap-0.5"
                          >
                            <Plus size={11} />
                            계좌 추가
                          </button>
                        </div>
                        <ul className="divide-y divide-gray-50">
                          {accs.map((a) => (
                            <li key={a.id} className="flex items-center px-5 py-3 active:bg-gray-50">
                              <button
                                onClick={() =>
                                  setAccountSheet({ mode: 'edit', account: a })
                                }
                                className="flex-1 flex items-center justify-between text-left min-w-0"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900 truncate">
                                    {a.broker_name}
                                  </div>
                                  <div className="text-[11px] text-gray-400 mt-0.5">
                                    {a.account_number || '계좌번호 없음'}
                                  </div>
                                </div>
                                <Pencil size={14} className="text-gray-300 ml-2" />
                              </button>
                              <button
                                onClick={() =>
                                  setCashFlowAccount({
                                    accountId: a.id,
                                    label: `${o.name} · ${a.broker_name}`,
                                  })
                                }
                                className="ml-3 p-2 rounded-lg bg-indigo-50 text-indigo-600 active:bg-indigo-100"
                                title="시드머니"
                              >
                                <Wallet size={16} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {ownerSheet && (
        <OwnerSheet
          mode={ownerSheet.mode}
          owner={ownerSheet.mode === 'edit' ? ownerSheet.owner : undefined}
          onClose={() => setOwnerSheet(null)}
          onSaved={load}
        />
      )}
      {accountSheet && (
        <AccountSheet
          mode={accountSheet.mode}
          account={accountSheet.mode === 'edit' ? accountSheet.account : undefined}
          defaultOwnerId={
            accountSheet.mode === 'create' ? accountSheet.defaultOwnerId : undefined
          }
          owners={owners}
          onClose={() => setAccountSheet(null)}
          onSaved={load}
        />
      )}
      {cashFlowAccount && (
        <CashFlowSheet
          accountId={cashFlowAccount.accountId}
          accountLabel={cashFlowAccount.label}
          onClose={() => setCashFlowAccount(null)}
        />
      )}
    </div>
  );
}
