/**
 * 투데이 카드의 이동 경로 결정 — `lib/today/cards.ts`에서 분리했다(티켓 20260911_1454).
 *
 * `cards.ts`는 최상단에서 `@/lib/supabase/server`(→ `next/headers`)를 import해서 서버
 * 전용이다. 어드민 폼(`TodayCardForm.tsx`)·조회 화면(`TodayCardDetail.tsx`)의 레일 미리보기가
 * 이 순수 함수 하나만 필요한데, `cards.ts`에서 값으로 import하면(타입만이 아니라) 그 서버 전용
 * 의존까지 클라이언트 번들에 딸려 들어가 "next/headers는 Server Component 전용" 빌드 오류가
 * 난다(드랍 엔진에서 `cumulativeConditionFields.ts`를 분리한 것과 같은 이유, 티켓
 * 20260911_0901 D-2). `cards.ts`는 이 파일을 재수출해 기존 호출부(`getTodayCards` 등)는
 * 그대로 `@/lib/today/cards`에서 가져다 쓴다.
 */
import type { TodayCardRow } from '@/types/database'

/**
 * 카드의 이동 경로를 결정한다.
 * - editorial_article: 어드민 입력을 무시하고 항상 /today/{id}
 * - 그 외: 어드민이 명시적으로 target_href를 채웠으면 그 값 우선
 * - 비어있으면 템플릿 규칙(Phase15_02 §2)으로 자동 생성
 * (순수 함수 — 유닛테스트 대상)
 */
export function resolveTargetHref(card: TodayCardRow): string {
  if (card.template_type === 'editorial_article') return `/today/${card.id}`

  const explicit = card.target_href?.trim()
  if (explicit) return explicit

  const firstBadge = card.badge_ids?.[0]
  const badgeHref = () => {
    if (!card.badge_ids || card.badge_ids.length === 0) return '/badges'
    return card.badge_ids.length === 1 ? `/badges/${firstBadge}` : '/badges'
  }

  switch (card.template_type) {
    case 'badge_spotlight':
      return badgeHref()
    case 'location_trend':
      return badgeHref()
    case 'progress_nudge':
      if (card.badge_ids && card.badge_ids.length > 0) return badgeHref()
      if (card.mission_id) return `/missions/${card.mission_id}`
      return '/badges'
    case 'mission_spotlight':
      return card.mission_id ? `/missions/${card.mission_id}` : '/missions'
    case 'itembook_milestone':
      return card.item_book_id ? `/collections/${card.item_book_id}` : '/collections'
    case 'drop_alert':
      return '/drops'
    default:
      return '/'
  }
}
