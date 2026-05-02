/**
 * 클라이언트 사이드 이미지 압축 (Canvas API).
 * - 이미지가 아닌 파일 / 이미 작은 이미지 / 압축 후 더 커지면 원본 그대로 반환.
 */

export async function compressImageIfPossible(
  file: File,
  options: {
    maxLongEdge?: number;   // 긴 변 최대 (default 1920)
    quality?: number;       // 0~1 (default 0.82)
    maxOriginalKB?: number; // 이 크기 이하면 압축 안함 (default 400KB)
  } = {},
): Promise<File> {
  const maxLongEdge = options.maxLongEdge ?? 1920;
  const quality = options.quality ?? 0.82;
  const maxOriginalKB = options.maxOriginalKB ?? 400;

  // 이미지가 아니면 원본
  if (!file.type.startsWith('image/')) return file;
  // SVG / GIF / HEIC 는 그대로 (브라우저 지원/품질 이슈)
  if (
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif' ||
    file.type === 'image/heic' ||
    file.type === 'image/heif'
  ) {
    return file;
  }
  // 이미 충분히 작으면 압축 스킵
  if (file.size <= maxOriginalKB * 1024) return file;

  try {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    URL.revokeObjectURL(url);

    let { width, height } = { width: img.naturalWidth, height: img.naturalHeight };
    if (!width || !height) return file;

    const longEdge = Math.max(width, height);
    if (longEdge > maxLongEdge) {
      const ratio = maxLongEdge / longEdge;
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) return file;

    // 압축 후 더 크면 원본 사용
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
