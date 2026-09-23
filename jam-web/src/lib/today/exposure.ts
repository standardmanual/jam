/**
 * JAM! Phase 15 — 투데이 카드 노출조건 태그 계산 (서버 사이드 전용)
 *
 * 요청 시점에 유저의 "현재 상태 태그"를 계산해, today_cards.exposure_tags 와
 * 배열 겹침(OR) 매칭에 사용한다. 활동 로그 원본이 없으므로 DB에서 즉시 조회 가능한
 * 값만 태그로 채택 (PRD/Phase15_01_PRD.md §4).
 *
 * service_role 클라이언트 사용 (RLS 우회, 존재 여부만 LIMIT 1 로 확인).
 */
import { createServiceClient } from '@/lib/supabase/server'
import { computeBookCompletion, type CompletionBadgeInput } from '@/lib/itembook/completion-basis'
import { getTodayWeather } from '@/lib/inputs/weather'
import { getTodaySpecialDays } from '@/lib/inputs/holidays'

export type TimeOfDayTag =
  | 'time_dawn'
  | 'time_morning'
  | 'time_afternoon'
  | 'time_evening'
  | 'time_night'

/** 세그먼트 확장 1차 임계값 (티켓 20260923_2253) — 잔여 이 값 이하면 컬렉션 잔여 태그 */
export const ITEMBOOK_REMAINING_MAX = 3
/** 세그먼트 확장 1차 임계값 (티켓 20260923_2253) — 경과가 이 값 이상이면 동기화 경과 태그 */
export const STRAVA_STALE_DAYS = 14

/**
 * KST(UTC+9) 기준 시각으로 시간대 태그를 반환한다.
 * 서버가 UTC로 동작해도 여기서 +9h 보정 후 판정하므로 결과는 항상 KST 기준.
 * (순수 함수 — 유닛테스트 대상)
 */
export function timeOfDayTag(now: Date): TimeOfDayTag {
  const kstHour = Math.floor(((now.getTime() + 9 * 3600_000) / 3600_000) % 24)
  if (kstHour < 6) return 'time_dawn' // 00~06
  if (kstHour < 11) return 'time_morning' // 06~11
  if (kstHour < 17) return 'time_afternoon' // 11~17
  if (kstHour < 21) return 'time_evening' // 17~21
  return 'time_night' // 21~24
}

/**
 * 가입 7일 이내면 신규 유저.
 * (순수 함수 — createdAt/now 만으로 판정, DB 조회 불필요)
 */
export function isNewUser(createdAt: string | null | undefined, now: Date): boolean {
  if (!createdAt) return false
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now.getTime() - created <= 7 * 24 * 3600_000
}

/** 진행 중(참가했으나 미완료) 미션이 하나라도 있는지 */
async function hasParticipatingMission(userId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: parts } = await supabase
    .from('user_mission_participations')
    .select('mission_id')
    .eq('user_id', userId)
  const participatingIds = ((parts ?? []) as { mission_id: string }[]).map((p) => p.mission_id)
  if (participatingIds.length === 0) return false

  const { data: comps } = await supabase
    .from('user_mission_completions')
    .select('mission_id')
    .eq('user_id', userId)
    .in('mission_id', participatingIds)
  const completedIds = new Set(((comps ?? []) as { mission_id: string }[]).map((c) => c.mission_id))
  return participatingIds.some((id) => !completedIds.has(id))
}

/** 참가 중이고 ends_at 이 3일 이내인 미완료 미션이 있는지 */
async function hasEndingSoonMission(userId: string, now: Date): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: parts } = await supabase
    .from('user_mission_participations')
    .select('mission_id')
    .eq('user_id', userId)
  const participatingIds = ((parts ?? []) as { mission_id: string }[]).map((p) => p.mission_id)
  if (participatingIds.length === 0) return false

  const { data: comps } = await supabase
    .from('user_mission_completions')
    .select('mission_id')
    .eq('user_id', userId)
    .in('mission_id', participatingIds)
  const completedIds = new Set(((comps ?? []) as { mission_id: string }[]).map((c) => c.mission_id))
  const incompleteIds = participatingIds.filter((id) => !completedIds.has(id))
  if (incompleteIds.length === 0) return false

  const soon = new Date(now.getTime() + 3 * 24 * 3600_000).toISOString()
  const { data: ending } = await supabase
    .from('missions')
    .select('id')
    .in('id', incompleteIds)
    .gte('ends_at', now.toISOString())
    .lte('ends_at', soon)
    .limit(1)
  return ((ending ?? []) as { id: string }[]).length > 0
}

