'use client';

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import type { ArchiveEntry, ArchiveProperty } from '@/types';
import { formatPropertyDisplay } from './PropertyInput';

interface Props {
  entries: ArchiveEntry[];
  schema: ArchiveProperty[];
  groupKey: string; // 어느 select 속성을 칼럼 기준으로 쓸지
  onSelectEntry: (id: string) => void;
  onCreateInColumn: (groupKey: string, value: string) => void;
}

const UNSET_KEY = '__unset__';
const UNSET_LABEL = '(미설정)';

export default function ArchiveBoardView({
  entries,
  schema,
  groupKey,
  onSelectEntry,
  onCreateInColumn,
}: Props) {
  const groupProp = schema.find((p) => p.key === groupKey);
  const titleProp = schema[0];
  const titleKey = titleProp?.key;

  // 칼럼 정의: select 옵션 + (미설정)
  const columns = useMemo(() => {
    const opts = (groupProp?.options ?? []).map((o) => ({
      key: o,
      label: o,
    }));
    return [...opts, { key: UNSET_KEY, label: UNSET_LABEL }];
  }, [groupProp]);

  // 항목을 칼럼별로 분배
  const grouped = useMemo(() => {
    const map = new Map<string, ArchiveEntry[]>();
    for (const c of columns) map.set(c.key, []);
    for (const e of entries) {
      const data = (e.data ?? {}) as Record<string, unknown>;
      const v = data[groupKey];
      let key: string;
      if (v == null || v === '') {
        key = UNSET_KEY;
      } else if (Array.isArray(v)) {
        // multiselect — 첫 값을 기준으로 (보드 뷰는 단일 select 가 맞음)
        key = v[0] ? String(v[0]) : UNSET_KEY;
      } else {
        key = String(v);
      }
      if (!map.has(key)) map.set(key, []); // 옵션에 없는 값(예전에 만들고 옵션 삭제된 것)도 표시
      map.get(key)!.push(e);
    }
    return map;
  }, [entries, columns, groupKey]);

  // 옵션에 없는 미지의 값들도 추가 칼럼으로
  const orphanKeys = Array.from(grouped.keys()).filter(
    (k) => !columns.some((c) => c.key === k),
  );
  const allColumns = [
    ...columns,
    ...orphanKeys.map((k) => ({ key: k, label: k })),
  ];

  // 표시할 보조 속성 (제목 + 그룹 키 제외, 최대 2개)
  const previewProps = schema
    .filter((p) => p.key !== titleKey && p.key !== groupKey)
    .slice(0, 2);

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
      {allColumns.map((col) => {
        const list = grouped.get(col.key) ?? [];
        const isUnset = col.key === UNSET_KEY;
        return (
          <div
            key={col.key}
            className="flex-shrink-0 w-[260px] bg-gray-50 rounded-2xl p-2"
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-xs font-bold ${
                    isUnset ? 'text-gray-400' : 'text-gray-700'
                  }`}
                >
                  {col.label}
                </span>
                <span className="text-[10px] bg-white text-gray-500 px-1.5 py-0.5 rounded-full">
                  {list.length}
                </span>
              </div>
              {!isUnset && (
                <button
                  onClick={() => onCreateInColumn(groupKey, col.key)}
                  className="p-1 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50"
                  title={`${col.label} 칼럼에 새 항목`}
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-0.5">
              {list.length === 0 ? (
                <button
                  onClick={() =>
                    !isUnset && onCreateInColumn(groupKey, col.key)
                  }
                  className="w-full text-[11px] text-gray-300 py-3 border-2 border-dashed border-gray-200 rounded-xl hover:bg-white"
                  disabled={isUnset}
                >
                  {isUnset ? '비어있음' : '+ 추가'}
                </button>
              ) : (
                list.map((e) => {
                  const data = (e.data ?? {}) as Record<string, unknown>;
                  const title = titleKey
                    ? String(data[titleKey] ?? '(제목 없음)')
                    : '(제목 없음)';
                  return (
                    <button
                      key={e.id}
                      onClick={() => onSelectEntry(e.id)}
                      className="w-full text-left bg-white rounded-xl p-2.5 shadow-sm border border-gray-100 hover:border-violet-200 active:bg-violet-50/50"
                    >
                      <div className="text-xs font-bold text-gray-900 leading-tight line-clamp-2 mb-1">
                        {title}
                      </div>
                      {previewProps.map((p) => {
                        const v = data[p.key];
                        if (v == null || v === '') return null;
                        const display = formatPropertyDisplay(p, v);
                        if (!display) return null;
                        return (
                          <div
                            key={p.key}
                            className="text-[10px] text-gray-500 mt-0.5 truncate"
                          >
                            <span className="text-gray-400">{p.label}:</span>{' '}
                            {display}
                          </div>
                        );
                      })}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
