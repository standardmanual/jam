import type { NextConfig } from "next";
import path from "node:path";

// 프로젝트 루트(로컬 개발 전용 — Vercel 프로덕션에서는 outputFileTracingRoot를
// 건드리지 않는다. 명시적으로 지정했더니 Vercel의 배포 패키징 단계가 자체
// 추론값(/vercel/path0)과 어긋나 ".next/server/pages-manifest.json을 못 찾는"
// 빌드 실패를 냈다 — Vercel의 자동 추론이 이미 올바르므로 손대지 않는 게 맞다).
const projectRoot = path.join(__dirname);

const nextConfig: NextConfig = {
  turbopack: {
    // 개발 머신 홈 디렉토리($HOME/package-lock.json)를 워크스페이스 루트로
    // 잘못 추론해 상대 경로 CSS import(../components/*.css)가 깨지는 문제 방지.
    // Vercel 프로덕션 빌드에서는 outputFileTracingRoot(자동 추론)와 값이 달라
    // "Both ... must have the same value" 경고가 뜨지만, 이건 그냥 경고일 뿐
    // 빌드 실패로 이어지지 않는다 — outputFileTracingRoot를 강제로 맞추려 하면
    // 오히려 배포가 깨진다(위 주석 참고).
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
