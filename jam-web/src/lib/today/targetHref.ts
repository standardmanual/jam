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
 * `resolveTargetHref`가 카드 자신의 컬럼만으로 알 수 없는 이동 경로를 계산할 때 필요한 추가
 * 맥락(티켓 20260911_1440). ranking_board 카드는 `ranking_mode_id`만 들고 있고, 그 랭킹모드가
 * 미션 참가자 대상인지·어느 미션인지는 `ranking_modes` 테이블을 봐야 알 수 있어 이 파일(순수
 * 함수, DB 의존 없음) 혼자서는 계산할 수 없다 — 호출부가 이미 알고 있는 값을 넘긴다
 * (`lib/today/cards.ts`는 배치 조회로, 어드민 폼·조회 화면은 이미 불러온 랭킹모드 목록에서
 * 찾아 넘긴다).
 */
export interface ResolveTargetHrefContext {
  /**
   * ranking_board 카드가 참조하는 랭킹모드의 대상이 미션 참가자(`target_type:
   * 'mission_participants'`)일 때 그 미션 id. 수동 지정 유저 대상이거나 랭킹모드를 아직
   * 모르면 `null`/`undefined`.
   */
  rankingModeTargetMissionId?: string | null
}

/**
 * 카드의 이동 경로를 결정한다.
 * - editorial_article: 어드민 입력을 무시하고 항상 /today/{id}
 * - 그 외: 어드민이 명시적으로 target_href를 채웠으면 그 값 우선
 * - 비어있으면 템플릿 규칙(Phase15_02 §2)으로 자동 생성
 * (순수 함수 — 유닛테스트 대상)
 */
export function resolveTargetHref(card: TodayCardRow, ctx: ResolveTargetHrefContext = {}): string {
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
    case 'ranking_board':
      // 대상이 미션 참가자면 그 미션의 기존 랭킹 화면(User Story 10 — "더 자세한 순위와 내
      // 진행 내역"은 이미 그 화면이 갖고 있다, 새로 만들지 않는다). 수동 지정 유저 대상은
      // 랭킹모드 데이터를 홈 피드 카드 밖의 다른 화면에 노출하지 않는다는 원칙(Out of
      // Scope) 때문에 자연히 이동할 "더 자세한" 화면이 없다 — 이 값(`/missions`)은 그 경우
      // 실제 이동 경로로 쓰이지 않는다. `resolved_href`가 `string`(non-null) 계약이라 자리를
      // 채우는 타입 안전 폴백일 뿐이다. 실제 탭 동작(유저 직접 지정 카드는 제목 영역에 링크
      // 자체를 걸지 않음, 2026-09-11 게이트 리뷰 WARN 대응)은 UI 쪽(`TodayCardStack.tsx`의
      // `RankingListCard`)이 `ranking.metricType`으로 판단한다.
      return ctx.rankingModeTargetMissionId ? `/missions/${ctx.rankingModeTargetMissionId}/status` : '/missions'
    default:
      return '/'
  }
}
