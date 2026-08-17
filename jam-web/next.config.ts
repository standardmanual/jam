import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // 개발 머신 홈 디렉토리($HOME/package-lock.json)를 워크스페이스 루트로
    // 잘못 추론해 상대 경로 CSS import(../components/*.css)가 깨지는 문제 방지.
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      {
        // Supabase Storage — 배지/아이템/북 이미지
        protocol: 'https',
        hostname: 'ceehnkzdbecxwzxrhhns.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        // Google OAuth 프로필 아바타
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
