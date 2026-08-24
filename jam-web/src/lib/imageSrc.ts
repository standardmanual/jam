/**
 * 이미지 src 판별 유틸 (20260824_004).
 *
 * `next/image`는 `next.config.ts`의 `images.remotePatterns`에 없는 호스트를 받으면
 * **렌더 시점에 throw** 한다. 그러면 이미지 한 장이 아니라 그 이미지를 포함한 화면 전체가
 * 에러 바운더리로 떨어진다(홈 화면 500).
 *
 * 투데이 카드의 `cover_image_url`처럼 어드민 자유 입력값은 호스트를 사전에 알 수 없으므로
 * 화이트리스트를 전제하는 `next/image`에 그대로 넘길 수 없다. 이 함수로 "최적화 가능한
 * 안전한 src"만 골라내고, 나머지는 일반 `<img>`로 렌더한다.
 */

/**
 * `next.config.ts`의 `images.remotePatterns`와 반드시 동기화한다.
 * 여기 없는 호스트를 `next/image`에 넘기면 런타임에 throw한다.
 */
const OPTIMIZABLE_HOSTS = [
  'ceehnkzdbecxwzxrhhns.supabase.co', // Supabase Storage — 배지/아이템/북 이미지
  'lh3.googleusercontent.com', // Google OAuth 프로필 아바타
]

/**
 * `next/image`에 안전하게 넘길 수 있는 src인지 판정한다.
 * - 내부 절대 경로(`/badges/...`): true
 * - 등록된 호스트의 http(s) 절대 URL: true
 * - 그 외(미등록 외부 호스트, 프로토콜 상대 URL, data/blob, 상대경로, 파싱 실패): false
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
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return OPTIMIZABLE_HOSTS.includes(url.hostname)
  } catch {
    return false
  }
}
