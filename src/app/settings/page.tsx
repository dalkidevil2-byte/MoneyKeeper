'use client';

import { useState } from 'react';
import { ArrowLeft, Plus, Wallet, CreditCard, PiggyBank, Users, Check, Pencil, Tag, Trash2, RepeatIcon } from 'lucide-react';
import Link from 'next/link';
import { useAccounts, usePaymentMethods, useBudgets, useMembers, useCustomCategories, useFixedExpenseTemplates } from '@/hooks/useAccounts';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';
import { formatAmount } from '@/lib/parser';
import dayjs from 'dayjs';

export default function SettingsPage() {
  const { accounts, loading: accLoading } = useAccounts();
  const { paymentMethods, loading: pmLoading } = usePaymentMethods();
  const { budgets, loading: budgetLoading, refetch: refetchBudgets } = useBudgets();
  const { members, loading: membersLoading, refetch: refetchMembers } = useMembers();
  const { categories: customCategories, loading: catLoading, refetch: refetchCategories } = useCustomCategories();
  const { templates: fixedTemplates, loading: ftLoading, refetch: refetchFT } = useFixedExpenseTemplates();

  // 멤버 편집/추가 상태
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberColor, setNewMemberColor] = useState('#6366f1');

  const MEMBER_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

  const handleSaveMemberName = async (id: string, color: string) => {
    if (!editingName.trim()) return;
    await fetch(`/api/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editingName.trim(), color }),
    });
    setEditingMemberId(null);
    refetchMembers();
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim()) return;
    await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newMemberName.trim(), color: newMemberColor }),
    });
    setNewMemberName('');
    setNewMemberColor('#6366f1');
    setAddingMember(false);
    refetchMembers();
  };

  // 카테고리 관리 상태
  const [catNewMain, setCatNewMain] = useState('');
  const [catNewSub, setCatNewSub] = useState('');
  const [catSelectedMain, setCatSelectedMain] = useState('');
  const [addingCatMain, setAddingCatMain] = useState(false);
  const [addingCatSub, setAddingCatSub] = useState(false);
  const [catSaving, setCatSaving] = useState(false);

  const handleAddCatMain = async () => {
    if (!catNewMain.trim()) return;
    setCatSaving(true);
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_main: catNewMain.trim(), category_sub: '' }),
    });
    setCatNewMain('');
    setAddingCatMain(false);
    setCatSaving(false);
    refetchCategories();
  };

  const handleAddCatSub = async () => {
    if (!catSelectedMain || !catNewSub.trim()) return;
    setCatSaving(true);
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_main: catSelectedMain, category_sub: catNewSub.trim() }),
    });
    setCatNewSub('');
    setAddingCatSub(false);
    setCatSaving(false);
    refetchCategories();
  };

  const handleDeleteCat = async (id: string) => {
    await fetch(`/api/custom-categories?id=${id}`, { method: 'DELETE' });
    refetchCategories();
  };

  // 커스텀 대분류 목록 (sub가 없는 것 = 대분류 전용)
  const customMainOnlyList = customCategories.filter((c) => !c.category_sub);
  // 커스텀 소분류 목록
  const customSubList = customCategories.filter((c) => !!c.category_sub);

  // 예산 추가 폼에서 사용할 전체 카테고리 (기본 + 커스텀 대분류)
  const allCategoryOptions = [
    ...CATEGORY_MAIN_OPTIONS.filter((c) => c !== '수입'),
    ...customMainOnlyList.map((c) => c.category_main).filter((m) => !(CATEGORY_MAIN_OPTIONS as readonly string[]).includes(m)),
  ];

  // 고정지출 템플릿 상태
  const [addingFT, setAddingFT] = useState(false);
  const [ftForm, setFTForm] = useState({
    name: '', amount: '', due_day: '1',
    type: 'fixed_expense',
    category_main: '', category_sub: '',
    payment_method_id: '',
    account_from_id: '', account_to_id: '',
  });

  const handleAddFT = async () => {
    if (!ftForm.name || !ftForm.amount) return;
    await fetch('/api/fixed-expense-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ftForm.name,
        amount: parseInt(ftForm.amount),
        due_day: parseInt(ftForm.due_day),
        type: ftForm.type,
        category_main: ftForm.category_main,
        category_sub: ftForm.category_sub,
        payment_method_id: ftForm.payment_method_id || null,
        account_from_id: ftForm.account_from_id || null,
        account_to_id: ftForm.account_to_id || null,
      }),
    });
    setFTForm({ name: '', amount: '', due_day: '1', type: 'fixed_expense', category_main: '', category_sub: '', payment_method_id: '', account_from_id: '', account_to_id: '' });
    setAddingFT(false);
    refetchFT();
  };

  const handleDeleteFT = async (id: string) => {
    await fetch(`/api/fixed-expense-templates?id=${id}`, { method: 'DELETE' });
    refetchFT();
  };

  const [addingAccount, setAddingAccount] = useState(false);
  const [addingPM, setAddingPM] = useState(false);
  const [addingBudget, setAddingBudget] = useState(false);

  const [accountForm, setAccountForm] = useState({ name: '', type: 'bank', balance: '', member_id: '' });
  const [pmForm, setPMForm] = useState({ name: '', type: 'debit_card', linked_account_id: '', is_budget_card: false, member_id: '' });
  const [budgetForm, setBudgetForm] = useState({
    name: '',
    amount: '',
    payment_method_id: '',
    is_total: false,
    category_main: '',
  });

  // 숫자만 추출해서 저장
  const numOnly = (v: string) => v.replace(/[^0-9]/g, '');

  // 저장된 숫자를 콤마 표시용으로 변환
  const withComma = (v: string) => {
    if (!v) return '';
    return Number(v).toLocaleString('ko-KR');
  };

  const handleAddAccount = async () => {
    if (!accountForm.name) return;
    await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: accountForm.name,
        type: accountForm.type,
        balance: parseInt(accountForm.balance) || 0,
        is_budget_account: accountForm.type === 'bank',
        member_id: accountForm.member_id || null,
      }),
    });
    setAccountForm({ name: '', type: 'bank', balance: '', member_id: '' });
    setAddingAccount(false);
    window.location.reload();
  };

  const handleAddPM = async () => {
    if (!pmForm.name) return;
    await fetch('/api/payment-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...pmForm, member_id: pmForm.member_id || null }),
    });
    setPMForm({ name: '', type: 'debit_card', linked_account_id: '', is_budget_card: false, member_id: '' });
    setAddingPM(false);
    window.location.reload();
  };

  const handleAddBudget = async () => {
    if (!budgetForm.amount) return;
    const today = dayjs();
    const name = budgetForm.is_total
      ? (budgetForm.name || '전체 예산')
      : (budgetForm.name || budgetForm.category_main || '카테고리 예산');
    await fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        amount: parseInt(budgetForm.amount),
        payment_method_id: budgetForm.payment_method_id || null,
        is_total: budgetForm.is_total,
        category_main: budgetForm.is_total ? '' : budgetForm.category_main,
        start_date: today.startOf('month').format('YYYY-MM-DD'),
        end_date: today.endOf('month').format('YYYY-MM-DD'),
      }),
    });
    setBudgetForm({ name: '', amount: '', payment_method_id: '', is_total: false, category_main: '' });
    setAddingBudget(false);
    refetchBudgets();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900">설정</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">

        {/* 구성원 관리 */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Users size={16} className="text-indigo-600" /> 구성원
            </h2>
            <button onClick={() => setAddingMember(!addingMember)} className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
              <Plus size={14} /> 추가
            </button>
          </div>

          {addingMember && (
            <div className="bg-indigo-50 rounded-2xl p-4 mb-3 space-y-3">
              <input
                type="text"
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
                placeholder="이름 입력 (예: 민준, 수연)"
                autoFocus
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div>
                <p className="text-xs text-gray-500 mb-2">색상 선택</p>
                <div className="flex gap-2 flex-wrap">
                  {MEMBER_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewMemberColor(c)}
                      className="w-8 h-8 rounded-full transition-transform"
                      style={{
                        backgroundColor: c,
                        transform: newMemberColor === c ? 'scale(1.2)' : 'scale(1)',
                        outline: newMemberColor === c ? `3px solid ${c}` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>
              {newMemberName && (
                <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2">
                  <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: newMemberColor }}>
                    {newMemberName.slice(0, 1)}
                  </span>
                  <span className="text-sm text-gray-700">{newMemberName}</span>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setAddingMember(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
                <button onClick={handleAddMember} disabled={!newMemberName.trim()} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">추가</button>
              </div>
            </div>
          )}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {membersLoading ? (
              <div className="p-6 flex justify-center"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : members.map((member, idx) => (
              <div key={member.id} className={`px-4 py-3.5 ${idx < members.length - 1 ? 'border-b border-gray-50' : ''}`}>
                {editingMemberId === member.id ? (
                  <div className="flex items-center gap-2">
                    {/* 색상 선택 */}
                    <div className="flex gap-1.5 flex-wrap">
                      {MEMBER_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => {/* color change handled on save */}}
                          className="w-6 h-6 rounded-full border-2 flex-shrink-0"
                          style={{
                            backgroundColor: c,
                            borderColor: c === (editingName ? member.color : member.color) ? 'white' : 'transparent',
                            outline: member.color === c ? `2px solid ${c}` : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name.slice(0, 1)}
                  </div>
                  {editingMemberId === member.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveMemberName(member.id, member.color)}
                      autoFocus
                      className="flex-1 border border-indigo-300 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      placeholder="이름 입력"
                    />
                  ) : (
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{member.name}</p>
                    </div>
                  )}
                  {editingMemberId === member.id ? (
                    <button
                      onClick={() => handleSaveMemberName(member.id, member.color)}
                      className="p-2 bg-indigo-600 text-white rounded-xl"
                    >
                      <Check size={15} />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setEditingMemberId(member.id); setEditingName(member.name); }}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 계좌 관리 */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Wallet size={16} className="text-indigo-600" /> 계좌 / 자산
            </h2>
            <button onClick={() => setAddingAccount(!addingAccount)} className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
              <Plus size={14} /> 추가
            </button>
          </div>

          {addingAccount && (
            <div className="bg-indigo-50 rounded-2xl p-4 mb-3 space-y-3">
              <input
                type="text"
                value={accountForm.name}
                onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="계좌명 (예: 생활비통장)"
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={accountForm.type}
                  onChange={(e) => setAccountForm((f) => ({ ...f, type: e.target.value }))}
                  className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                >
                  <option value="bank">은행</option>
                  <option value="cash">현금</option>
                  <option value="easy_pay_balance">간편결제</option>
                  <option value="investment">투자</option>
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  value={accountForm.balance}
                  onChange={(e) => setAccountForm((f) => ({ ...f, balance: numOnly(e.target.value) }))}
                  placeholder="현재 잔액"
                  className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              {accountForm.balance && (
                <p className="text-xs text-indigo-500 px-1">= {withComma(accountForm.balance)}원</p>
              )}
              <select
                value={accountForm.member_id}
                onChange={(e) => setAccountForm((f) => ({ ...f, member_id: e.target.value }))}
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
              >
                <option value="">구성원 선택 (공용이면 비워두기)</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={() => setAddingAccount(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
                <button onClick={handleAddAccount} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium">저장</button>
              </div>
            </div>
          )}

          {accLoading ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">계좌를 추가해주세요</div>
          ) : (
            <div className="space-y-2">
              {/* 구성원별 그룹 */}
              {[...members, null].map((member) => {
                const group = accounts.filter((a) => (member ? a.member_id === member.id : !a.member_id));
                if (group.length === 0) return null;
                return (
                  <div key={member?.id ?? 'shared'}>
                    <div className="flex items-center gap-2 px-1 mb-1">
                      {member ? (
                        <>
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: member.color }}>{member.name.slice(0, 1)}</span>
                          <span className="text-xs font-medium text-gray-500">{member.name}</span>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-gray-400">공용</span>
                      )}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      {group.map((acc, idx) => (
                        <div key={acc.id} className={`flex items-center justify-between px-4 py-3.5 ${idx < group.length - 1 ? 'border-b border-gray-50' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                              <Wallet size={15} className="text-indigo-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{acc.name}</p>
                              <p className="text-xs text-gray-400">{acc.type === 'bank' ? '은행' : acc.type === 'cash' ? '현금' : acc.type === 'easy_pay_balance' ? '간편결제' : acc.type}</p>
                            </div>
                          </div>
                          <p className="font-semibold text-gray-800 text-sm">{formatAmount(acc.balance)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 결제수단 관리 */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <CreditCard size={16} className="text-indigo-600" /> 결제수단
            </h2>
            <button onClick={() => setAddingPM(!addingPM)} className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
              <Plus size={14} /> 추가
            </button>
          </div>

          {addingPM && (
            <div className="bg-indigo-50 rounded-2xl p-4 mb-3 space-y-3">
              <input
                type="text"
                value={pmForm.name}
                onChange={(e) => setPMForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="카드명 (예: 신한 생활비 체크카드)"
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={pmForm.type} onChange={(e) => setPMForm((f) => ({ ...f, type: e.target.value }))} className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
                  <option value="debit_card">체크카드</option>
                  <option value="credit_card">신용카드</option>
                  <option value="easy_pay">간편결제</option>
                  <option value="cash">현금</option>
                  <option value="bank_transfer">계좌이체</option>
                </select>
                <select value={pmForm.linked_account_id} onChange={(e) => setPMForm((f) => ({ ...f, linked_account_id: e.target.value }))} className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
                  <option value="">연결 계좌 선택</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <select
                value={pmForm.member_id}
                onChange={(e) => setPMForm((f) => ({ ...f, member_id: e.target.value }))}
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
              >
                <option value="">구성원 선택 (공용이면 비워두기)</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={pmForm.is_budget_card} onChange={(e) => setPMForm((f) => ({ ...f, is_budget_card: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                생활비 전용 카드로 설정
              </label>
              <div className="flex gap-2">
                <button onClick={() => setAddingPM(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
                <button onClick={handleAddPM} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium">저장</button>
              </div>
            </div>
          )}

          {pmLoading ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 flex justify-center">
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : paymentMethods.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-sm text-gray-400">결제수단을 추가해주세요</div>
          ) : (
            <div className="space-y-2">
              {[...members, null].map((member) => {
                const group = paymentMethods.filter((pm) => (member ? pm.member_id === member.id : !pm.member_id));
                if (group.length === 0) return null;
                return (
                  <div key={member?.id ?? 'shared'}>
                    <div className="flex items-center gap-2 px-1 mb-1">
                      {member ? (
                        <>
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: member.color }}>{member.name.slice(0, 1)}</span>
                          <span className="text-xs font-medium text-gray-500">{member.name}</span>
                        </>
                      ) : (
                        <span className="text-xs font-medium text-gray-400">공용</span>
                      )}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      {group.map((pm, idx) => (
                        <div key={pm.id} className={`flex items-center justify-between px-4 py-3.5 ${idx < group.length - 1 ? 'border-b border-gray-50' : ''}`}>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
                              <CreditCard size={15} className="text-purple-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-800">{pm.name}</p>
                              <p className="text-xs text-gray-400">
                                {pm.type === 'debit_card' ? '체크카드' : pm.type === 'credit_card' ? '신용카드' : pm.type === 'easy_pay' ? '간편결제' : pm.type}
                                {(pm as any).linked_account?.name && ` → ${(pm as any).linked_account.name}`}
                              </p>
                            </div>
                          </div>
                          {pm.is_budget_card && <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">생활비</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 예산 관리 */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <PiggyBank size={16} className="text-indigo-600" /> 예산 설정
            </h2>
            <button onClick={() => setAddingBudget(!addingBudget)} className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
              <Plus size={14} /> 이번 달 예산 추가
            </button>
          </div>

          {addingBudget && (
            <div className="bg-indigo-50 rounded-2xl p-4 mb-3 space-y-3">

              {/* 예산 유형 토글 */}
              <div className="flex rounded-xl overflow-hidden border border-indigo-200 bg-white">
                <button
                  onClick={() => setBudgetForm((f) => ({ ...f, is_total: true, category_main: '' }))}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${budgetForm.is_total ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
                >
                  🎯 전체 예산
                </button>
                <button
                  onClick={() => setBudgetForm((f) => ({ ...f, is_total: false }))}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${!budgetForm.is_total ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
                >
                  📂 카테고리별
                </button>
              </div>

              {/* 카테고리 선택 (카테고리별일 때만) */}
              {!budgetForm.is_total && (
                <select
                  value={budgetForm.category_main}
                  onChange={(e) => setBudgetForm((f) => ({ ...f, category_main: e.target.value }))}
                  className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                >
                  <option value="">카테고리 선택</option>
                  {allCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}

              {/* 예산 이름 (선택사항) */}
              <input
                type="text"
                value={budgetForm.name}
                onChange={(e) => setBudgetForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={budgetForm.is_total ? '이름 (기본: 전체 예산)' : `이름 (기본: ${budgetForm.category_main || '카테고리 예산'})`}
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
              />

              {/* 금액 */}
              <input
                type="text"
                inputMode="numeric"
                value={budgetForm.amount}
                onChange={(e) => setBudgetForm((f) => ({ ...f, amount: numOnly(e.target.value) }))}
                placeholder="예산 금액 (예: 500000)"
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {budgetForm.amount && (
                <p className="text-xs text-indigo-600 font-medium px-1">= {withComma(budgetForm.amount)}원</p>
              )}

              <div className="flex gap-2">
                <button onClick={() => setAddingBudget(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
                <button onClick={handleAddBudget} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium">저장</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {budgetLoading ? (
              <div className="p-8 flex justify-center"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : budgets.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">아직 예산이 없어요</div>
            ) : budgets.map((budget, idx) => (
              <div key={budget.id} className={`px-4 py-3.5 ${idx < budgets.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    {budget.is_total ? (
                      <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">전체</span>
                    ) : budget.category_main ? (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{budget.category_main}</span>
                    ) : null}
                    <p className="text-sm font-medium text-gray-800">{budget.name}</p>
                  </div>
                  <p className="text-sm font-bold text-indigo-600">{formatAmount(budget.amount)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${budget.usage_rate >= 100 ? 'bg-rose-500' : budget.usage_rate >= 90 ? 'bg-orange-400' : budget.usage_rate >= 80 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                      style={{ width: `${Math.min(budget.usage_rate, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{budget.usage_rate}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 고정지출 관리 */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <RepeatIcon size={16} className="text-indigo-600" /> 고정지출 항목
            </h2>
            <button onClick={() => setAddingFT(!addingFT)} className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
              <Plus size={14} /> 추가
            </button>
          </div>

          {addingFT && (
            <div className="bg-indigo-50 rounded-2xl p-4 mb-3 space-y-3">
              {/* 유형 선택 */}
              <div className="flex rounded-xl overflow-hidden border border-indigo-200 bg-white">
                {(['fixed_expense', 'transfer', 'income'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFTForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${ftForm.type === t ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
                  >
                    {t === 'fixed_expense' ? '💸 고정지출' : t === 'transfer' ? '🔄 원금상환' : '💰 이자수입'}
                  </button>
                ))}
              </div>

              {/* 항목명 + 날짜 */}
              <input
                type="text"
                value={ftForm.name}
                onChange={(e) => setFTForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={ftForm.type === 'transfer' ? '항목명 (예: 홍길동 원금상환)' : ftForm.type === 'income' ? '항목명 (예: 홍길동 이자수입)' : '항목명 (예: 월세, 보험료)'}
                autoFocus
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={ftForm.amount}
                  onChange={(e) => setFTForm((f) => ({ ...f, amount: numOnly(e.target.value) }))}
                  placeholder="금액"
                  className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <div className="flex items-center gap-2 border border-indigo-200 rounded-xl px-3 py-2.5 bg-white">
                  <span className="text-sm text-gray-500">매월</span>
                  <input
                    type="number" min={1} max={31}
                    value={ftForm.due_day}
                    onChange={(e) => setFTForm((f) => ({ ...f, due_day: e.target.value }))}
                    className="w-10 text-sm font-bold text-indigo-600 outline-none text-center"
                  />
                  <span className="text-sm text-gray-500">일</span>
                </div>
              </div>
              {ftForm.amount && <p className="text-xs text-indigo-600 px-1">= {withComma(ftForm.amount)}원</p>}

              {/* 고정지출 전용: 카테고리 + 결제수단 */}
              {ftForm.type === 'fixed_expense' && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={ftForm.category_main} onChange={(e) => setFTForm((f) => ({ ...f, category_main: e.target.value }))} className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
                    <option value="">카테고리</option>
                    {allCategoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={ftForm.payment_method_id} onChange={(e) => setFTForm((f) => ({ ...f, payment_method_id: e.target.value }))} className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
                    <option value="">결제수단</option>
                    {paymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                  </select>
                </div>
              )}

              {/* 원금상환: 출금계좌(대여금) → 입금계좌(내통장) */}
              {ftForm.type === 'transfer' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">출금 계좌 (대여금 계좌)</label>
                    <select value={ftForm.account_from_id} onChange={(e) => setFTForm((f) => ({ ...f, account_from_id: e.target.value }))} className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
                      <option value="">선택</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">입금 계좌 (내 통장)</label>
                    <select value={ftForm.account_to_id} onChange={(e) => setFTForm((f) => ({ ...f, account_to_id: e.target.value }))} className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
                      <option value="">선택</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* 이자수입: 입금 계좌 */}
              {ftForm.type === 'income' && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">입금 계좌</label>
                  <select value={ftForm.account_to_id} onChange={(e) => setFTForm((f) => ({ ...f, account_to_id: e.target.value }))} className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none">
                    <option value="">선택</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setAddingFT(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
                <button onClick={handleAddFT} disabled={!ftForm.name || !ftForm.amount} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">저장</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {ftLoading ? (
              <div className="p-6 flex justify-center"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : fixedTemplates.length === 0 ? (
              <div className="p-5 text-center text-sm text-gray-400">
                <p>등록된 고정지출이 없어요</p>
                <p className="text-xs mt-1 text-gray-300">월세, 보험료, 구독료 등을 등록해두면<br/>매월 등록 여부를 알려드려요</p>
              </div>
            ) : fixedTemplates.map((ft, idx) => (
              <div key={ft.id} className={`flex items-center justify-between px-4 py-3.5 ${idx < fixedTemplates.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${
                    ft.type === 'transfer' ? 'bg-blue-50' : ft.type === 'income' ? 'bg-emerald-50' : 'bg-indigo-50'
                  }`}>
                    {ft.type === 'transfer' ? '🔄' : ft.type === 'income' ? '💰' : '💸'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{ft.name}</p>
                    <p className="text-xs text-gray-400">
                      매월 {ft.due_day}일
                      {ft.type === 'transfer' && ft.account_from && ` · ${ft.account_from.name} → ${ft.account_to?.name ?? ''}`}
                      {ft.type === 'income' && ft.account_to && ` · ${ft.account_to.name}`}
                      {ft.type === 'fixed_expense' && ft.category_main && ` · ${ft.category_main}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${ft.type === 'income' ? 'text-emerald-600' : ft.type === 'transfer' ? 'text-blue-600' : 'text-indigo-600'}`}>
                    {formatAmount(ft.amount)}
                  </span>
                  <button onClick={() => handleDeleteFT(ft.id)} className="p-1.5 text-gray-300 hover:text-rose-400 rounded-lg hover:bg-rose-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 px-1 mt-1.5">등록일이 되면 홈 화면에서 미등록 알림을 드려요</p>
        </section>

        {/* 카테고리 관리 */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Tag size={16} className="text-indigo-600" /> 카테고리 관리
            </h2>
            <div className="flex gap-2">
              <button onClick={() => { setAddingCatSub(!addingCatSub); setAddingCatMain(false); }} className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                <Plus size={14} /> 소분류
              </button>
              <button onClick={() => { setAddingCatMain(!addingCatMain); setAddingCatSub(false); }} className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                <Plus size={14} /> 대분류
              </button>
            </div>
          </div>

          {/* 대분류 추가 */}
          {addingCatMain && (
            <div className="bg-indigo-50 rounded-2xl p-4 mb-3 space-y-3">
              <p className="text-xs text-indigo-700 font-medium">새 대분류 추가</p>
              <input
                type="text"
                value={catNewMain}
                onChange={(e) => setCatNewMain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCatMain()}
                placeholder="대분류명 (예: 반려동물)"
                autoFocus
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="flex gap-2">
                <button onClick={() => setAddingCatMain(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
                <button onClick={handleAddCatMain} disabled={!catNewMain.trim() || catSaving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">추가</button>
              </div>
            </div>
          )}

          {/* 소분류 추가 */}
          {addingCatSub && (
            <div className="bg-indigo-50 rounded-2xl p-4 mb-3 space-y-3">
              <p className="text-xs text-indigo-700 font-medium">소분류 추가</p>
              <select
                value={catSelectedMain}
                onChange={(e) => setCatSelectedMain(e.target.value)}
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
              >
                <option value="">대분류 선택</option>
                {([...CATEGORY_MAIN_OPTIONS] as string[]).map((m) => <option key={m} value={m}>{m}</option>)}
                {customMainOnlyList.filter((c) => !(CATEGORY_MAIN_OPTIONS as readonly string[]).includes(c.category_main as any)).map((c) => (
                  <option key={c.id} value={c.category_main}>{c.category_main}</option>
                ))}
              </select>
              <input
                type="text"
                value={catNewSub}
                onChange={(e) => setCatNewSub(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCatSub()}
                placeholder="소분류명 (예: 사료, 병원비)"
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="flex gap-2">
                <button onClick={() => setAddingCatSub(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
                <button onClick={handleAddCatSub} disabled={!catSelectedMain || !catNewSub.trim() || catSaving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">추가</button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {catLoading ? (
              <div className="p-6 flex justify-center"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
            ) : customCategories.length === 0 ? (
              <div className="p-5 text-center text-sm text-gray-400">
                <p>추가된 커스텀 카테고리가 없어요</p>
                <p className="text-xs mt-1 text-gray-300">기본 카테고리 외에 나만의 항목을 추가해보세요</p>
              </div>
            ) : (
              <div>
                {/* 커스텀 대분류 */}
                {customMainOnlyList.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">대분류</p>
                    {customMainOnlyList.map((cat, idx) => (
                      <div key={cat.id} className={`flex items-center justify-between px-4 py-3 ${idx < customMainOnlyList.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-indigo-400" />
                          <span className="text-sm font-medium text-gray-800">{cat.category_main}</span>
                        </div>
                        <button onClick={() => handleDeleteCat(cat.id)} className="p-1.5 text-gray-300 hover:text-rose-400 rounded-lg hover:bg-rose-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* 커스텀 소분류 */}
                {customSubList.length > 0 && (
                  <div className={customMainOnlyList.length > 0 ? 'border-t border-gray-100' : ''}>
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">소분류</p>
                    {customSubList.map((cat, idx) => (
                      <div key={cat.id} className={`flex items-center justify-between px-4 py-3 ${idx < customSubList.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{cat.category_main}</span>
                          <span className="text-sm text-gray-700">{cat.category_sub}</span>
                        </div>
                        <button onClick={() => handleDeleteCat(cat.id)} className="p-1.5 text-gray-300 hover:text-rose-400 rounded-lg hover:bg-rose-50 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 px-1 mt-1.5">기본 카테고리는 변경할 수 없어요</p>
        </section>

        {/* Notion 연동 안내 */}
        <section>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="font-semibold text-gray-800 mb-1">🔗 Notion 연동</h2>
            <p className="text-xs text-gray-500 leading-5">
              거래 저장 시 자동으로 Notion 데이터베이스에 동기화됩니다.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
