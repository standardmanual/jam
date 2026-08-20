/**
 * JAM! Phase 15 — 투데이 카드 조회 + target_href 자동생성 (서버 사이드 전용)
 *
 * 조회 규칙 (PRD/Phase15_02_DATA_MODEL.md §4):
 *   is_active = TRUE AND starts_at <= now <= ends_at
 *   AND exposure_tags && [유저태그 + 'all']  (배열 겹침 = OR 매칭)
 *   ORDER BY sort_order ASC, starts_at DESC
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { TodayCardRow } from '@/types/database'
import { computeUserExposureTags } from './exposure'

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

export interface ResolvedBadge {
  id: string
  name: string
  image_url: string | null
  rarity: string
}

/** resolveTargetHref 를 적용한 카드 (UI에서 바로 링크로 사용) */
export type TodayCardWithHref = TodayCardRow & {
  resolved_href: string
  /** badge_ids 를 실제 배지 정보로 조회한 결과 (badge_gallery 레이아웃 렌더링용, badge_ids 없으면 빈 배열) */
  resolved_badges: ResolvedBadge[]
}

/**
 * 유저에게 지금 노출할 투데이 카드 목록을 조회한다.
 * @param userId 대상 유저
 * @param userCreatedAt users.created_at (new_user 태그 판정용, 있으면 전달)
 * @param now 기준 시각 (기본: 현재)
 */
export async function getTodayCards(
  userId: string,
  userCreatedAt?: string | null,
  now: Date = new Date(),
): Promise<TodayCardWithHref[]> {
  const tags = await computeUserExposureTags(userId, now, userCreatedAt)
  const supabase = createServiceClient()
  const nowIso = now.toISOString()

  const { data, error } = await supabase
    .from('today_cards')
    .select('*')
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .overlaps('exposure_tags', tags)
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: false })

  if (error) {
    console.error('[getTodayCards] 조회 오류:', error.message)
    return []
  }

  const cards = (data ?? []) as TodayCardRow[]
  const badgesById = await fetchBadgesById(supabase, cards.flatMap((c) => c.badge_ids ?? []))

  return cards.map((card) => ({
    ...card,
    resolved_href: resolveTargetHref(card),
    resolved_badges: (card.badge_ids ?? []).map((id) => badgesById.get(id)).filter((b): b is ResolvedBadge => Boolean(b)),
  }))
}

/** badge_ids 배열(중복 포함 가능)을 한 번에 조회해 id → 배지정보 맵으로 반환 */
async function fetchBadgesById(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  badgeIds: string[],
): Promise<Map<string, ResolvedBadge>> {
  const uniqueIds = [...new Set(badgeIds)]
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase
    .from('badges')
    .select('id, name, image_url, rarity')
    .in('id', uniqueIds)

  const map = new Map<string, ResolvedBadge>()
  for (const b of (data ?? []) as ResolvedBadge[]) map.set(b.id, b)
  return map
}

/**
 * editorial_article 아티클 페이지용 단건 조회.
 * is_active 이고 조회 시점이 starts_at~ends_at 구간 안일 때만 반환(기간 밖/비활성 → null).
 * 예약발행/종료 카드에 직링크로 접근하는 것을 차단한다.
 */
export async function getPublishedArticleCard(
  cardId: string,
  now: Date = new Date(),
): Promise<TodayCardRow | null> {
  const supabase = createServiceClient()
  const nowIso = now.toISOString()

  const { data } = await supabase
    .from('today_cards')
    .select('*')
    .eq('id', cardId)
    .eq('template_type', 'editorial_article')
    .eq('is_active', true)
    .lte('starts_at', nowIso)
    .gte('ends_at', nowIso)
    .maybeSingle()

  return (data as TodayCardRow | null) ?? null
}