/** 컬렉션 진행 상태 — 미완성 보유 여부와 잔여 슬롯 최소값 (티켓 20260923_2353: 한 번의 조회로 둘 다 구한다) */
async function getItemBookProgress(
  userId: string
): Promise<{ hasIncomplete: boolean; minRemaining: number | null }> {
  const none = { hasIncomplete: false, minRemaining: null }
  const supabase = createServiceClient()

  // 유저가 슬롯을 채우기 시작한 북들
  const { data: slotsRaw } = await supabase
    .from('user_item_book_slots')
    .select('item_book_id, badge_id')
    .eq('user_id', userId)
  const filledBadgeIds = new Set<string>()
  const startedSet = new Set<string>()
  for (const s of (slotsRaw ?? []) as { item_book_id: string; badge_id: string }[]) {
    filledBadgeIds.add(s.badge_id)
    startedSet.add(s.item_book_id)
  }
  const startedBookIds = [...startedSet]
  if (startedBookIds.length === 0) return none

  // 이미 완성한 북 제외
  const { data: compsRaw } = await supabase
    .from('user_item_book_completions')
    .select('item_book_id')
    .eq('user_id', userId)
    .in('item_book_id', startedBookIds)
  const completedBooks = new Set(((compsRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id))

  const candidateBookIds = startedBookIds.filter((id) => !completedBooks.has(id))
  if (candidateBookIds.length === 0) return none

  // 분모(드랍 제외 배지를 뺀 아이템 배지)와 채운 배지의 교집합을 비교 → 미완성 여부·잔여 슬롯
  const { data: badgesRaw } = await supabase
    .from('badges')
    .select('id, item_book_id, type, drop_excluded')
    .in('item_book_id', candidateBookIds)
    .eq('type', 'item')
    .is('deleted_at', null)
  const badges = (badgesRaw ?? []) as CompletionBadgeInput[]

  return {
    hasIncomplete: hasIncompleteBook(candidateBookIds, badges, filledBadgeIds),
    minRemaining: minRemainingSlots(candidateBookIds, badges, filledBadgeIds),
  }
}

/** 후보 북 중 분모가 있고 아직 다 채우지 못한 북이 있는지 (순수 함수 — 테스트 대상, 티켓 20260921_1113) */
export function hasIncompleteBook(
  candidateBookIds: string[],
  badges: CompletionBadgeInput[],
  filledBadgeIds: ReadonlySet<string>
): boolean {
  const completion = computeBookCompletion(badges, filledBadgeIds, { types: ['item'] })
  return candidateBookIds.some((bookId) => {
    const c = completion.get(bookId)
    return !!c && c.total > 0 && !c.complete
  })
}

/** 미완성 컬렉션 중 잔여 슬롯 수(분모-분자)가 가장 적은 값을 찾는다 (순수 함수 — 테스트 대상, 티켓 20260923_2253).
 *  완성한 북이나 분모가 없는 북은 후보에서 제외한다. 후보가 없으면 null. */
export function minRemainingSlots(
  candidateBookIds: string[],
  badges: CompletionBadgeInput[],
  filledBadgeIds: ReadonlySet<string>
): number | null {
  const completion = computeBookCompletion(badges, filledBadgeIds, { types: ['item'] })
  let min: number | null = null
  for (const bookId of candidateBookIds) {
    const c = completion.get(bookId)
    if (!c || c.total === 0 || c.complete) continue
    const remaining = c.total - c.filled
    if (min === null || remaining < min) min = remaining
  }
  return min
}

/** last_synced_at 기준 경과일 (순수 함수 — 테스트 대상, 티켓 20260923_2253).
 *  연결 자체가 없으면 null(태그 대상 아님). 연결은 있지만 한 번도 동기화하지 않았으면
 *  Infinity로 취급한다 — "연결했지만 오래 안 한 유저"에 해당한다. */
export function daysSinceLastSync(
  connection: { last_synced_at: string | null } | null,
  now: Date
): number | null {
  if (!connection) return null
  if (!connection.last_synced_at) return Infinity
  const last = new Date(connection.last_synced_at).getTime()
  if (Number.isNaN(last)) return Infinity
  return Math.floor((now.getTime() - last) / (24 * 3600_000))
}

/** 유저의 Strava 동기화 경과일. strava_connections 행이 없는 유저는 null(태그 대상 아님) */
async function stravaStaleDays(userId: string, now: Date): Promise<number | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('strava_connections')
    .select('last_synced_at')
    .eq('user_id', userId)
    .maybeSingle()
  return daysSinceLastSync((data ?? null) as { last_synced_at: string | null } | null, now)
}

/**
 * 유저의 현재 노출조건 태그 집합을 계산한다.
 * 항상 'all' 과 시간대 태그를 포함하고, 자동계산 조건들을 만족하면 추가한다.
 */
export async function computeUserExposureTags(
  userId: string,
  now: Date,
  userCreatedAt?: string | null,
): Promise<string[]> {
  const tags: string[] = ['all', timeOfDayTag(now)]

  const [participating, endingSoon, itemBookProgress, staleDays, weather, specialDays] =
    await Promise.all([
      hasParticipatingMission(userId),
      hasEndingSoonMission(userId, now),
      getItemBookProgress(userId),
      stravaStaleDays(userId, now),
      getTodayWeather(),
      getTodaySpecialDays(),
    ])

  if (participating) tags.push('has_participating_mission')
  if (endingSoon) tags.push('has_ending_soon_mission')
  const { hasIncomplete: incompleteBook, minRemaining } = itemBookProgress
  if (incompleteBook) tags.push('has_incomplete_itembook')
  if (minRemaining !== null && minRemaining <= ITEMBOOK_REMAINING_MAX) {
    tags.push(`itembook_remaining_le${ITEMBOOK_REMAINING_MAX}`)
  }
  if (staleDays !== null && staleDays >= STRAVA_STALE_DAYS) {
    tags.push(`strava_stale_${STRAVA_STALE_DAYS}d`)
  }
  if (isNewUser(userCreatedAt, now)) tags.push('new_user')
  // 기상청·특일정보 API 실패 시 각각 null/빈 배열이 와서 태그만 조용히 빠진다(티켓 20260923_2254)
  if (weather) tags.push(`weather_${weather}`)
  if (specialDays.length > 0) tags.push('holiday_today')

  return tags
}
