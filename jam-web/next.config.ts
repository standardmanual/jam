import type { NextConfig } from "next";
import path from "node:path";
// 원격 이미지 허용 패턴의 단일 소스. 서비스 코드(SafeImage)가 같은 배열로 "next/image에
// 넘겨도 되는 src인지"를 판정한다 — 두 곳을 손으로 맞추면 어긋나는 순간 화면이 500이 된다
// (20260824_004).
import { IMAGE_REMOTE_PATTERNS } from "./src/lib/imageSrc";

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
    // 패턴 정의는 src/lib/imageSrc.ts에 있다 (위 import 주석 참조)
    remotePatterns: IMAGE_REMOTE_PATTERNS,
  },
  // 20260821_002: "아이템북" → "컬렉션" 공개 URL 전환. 기존에 공유된 /itembooks 링크를
  // 보호하기 위해 301(permanent) 리다이렉트를 유지한다. 관리자 화면(/admin/itembooks)과
  // API 라우트(/api/itembooks, /api/users/[username]/itembooks)는 이번 전환 대상이 아니므로
  // 두 번째 규칙에서 :username이 admin/api를 매칭하지 않도록 음의 전방탐색으로 제외한다.
  async redirects() {
    return [
      {
        source: '/itembooks/:path*',
        destination: '/collections/:path*',
        permanent: true,
      },
      {
        source: '/:username((?!admin/|api/)[^/]+)/itembooks/:path*',
        destination: '/:username/collections/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
