import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // 개발 머신 홈 디렉토리($HOME/package-lock.json)를 워크스페이스 루트로
    // 잘못 추론해 상대 경로 CSS import(../components/*.css)가 깨지는 문제 방지.
    root: path.join(__dirname),
  },
  // sharp는 플랫폼별 네이티브 바이너리(libvips)를 포함한다. Next.js가 이를
  // webpack/turbopack로 번들링·트레이싱하면 서버리스 함수 번들에 바이너리가
  // 누락되어 Vercel Linux 런타임에서 ERR_DLOPEN_FAILED로 로딩에 실패한다.
  // 번들링하지 않고 Node.js가 직접 require하도록 서버 외부 패키지로 지정한다.
  serverExternalPackages: ['sharp'],
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
