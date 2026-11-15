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

import { isPathActive } from './isPathActive'

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
    return prefix === '' ? pathname.startsWith('/') : isPathActive(pathname, prefix)
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

/** 그리드(3열)에서 첫 화면으로 보는 칸 수 — 3열 × 4행. 이 앞 칸은 지연 로딩을 끈다(`SafeImage eager`, 티켓 20261115_1237) */
export const FIRST_SCREEN_GRID_COUNT = 12
/** 지점 카드 갤러리(3열)의 첫 화면 칸 수 — 3열 × 2행 */
export const FIRST_SCREEN_GALLERY_COUNT = 6

/**
 * `/badges/`로 시작하는 내부 정적 파일 경로인지 (티켓 20261115_1237).
 * 이 경로는 변환 주소(`/_next/image`)를 거치지 않고 원래 주소로 직접 받는다 — 변환 응답은
 * `max-age=0`이라 매번 재검증하지만, 직접 응답은 next.config의 `headers()`가 긴 캐시를 붙인다.
 */
export function isDirectStaticBadgeSrc(src: string | null | undefined): boolean {
  const value = src?.trim()
  if (!value) return false
  return value.startsWith('/badges/')
}

/**
 * 카드(`SafeImage`)가 실제로 요청하는 주소를 만든다.
 * 정적 파일 배지와 최적화할 수 없는 주소는 그대로, 나머지는 `/_next/image?url=…&w=…&q=75`.
 * `w`는 next 기본 폭(deviceSizes + imageSizes)에 있는 값이어야 한다 — 없으면 `/_next/image`가 400을 돌려준다.
 */
export function optimizedImageUrl(src: string | null | undefined, width: number): string | null {
  const value = src?.trim()
  if (!value) return null
  if (isDirectStaticBadgeSrc(value) || !isOptimizableImageSrc(value)) return value
  return `/_next/image?url=${encodeURIComponent(value)}&w=${width}&q=75`
}

/** next 기본 폭 목록(imageSizes + deviceSizes, 오름차순) — `next.config.ts`가 따로 지정하지 않아 기본값이다 */
const NEXT_IMAGE_WIDTHS = [32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]

/** 배지 카드 썸네일의 표시 폭(`BadgeGridCard`의 `SafeImage width`) — 미리 받기 주소 계산에 쓴다 */
export const BADGE_CARD_DISPLAY_WIDTH = 90

/**
 * `next/image`가 srcset에 넣는 폭 — 1배 화면은 표시 폭 이상인 가장 작은 값, 그 밖에는 표시 폭 2배 이상인 가장 작은 값
 * (티켓 20261115_1344). 90 → 96(1x)·256(2x 이상).
 */
export function nextImageWidthFor(displayWidth: number, dpr: number): number {
  const target = dpr <= 1 ? displayWidth : displayWidth * 2
  return NEXT_IMAGE_WIDTHS.find((w) => w >= target) ?? NEXT_IMAGE_WIDTHS[NEXT_IMAGE_WIDTHS.length - 1]
}

/**
 * 슬롯 점선 외곽선(`SlotOutline`)이 윤곽을 추적할 이미지 주소 (티켓 20261112_1627).
 *
 * 최적화 가능한 src는 `/_next/image`를 거친다 — 같은 출처가 되어 canvas가 오염되지 않는다.
 * 폭 90 이미지를 `next/image`가 내보내는 srcset은 1x=96, 2x=256이라 **w=256, q=75는 휴대폰이 이미 받는 변환본과 같다**
 * (새 변환본이 생기지 않아 Vercel 이미지 최적화 비용이 늘지 않는다). 다른 폭을 쓰면 이미지마다 변환본이 늘고,
 * 192처럼 next 기본 sizes(deviceSizes + imageSizes)에 없는 값은 `/_next/image`가 400을 돌려준다.
 * 최적화할 수 없는 src는 그대로 돌려준다(CORS가 막히면 추적이 실패해 사각형 점선으로 떨어진다). 주소가 없으면 null.
 */
export const SLOT_OUTLINE_TRACE_WIDTH = 256
export const SLOT_OUTLINE_TRACE_QUALITY = 75

export function slotOutlineTraceSrc(src: string | null | undefined): string | null {
  return optimizedImageUrl(src, SLOT_OUTLINE_TRACE_WIDTH)
}
