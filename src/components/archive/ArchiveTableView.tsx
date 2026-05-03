'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, X as XIcon } from 'lucide-react';
import type { ArchiveEntry, ArchiveProperty } from '@/types';
import PropertyInput, { formatPropertyDisplay } from './PropertyInput';

interface Props {
  entries: ArchiveEntry[];
  schema: ArchiveProperty[];
  onSelectEntry: (id: string) => void;
  onCellSave: (entryId: string, propKey: string, value: unknown) => Promise<void>;
}

/**
 * 엑셀 같은 빽빽한 표 뷰. 각 셀 클릭 → 인라인 편집.
 * 첫 컬럼(제목)은 좌측 sticky.
 */
export default function ArchiveTableView({
  entries,
  schema,
  onSelectEntry,
  onCellSave,
}: Props) {
  const [editingCell, setEditingCell] = useState<{
    entryId: string;
    propKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (schema.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-12">
        속성을 먼저 추가해주세요.
      </div>
    );
  }

  const startEdit = (entryId: string, prop: ArchiveProperty, currentValue: unknown) => {
    setEditingCell({ entryId, propKey: prop.key });
    setEditValue(currentValue);
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue(null);
  };

  const commitEdit = async () => {
    if (!editingCell || saving) return;
    setSaving(true);
    try {
      await onCellSave(editingCell.entryId, editingCell.propKey, editValue);
      setEditingCell(null);
      setEditValue(null);
    } catch (e) {
      console.error('[ArchiveTableView] cell save failed', e);
    } finally {
      setSaving(false);
    }
  };

  const titleProp = schema[0];
  const restProps = schema.slice(1);

  // 텍스트형 셀에서 Enter 로 저장 / Esc 로 취소
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!editingCell) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editingCell]);

  return (
    <div
      ref={wrapRef}
      className="bg-white rounded-2xl border border-gray-100 overflow-x-auto"
    >
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-gray-50 z-10">
          <tr>
            <th
              className="text-left font-bold text-gray-600 px-2 py-2 border-b border-gray-100 sticky left-0 bg-gray-50 z-10 min-w-[140px] max-w-[180px]"
              style={{ boxShadow: '1px 0 0 #f3f4f6' }}
            >
              {titleProp.label}
            </th>
            {restProps.map((p) => (
              <th
                key={p.key}
                className="text-left font-bold text-gray-600 px-2 py-2 border-b border-gray-100 whitespace-nowrap"
              >
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td
                colSpan={schema.length}
                className="text-center text-gray-400 py-8"
              >
                항목이 없어요
              </td>
            </tr>
          ) : (
            entries.map((e, idx) => {
              const data = (e.data ?? {}) as Record<string, unknown>;
              return (
                <tr
                  key={e.id}
                  className={
                    idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                  }
                >
                  {/* 제목 셀 — 클릭하면 항목 상세 열기 (편집 X) */}
                  <td
                    onClick={() => onSelectEntry(e.id)}
                    className="px-2 py-1.5 border-b border-gray-50 sticky left-0 z-[1] font-medium text-gray-900 cursor-pointer truncate max-w-[180px] hover:bg-violet-50"
                    style={{
                      backgroundColor:
                        idx % 2 === 0 ? '#fff' : 'rgba(249,250,251,.5)',
                      boxShadow: '1px 0 0 #f3f4f6',
                    }}
                    title={String(data[titleProp.key] ?? '')}
                  >
                    {String(data[titleProp.key] ?? '(제목 없음)')}
                  </td>
                  {/* 나머지 속성 — 클릭하면 인라인 편집 */}
                  {restProps.map((p) => {
                    const isEditing =
                      editingCell?.entryId === e.id &&
                      editingCell?.propKey === p.key;
                    const v = data[p.key];
                    return (
                      <td
                        key={p.key}
                        className={`px-2 py-1.5 border-b border-gray-50 align-top whitespace-nowrap ${
                          isEditing ? 'bg-violet-50' : 'cursor-pointer hover:bg-violet-50/50'
                        }`}
                        onClick={() => {
                          if (!isEditing) startEdit(e.id, p, v);
                        }}
                      >
                        {isEditing ? (
                          <div
                            className="flex items-start gap-1 min-w-[140px]"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            <div className="flex-1 min-w-0">
                              <PropertyInput
                                prop={p}
                                value={editValue}
                                onChange={setEditValue}
                              />
                            </div>
                            <div className="flex flex-col gap-0.5 pt-0.5">
                              <button
                                onClick={commitEdit}
                                disabled={saving}
                                className="p-1 rounded bg-violet-600 text-white disabled:opacity-50"
                                title="저장 (Enter)"
                              >
                                <Check size={11} />
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="p-1 rounded bg-gray-200 text-gray-600"
                                title="취소 (Esc)"
                              >
                                <XIcon size={11} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="text-gray-700 truncate max-w-[180px]"
                            title={formatPropertyDisplay(p, v)}
                          >
                            {formatPropertyDisplay(p, v) || (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
