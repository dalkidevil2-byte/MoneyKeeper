'use client';

import { useState, useRef } from 'react';
import { ImageIcon, X, ExternalLink, Loader2 } from 'lucide-react';

interface Props {
  value: string;
  onChange: (url: string) => void;
}

// 이미지 압축 (canvas API) - 최대 1200px, 품질 80%
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
    };
    img.src = url;
  });
}

export default function ReceiptAttachment({ value, onChange }: Props) {
  const [mode, setMode] = useState<'url' | 'image'>('url');
  const [uploading, setUploading] = useState(false);
  const [uploadSize, setUploadSize] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isImage = value ? /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(value) || value.includes('/storage/') : false;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadSize(null);

    const compressed = await compressImage(file);
    const sizeBefore = (file.size / 1024).toFixed(0);
    const sizeAfter = (compressed.size / 1024).toFixed(0);
    setUploadSize(`${sizeBefore}KB → ${sizeAfter}KB`);

    const fd = new FormData();
    fd.append('file', new File([compressed], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.url) onChange(data.url);
    setUploading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-gray-400">참고 자료 (선택)</label>
        {!value && (
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button type="button" onClick={() => setMode('url')}
              className={`px-2.5 py-1 text-xs transition-colors ${mode === 'url' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>
              🔗 URL
            </button>
            <button type="button" onClick={() => setMode('image')}
              className={`px-2.5 py-1 text-xs transition-colors ${mode === 'image' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>
              🖼 사진
            </button>
          </div>
        )}
      </div>

      {!value ? (
        mode === 'url' ? (
          <input
            type="url"
            placeholder="https://..."
            onChange={(e) => onChange(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        ) : (
          <div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-4 flex flex-col items-center gap-1.5 text-gray-400 hover:border-indigo-300 hover:text-indigo-400 transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-xs">압축 후 업로드 중...</span>
                  {uploadSize && <span className="text-xs text-indigo-400">{uploadSize}</span>}
                </>
              ) : (
                <>
                  <ImageIcon size={20} />
                  <span className="text-xs">사진 선택 (자동 압축)</span>
                </>
              )}
            </button>
          </div>
        )
      ) : (
        <div className="relative border border-gray-200 rounded-xl overflow-hidden">
          {isImage ? (
            <img src={value} alt="첨부 이미지" className="w-full max-h-40 object-cover cursor-pointer"
              onClick={() => window.open(value, '_blank')} />
          ) : (
            <a href={value} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-indigo-600 hover:bg-indigo-50">
              <ExternalLink size={14} />
              <span className="truncate flex-1">{value}</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/40 text-white rounded-full flex items-center justify-center hover:bg-black/60"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
