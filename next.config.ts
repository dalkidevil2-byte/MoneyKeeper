import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel 배포 안정성 — TS/ESLint 오류가 빌드를 막지 않도록
  // (로컬에서 `tsc --noEmit`으로 별도 체크)
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
