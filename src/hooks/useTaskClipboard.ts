'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Task } from '@/types';
import { useSaveTask } from './useTasks';

// ─────────────────────────────────────────
// 일정 선택 + 클립보드 (Ctrl+C / Ctrl+V / Delete)
// 모듈 단위 메모리 클립보드 (페이지 이동 후에도 유지)
// ─────────────────────────────────────────
let clipboardTask: Task | null = null;

export function getClipboardTask() {
  return clipboardTask;
}

interface Options {
  /**
   * 현재 보고 있는 컨텍스트 — 붙여넣기 시 어떤 날짜/시간을 사용할지 결정.
   * day 페이지: 현재 표시 중인 날짜.
   * calendar 페이지: 마지막으로 선택한 날짜.
   */
  pasteContext: () => { date: string; time?: string };
  /** 변경 후 호출 (목록 재로딩) */
  onChanged: () => void;
}

export function useTaskClipboard({ pasteContext, onChanged }: Options) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTaskRef = useRef<Task | null>(null);
  const { create, remove } = useSaveTask();

  const select = useCallback((task: Task | null) => {
    selectedTaskRef.current = task;
    setSelectedId(task?.id ?? null);
  }, []);

  // Ctrl+C / Ctrl+V / Delete 처리
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      // 입력 폼 위에서는 OS 기본 동작 유지
      const t = e.target as HTMLElement;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }

      const cmd = e.ctrlKey || e.metaKey;
      const sel = selectedTaskRef.current;

      // Ctrl+C — 선택된 일정 메모리 복사
      if (cmd && (e.key === 'c' || e.key === 'C')) {
        if (!sel) return;
        clipboardTask = sel;
        e.preventDefault();
        // 짧은 토스트 대신 콘솔 (UI 토스트 시스템이 별도로 없음)
        showFlash(`📋 ${sel.title} 복사됨`);
        return;
      }

      // Ctrl+V — 클립보드 task를 현재 컨텍스트에 새 일정으로 복제
      if (cmd && (e.key === 'v' || e.key === 'V')) {
        if (!clipboardTask) return;
        e.preventDefault();
        const ctx = pasteContext();
        const src = clipboardTask;
        try {
          await create({
            household_id: src.household_id,
            type: src.type,
            title: src.title,
            memo: src.memo,
            category_main: src.category_main,
            category_sub: src.category_sub,
            member_id: src.member_id,
            target_member_ids: src.target_member_ids,
            is_fixed: !!ctx.time || src.is_fixed,
            due_date: ctx.date,
            end_date:
              src.type === 'one_time'
                ? ctx.date // 붙여넣기 단일일자 처리
                : null,
            due_time: ctx.time
              ? `${ctx.time}:00`
              : src.is_fixed
                ? src.due_time
                : null,
            end_time: ctx.time
              ? // 길이 유지: 원본 길이만큼 더한 시각
                addLength(ctx.time, src.due_time, src.end_time)
              : src.is_fixed
                ? src.end_time
                : null,
            priority: src.priority,
            recurrence: src.recurrence,
          });
          showFlash(`📌 ${src.title} 붙여넣음`);
          onChanged();
        } catch (err) {
          console.error('[paste]', err);
          alert('붙여넣기 실패');
        }
        return;
      }

      // Delete / Backspace — 선택된 일정 삭제 (soft cancel)
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault();
        if (!confirm(`"${sel.title}" 을(를) 삭제할까요?`)) return;
        try {
          await remove(sel.id);
          select(null);
          onChanged();
          showFlash(`🗑 ${sel.title} 삭제됨`);
        } catch (err) {
          console.error('[delete]', err);
          alert('삭제 실패');
        }
      }

      // Escape — 선택 해제
      if (e.key === 'Escape' && sel) {
        select(null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteContext, onChanged]);

  return { selectedId, select };
}

// "10:00" 시작 + 원본 길이(60분) → "11:00:00"
function addLength(
  startHHmm: string,
  origStart: string | null,
  origEnd: string | null
): string | null {
  const [sh, sm] = startHHmm.split(':').map(Number);
  const startMin = sh * 60 + sm;
  if (!origStart) return null;
  const oS = toMin(origStart);
  const oE = toMin(origEnd ?? origStart);
  const len = Math.max(60, oE - oS);
  const endMin = Math.min(24 * 60 - 1, startMin + len);
  const eh = Math.floor(endMin / 60);
  const em = endMin % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;
}
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// 가벼운 토스트 (DOM 직조작)
function showFlash(msg: string) {
  if (typeof window === 'undefined') return;
  const id = 'task-clip-flash';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText =
      'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);background:#1f2937;color:white;padding:8px 14px;border-radius:9999px;font-size:13px;z-index:60;pointer-events:none;opacity:0;transition:opacity 200ms';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout((el as unknown as { _t?: number })._t);
  (el as unknown as { _t?: number })._t = window.setTimeout(() => {
    if (el) el.style.opacity = '0';
  }, 1400);
}
