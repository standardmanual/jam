/**
 * 이미지 src 판별 유틸 (20260824_004).
 *
 * `next/image`는 `next.config.ts`의 `images.remotePatterns`에 매칭되지 않는 src를 받으면
 * **렌더 시점에 throw** 한다. 그러면 이미지 한 장이 아니라 그 이미지를 포함한 화면 전체가
 * 에러 바운더리로 떨어진다(홈 화면 500).
 *
 * 투데이 카드의 `cover_image_url`처럼 어드민 자유 입력값은 호스트를 사전에 알 수 없으므로
 * 화이트리스트를 전제하는 `next/image`에 그대로 넘길 수 없다. 이 함수로 "최적화 가능한
 * 안전한 src"만 골라내고, 나머지는 일반 `<img>`로 렌더한다.
 *
 * ## 이 파일이 단일 소스다
 * `next.config.ts`가 아래 `IMAGE_REMOTE_PATTERNS`를 import해서 `images.remotePatterns`로
 * 쓴다. 두 곳을 손으로 맞추던 구조는 어긋나는 순간 다시 500을 만들기 때문에, 패턴을
 * 여기 한 곳에만 둔다. 호스트를 추가할 일이 생기면 이 배열만 고치면 된다.
 */

/**
 * `next/image`가 최적화할 수 있는 원격 이미지 패턴. `next.config.ts`가 그대로 가져다 쓴다.
 * `pathname`의 `/**`는 "그 경로 이하 전부"를 뜻한다.
 */
export const IMAGE_REMOTE_PATTERNS = [
  {
    // Supabase Storage — 배지/아이템/북 이미지.
    // 공개 오브젝트만 허용한다. 서명 URL(/object/sign/...)은 만료되는 값이라 제외.
    protocol: 'https' as const,
    hostname: 'ceehnkzdbecxwzxrhhns.supabase.co',
    pathname: '/storage/v1/object/public/**',
  },
  {
    // Google OAuth 프로필 아바타.
    // 구글은 같은 아바타를 lh3/lh4/lh5/lh6 등 여러 호스트로 내려준다. auth/callback/route.ts도
    // `includes('googleusercontent')`로 느슨하게 판정해 저장하므로, lh3만 등록해 두면 lh4가
    // 저장되는 순간 프로필·검색·팔로워 화면이 통째로 500이 된다 (20260824_005).
    // `*.`는 서브도메인 한 단계만 매칭한다(next/image 규칙과 동일).
    protocol: 'https' as const,
    hostname: '*.googleusercontent.com',
    pathname: '/**',
  },
]

/**
 * `pathname`이 패턴에 맞는지 본다. `/**` 접미는 접두 일치로 처리한다.
 *
 * next 내부 매처보다 **의도적으로 보수적**이다. 판정이 틀려도 방향이 중요한데,
 * false negative는 "최적화 없이 `<img>`로 렌더"라는 무해한 열화지만
 * false positive는 화면 전체가 죽는 500이기 때문이다.
 */
function matchesPathname(pattern: string, pathname: string): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return prefix === '' ? pathname.startsWith('/') : pathname === prefix || pathname.startsWith(`${prefix}/`)
  }
  return pathname === pattern
}

/**
 * `hostname`이 패턴에 맞는지 본다. `*.` 접두는 **서브도메인 한 단계만** 매칭한다
 * (`*.googleusercontent.com` → `lh3.googleusercontent.com` O, `a.b.googleusercontent.com` X).
 *
 * next/image의 와일드카드 규칙과 같지만, 여기서도 `matchesPathname`과 동일하게
 * **의도적으로 보수적**이다 — 덜 매칭되면 `<img>`로 내려가 최적화만 놓치고,
 * 더 매칭되면 화면이 죽기 때문이다.
 */
function matchesHostname(pattern: string, hostname: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1) // '.googleusercontent.com'
    if (!hostname.endsWith(suffix)) return false
    const label = hostname.slice(0, hostname.length - suffix.length)
    return label.length > 0 && !label.includes('.')
  }
  return hostname === pattern
}

/**
 * `next/image`에 안전하게 넘길 수 있는 src인지 판정한다.
 * - 내부 절대 경로(`/badges/...`): true
 * - `IMAGE_REMOTE_PATTERNS`의 protocol·hostname·pathname을 **모두** 만족하는 절대 URL: true
 * - 그 외(미등록 호스트, 등록 호스트라도 경로/스킴이 다른 URL, 프로토콜 상대 URL,
 *   data/blob, 상대경로, 파싱 실패): false
 */
export function isOptimizableImageSrc(src: string | null | undefined): boolean {
  if (!src) return false
  const value = src.trim()
  if (!value) return false

  // `//host/path` 프로토콜 상대 URL은 next/image가 파싱하지 못한다
  if (value.startsWith('//')) return false
  if (value.startsWith('/')) return true

  try {
    const url = new URL(value)
    return IMAGE_REMOTE_PATTERNS.some(
      (p) =>
        url.protocol === `${p.protocol}:` &&
        matchesHostname(p.hostname, url.hostname) &&
        matchesPathname(p.pathname, url.pathname)
    )
  } catch {
    return false
  }
}
