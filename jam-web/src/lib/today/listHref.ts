/**
 * 목록형 카드(`gallery_list`)의 주소 안전 규칙 (티켓 20261121_1530, 상위 20261120_2026 6회차-1).
 *
 * 서비스 카드(`components/today/feed/FeedGalleryListCard.tsx`)·어드민 폼·카드 칸 검증(`lib/admin/feedCardFields.ts`)이 함께 쓴다.
 * 요약창이 클라이언트 번들로 끌어오는 순수 모듈(`homeFeedCard.ts` 계열)이 이 규칙을 값으로 가져와야 해서,
 * `next/link`·`SafeImage`를 읽는 카드 컴포넌트 파일에서 떼어 순수 파일로 옮겼다. React·서버 모듈을 읽지 않는다.
 */

/**
 * 링크로 그려도 안전한 주소인가: 내부 경로(`/`로 시작하고 `//`·`/\`로 시작하지 않는 값) 또는 `https://`로 시작하는 값.
 * `javascript:`·`http:`·`//host`(프로토콜 상대)·`/\host`·빈 값·공백이 낀 값은 거짓이다.
 */
export function isSafeListHref(href: string | null | undefined): href is string {
  if (typeof href !== 'string' || href.length === 0 || /\s/.test(href)) return false
  if (href.startsWith('/')) return !href.startsWith('//') && !href.startsWith('/\\')
  return /^https:\/\//i.test(href)
}
