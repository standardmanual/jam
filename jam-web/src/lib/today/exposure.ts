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

export type TimeOfDayTag =
  | 'time_dawn'
  | 'time_morning'
  | 'time_afternoon'
  | 'time_evening'
  | 'time_night'

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

/** 슬롯 일부만 채운 미완성 아이템북을 보유했는지 */
async function hasIncompleteItemBook(userId: string): Promise<boolean> {
  const supabase = createServiceClient()

  // 유저가 슬롯을 채우기 시작한 북들
  const { data: slotsRaw } = await supabase
    .from('user_item_book_slots')
    .select('item_book_id')
    .eq('user_id', userId)
  const slotCountByBook = new Map<string, number>()
  for (const s of (slotsRaw ?? []) as { item_book_id: string }[]) {
    slotCountByBook.set(s.item_book_id, (slotCountByBook.get(s.item_book_id) ?? 0) + 1)
  }
  const startedBookIds = [...slotCountByBook.keys()]
  if (startedBookIds.length === 0) return false

  // 이미 완성한 북 제외
  const { data: compsRaw } = await supabase
    .from('user_item_book_completions')
    .select('item_book_id')
    .eq('user_id', userId)
    .in('item_book_id', startedBookIds)
  const completedBooks = new Set(((compsRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id))

  const candidateBookIds = startedBookIds.filter((id) => !completedBooks.has(id))
  if (candidateBookIds.length === 0) return false

  // 각 북의 전체 아이템 배지 수와 비교 → 슬롯 < 전체면 미완성
  const { data: badgesRaw } = await supabase
    .from('badges')
    .select('id, item_book_id')
    .in('item_book_id', candidateBookIds)
    .eq('type', 'item')
    .is('deleted_at', null)
  const totalByBook = new Map<string, number>()
  for (const b of (badgesRaw ?? []) as { id: string; item_book_id: string | null }[]) {
    if (!b.item_book_id) continue
    totalByBook.set(b.item_book_id, (totalByBook.get(b.item_book_id) ?? 0) + 1)
  }

  return candidateBookIds.some((bookId) => {
    const total = totalByBook.get(bookId) ?? 0
    const filled = slotCountByBook.get(bookId) ?? 0
    return total > 0 && filled < total
  })
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

  const [participating, endingSoon, incompleteBook] = await Promise.all([
    hasParticipatingMission(userId),
    hasEndingSoonMission(userId, now),
    hasIncompleteItemBook(userId),
  ])

  if (participating) tags.push('has_participating_mission')
  if (endingSoon) tags.push('has_ending_soon_mission')
  if (incompleteBook) tags.push('has_incomplete_itembook')
  if (isNewUser(userCreatedAt, now)) tags.push('new_user')

  return tags
}
