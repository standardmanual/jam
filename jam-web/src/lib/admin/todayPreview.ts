/**
 * 어드민 투데이 캘린더뷰(20260902_1028) — [미리보기] 버튼용 시뮬레이션 조회 (서버 사이드 전용).
 *
 * `src/lib/today/cards.ts`의 `getTodayCards()`(유저向 실제 홈 화면 조회)와 같은 구조를
 * 따르되, 두 가지를 의도적으로 단순화한다(티켓 완료 기록의 "주요 의사결정" 참고):
 *   1. `exposure_tags` 개인화 매칭을 하지 않는다 — 어드민 미리보기에는 특정 유저 컨텍스트가
 *      없다. is_active + 날짜 구간만으로 필터링한다.
 *   2. `filterMissionSpotlightCards`(미션 참가/완료 여부에 따른 노출 제외)도 하지 않는다 —
 *      같은 이유로 유저별 참가 상태를 알 수 없다.
 * 즉 "이 날짜에 켜져 있는 카드 전체"를 보여주는 상한선 시뮬레이션이다. 실제 개별 유저가
 * 보는 목록은 개인화 조건에 따라 이 중 일부일 수 있다.
 *
 * `getTodayCards()`·`TodayCardStack.tsx`(유저向 로직·화면)는 이 티켓에서 변경하지
 * 않는다 — 이 파일은 그 둘의 타입(`TodayCardWithHref`, `ResolvedBadge`)과 순수 함수
 * (`resolveTargetHref`)만 재사용하는 별도 조회 경로다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { TodayCardRow } from '@/types/database'
import { resolveTargetHref, type TodayCardWithHref, type ResolvedBadge } from '@/lib/today/cards'
import { kstDayBoundsIso } from './today-calendar'

/**
 * 선택한 날짜(KST 달력 기준 'YYYY-MM-DD')에 실제 유저가 봤을/볼 투데이 카드 목록을
 * 시뮬레이션한다. 정렬은 `getTodayCards()`와 동일(sort_order asc, starts_at desc).
 */
export async function getAdminTodayPreviewCards(dateStr: string): Promise<TodayCardWithHref[]> {
  const { startIso, endIso } = kstDayBoundsIso(dateStr)
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('today_cards')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', endIso)
    .gte('ends_at', startIso)
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: false })

  if (error) {
    console.error('[getAdminTodayPreviewCards] 조회 오류:', error.message)
    return []
  }

  const cards = (data ?? []) as TodayCardRow[]
  const badgeIds = [...new Set(cards.flatMap((c) => c.badge_ids ?? []))]

  const badgesById = new Map<string, ResolvedBadge>()
  if (badgeIds.length > 0) {
    const { data: badgesRaw } = await supabase
      .from('badges')
      .select('id, name, image_url, rarity')
      .in('id', badgeIds)
      .is('deleted_at', null)
    for (const b of (badgesRaw ?? []) as ResolvedBadge[]) badgesById.set(b.id, b)
  }

  return cards.map((card) => ({
    ...card,
    resolved_href: resolveTargetHref(card),
    resolved_badges: (card.badge_ids ?? []).map((id) => badgesById.get(id)).filter((b): b is ResolvedBadge => Boolean(b)),
  }))
}
