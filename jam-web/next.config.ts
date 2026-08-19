import type { NextConfig } from "next";
import path from "node:path";

// 프로젝트 루트를 한 번만 계산해 outputFileTracingRoot/turbopack.root에
// 동일하게 사용한다. 두 값이 다르면 Vercel 빌드가 outputFileTracingRoot(자동
// 추론된 /vercel/path0)를 우선 적용하면서 turbopack.root 설정이 무시된다.
const projectRoot = path.join(__dirname);

const nextConfig: NextConfig = {
  // Vercel이 자동 추론하는 값(/vercel/path0)에 맡기지 않고 명시적으로 고정한다.
  // 서버리스 함수 출력 파일 트레이싱(@vercel/nft)이 이 값을 기준으로 동작하므로,
  // turbopack.root와 어긋나면 경고와 함께 트레이싱 결과가 예상과 달라질 수 있다.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    // 개발 머신 홈 디렉토리($HOME/package-lock.json)를 워크스페이스 루트로
    // 잘못 추론해 상대 경로 CSS import(../components/*.css)가 깨지는 문제 방지.
    root: projectRoot,
  },
  // sharp는 플랫폼별 네이티브 바이너리(libvips)를 포함한다. Next.js가 이를
  // webpack/turbopack로 번들링·트레이싱하면 서버리스 함수 번들에 바이너리가
  // 누락되어 Vercel Linux 런타임에서 ERR_DLOPEN_FAILED로 로딩에 실패한다.
  // 번들링하지 않고 Node.js가 직접 require하도록 서버 외부 패키지로 지정한다.
  serverExternalPackages: ['sharp'],
  // outputFileTracingRoot/serverExternalPackages만으로 sharp 네이티브 바이너리가
  // 여전히 누락될 가능성에 대비해, sharp를 사용하는 라우트의 출력 트레이스에
  // 네이티브 바이너리 경로를 명시적으로 포함시킨다(Next.js 공식 트러블슈팅 가이드).
  outputFileTracingIncludes: {
    '/api/admin/upload-image': [
      './node_modules/@img/sharp-linux-x64/**/*',
      './node_modules/@img/sharp-libvips-linux-x64/**/*',
    ],
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
