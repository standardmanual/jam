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
import { resolveStravaUiState } from '@/lib/strava/connection-state'
import { COMPLETION_BADGE_TYPES, computeBookCompletion, type CompletionBadgeInput } from '@/lib/itembook/completion-basis'
import { buildFilledByBook } from '@/lib/itembook/filled-by-book'
import { getTodayWeather } from '@/lib/inputs/weather'
import { getTodaySpecialDays } from '@/lib/inputs/holidays'
import { specialDayTags } from '@/lib/inputs/special-days-config'
import {
  CAPSULE_NEARLY_FULL_RATIO,
  CHAPTER_BANDS,
  INVENTORY_LOW_FREE_SLOTS,
  JAM_LOW_FRACTION,
  JAM_PLENTY_MULTIPLE,
} from './exposureThresholds'
import { tribeTagOf } from './exposureTribe'

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
  if (kstHour < 5) return 'time_night' // 00~05 (심야 후반)
  if (kstHour < 8) return 'time_dawn' // 05~08
  if (kstHour < 11) return 'time_morning' // 08~11
  if (kstHour < 17) return 'time_afternoon' // 11~17
  if (kstHour < 22) return 'time_evening' // 17~22
  return 'time_night' // 22~24 (심야 전반)
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
  const { data: parts, error: partsError } = await supabase
    .from('user_mission_participations')
    .select('mission_id')
    .eq('user_id', userId)
  if (partsError) console.error('[hasParticipatingMission] user_mission_participations 조회 오류:', partsError.message)
  const participatingIds = ((parts ?? []) as { mission_id: string }[]).map((p) => p.mission_id)
  if (participatingIds.length === 0) return false

  const { data: comps, error: compsError } = await supabase
    .from('user_mission_completions')
    .select('mission_id')
    .eq('user_id', userId)
    .in('mission_id', participatingIds)
  if (compsError) {
    // 완료 여부를 모르면 전부 미완료로 보지 않고 태그를 뺀다
    console.error('[hasParticipatingMission] user_mission_completions 조회 오류:', compsError.message)
    return false
  }
  const completedIds = new Set(((comps ?? []) as { mission_id: string }[]).map((c) => c.mission_id))
  return participatingIds.some((id) => !completedIds.has(id))
}

/** 참가 중이고 ends_at 이 3일 이내인 미완료 미션이 있는지 */
async function hasEndingSoonMission(userId: string, now: Date): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: parts, error: partsError } = await supabase
    .from('user_mission_participations')
    .select('mission_id')
    .eq('user_id', userId)
  if (partsError) console.error('[hasEndingSoonMission] user_mission_participations 조회 오류:', partsError.message)
  const participatingIds = ((parts ?? []) as { mission_id: string }[]).map((p) => p.mission_id)
  if (participatingIds.length === 0) return false

  const { data: comps, error: compsError } = await supabase
    .from('user_mission_completions')
    .select('mission_id')
    .eq('user_id', userId)
    .in('mission_id', participatingIds)
  if (compsError) {
    console.error('[hasEndingSoonMission] user_mission_completions 조회 오류:', compsError.message)
    return false
  }
  const completedIds = new Set(((comps ?? []) as { mission_id: string }[]).map((c) => c.mission_id))
  const incompleteIds = participatingIds.filter((id) => !completedIds.has(id))
  if (incompleteIds.length === 0) return false

  const soon = new Date(now.getTime() + 3 * 24 * 3600_000).toISOString()
  const { data: ending, error: endingError } = await supabase
    .from('missions')
    .select('id')
    .in('id', incompleteIds)
    .gte('ends_at', now.toISOString())
    .lte('ends_at', soon)
    .limit(1)
  if (endingError) console.error('[hasEndingSoonMission] missions 조회 오류:', endingError.message)
  return ((ending ?? []) as { id: string }[]).length > 0
}

/** 컬렉션 진행 상태 — 미완성 보유 여부와 잔여 슬롯 최소값 (티켓 20260923_2353: 한 번의 조회로 둘 다 구한다) */
async function getItemBookProgress(
  userId: string
): Promise<{ hasIncomplete: boolean; minRemaining: number | null }> {
  const none = { hasIncomplete: false, minRemaining: null }
  const supabase = createServiceClient()

  // 유저가 슬롯을 채우기 시작한 북들
  const { data: slotsRaw, error: slotsError } = await supabase
    .from('user_item_book_slots')
    .select('item_book_id, badge_id')
    .eq('user_id', userId)
  if (slotsError) console.error('[getItemBookProgress] user_item_book_slots 조회 오류:', slotsError.message)
  const slots = (slotsRaw ?? []) as { item_book_id: string; badge_id: string }[]
  const startedSet = new Set<string>()
  for (const s of slots) startedSet.add(s.item_book_id)
  const startedBookIds = [...startedSet]
  if (startedBookIds.length === 0) return none

  // 이미 완성한 북 제외
  const { data: compsRaw, error: compsError } = await supabase
    .from('user_item_book_completions')
    .select('item_book_id')
    .eq('user_id', userId)
    .in('item_book_id', startedBookIds)
  if (compsError) {
    // 완성 여부를 모르면 완성한 북까지 후보에 남기지 않고 태그를 뺀다
    console.error('[getItemBookProgress] user_item_book_completions 조회 오류:', compsError.message)
    return none
  }
  const completedBooks = new Set(((compsRaw ?? []) as { item_book_id: string }[]).map((c) => c.item_book_id))

  const candidateBookIds = startedBookIds.filter((id) => !completedBooks.has(id))
  if (candidateBookIds.length === 0) return none

  // 분모(드랍 제외·소프트 삭제 배지를 뺀 배지)와 그 컬렉션의 채운 배지 교집합을 비교 → 미완성 여부·잔여 슬롯
  // (완성 판정 모듈 한 곳, 티켓 20261016_2340 2회-나)
  const [badgesResult, tierBooksResult] = await Promise.all([
    supabase
      .from('badges')
      .select('id, item_book_id, type, drop_excluded, name, rarity, deleted_at')
      .in('item_book_id', candidateBookIds)
      .in('type', [...COMPLETION_BADGE_TYPES])
      .is('deleted_at', null),
    supabase.from('item_books').select('id, tier_mode').in('id', candidateBookIds),
  ])
  if (badgesResult.error) console.error('[getItemBookProgress] badges 조회 오류:', badgesResult.error.message)
  if (tierBooksResult.error) console.error('[getItemBookProgress] item_books 조회 오류:', tierBooksResult.error.message)
  const badges = (badgesResult.data ?? []) as CompletionBadgeInput[]
  const tierModeBookIds = new Set(
    ((tierBooksResult.data ?? []) as { id: string; tier_mode: boolean | null }[]).filter((b) => b.tier_mode).map((b) => b.id)
  )

  // 체크인 배지는 획득 이력이 있으면 채운 것으로 본다
  const checkinBadgesByBook = new Map<string, string[]>()
  for (const b of badges) {
    if (b.type !== 'checkin' || !b.item_book_id) continue
    const list = checkinBadgesByBook.get(b.item_book_id)
    if (list) list.push(b.id)
    else checkinBadgesByBook.set(b.item_book_id, [b.id])
  }
  const checkinBadgeIds = badges.filter((b) => b.type === 'checkin').map((b) => b.id)
  let earnedCheckinBadgeIds = new Set<string>()
  if (checkinBadgeIds.length > 0) {
    const { data: earnsRaw, error: earnsError } = await supabase
      .from('user_checkin_badge_earns')
      .select('badge_id')
      .eq('user_id', userId)
      .in('badge_id', checkinBadgeIds)
    if (earnsError) console.error('[getItemBookProgress] user_checkin_badge_earns 조회 오류:', earnsError.message)
    earnedCheckinBadgeIds = new Set(((earnsRaw ?? []) as { badge_id: string }[]).map((e) => e.badge_id))
  }
  const filledByBook = buildFilledByBook({ slots, checkinBadgesByBook, earnedCheckinBadgeIds })

  return {
    hasIncomplete: hasIncompleteBook(candidateBookIds, badges, filledByBook, tierModeBookIds),
    minRemaining: minRemainingSlots(candidateBookIds, badges, filledByBook, tierModeBookIds),
  }
}

/** 후보 북 중 분모가 있고 아직 다 채우지 못한 북이 있는지 (순수 함수 — 테스트 대상, 티켓 20260921_1113) */
export function hasIncompleteBook(
  candidateBookIds: string[],
  badges: CompletionBadgeInput[],
  filledByBook: ReadonlyMap<string, ReadonlySet<string>>,
  tierModeBookIds?: ReadonlySet<string>
): boolean {
  const completion = computeBookCompletion(badges, new Set<string>(), { filledByBook, tierModeBookIds })
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
  filledByBook: ReadonlyMap<string, ReadonlySet<string>>,
  tierModeBookIds?: ReadonlySet<string>
): number | null {
  const completion = computeBookCompletion(badges, new Set<string>(), { filledByBook, tierModeBookIds })
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
 *  연결 자체가 없으면 null(태그 대상 아님). 유저가 직접 끊은 연결(`disconnected_user`)도 null이다 —
 *  스스로 멈춘 유저에게 «오래 안 했어요» 카드를 반복하지 않는다(티켓 20261017_1422). 오류로 끊긴 연결은
 *  그대로 센다(다시 동기화하라는 카드가 도움이 된다). 연결은 있지만 한 번도 동기화하지 않았으면
 *  Infinity로 취급한다 — "연결했지만 오래 안 한 유저"에 해당한다. */
export function daysSinceLastSync(
  connection: { last_synced_at: string | null; disconnected_at?: string | null; disconnect_reason?: string | null } | null,
  now: Date
): number | null {
  if (!connection) return null
  if (resolveStravaUiState(connection) === 'disconnected_user') return null
  if (!connection.last_synced_at) return Infinity
  const last = new Date(connection.last_synced_at).getTime()
  if (Number.isNaN(last)) return Infinity
  return Math.floor((now.getTime() - last) / (24 * 3600_000))
}

/** 유저의 Strava 동기화 경과일. strava_connections 행이 없는 유저는 null(태그 대상 아님) */
async function stravaStaleDays(userId: string, now: Date): Promise<number | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('strava_connections')
    .select('last_synced_at, disconnected_at, disconnect_reason')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) console.error('[stravaStaleDays] strava_connections 조회 오류:', error.message)
  return daysSinceLastSync(
    (data ?? null) as { last_synced_at: string | null; disconnected_at: string | null; disconnect_reason: string | null } | null,
    now
  )
}

/** 챕터 번호 → 구간 태그 (순수 함수 — 테스트 대상, 티켓 20261026_2030).
 *  null·정수가 아님·1~10 밖이면 태그 없음. */
export function chapterBandTag(chapterNo: number | null | undefined): string | null {
  if (chapterNo === null || chapterNo === undefined || !Number.isInteger(chapterNo)) return null
  return CHAPTER_BANDS.find((band) => chapterNo >= band.min && chapterNo <= band.max)?.tag ?? null
}

export type CapsuleGauge = { filled: number; required: number }

/** 캡슐 게이지 → 태그 (순수 함수, 티켓 20261026_2030). 캡슐이 없거나 required <= 0이면 태그 없음.
 *  filled >= required(초과 포함)면 capsule_full, 비율이 기준 이상이고 아직 안 찼으면 capsule_nearly_full. */
export function capsuleGaugeTag(capsule: CapsuleGauge | null | undefined): string | null {
  if (!capsule || !(capsule.required > 0)) return null
  if (capsule.filled >= capsule.required) return 'capsule_full'
  if (capsule.filled / capsule.required >= CAPSULE_NEARLY_FULL_RATIO) return 'capsule_nearly_full'
  return null
}

/** 잼 잔액 → 태그 (순수 함수, 티켓 20261026_2030). 캡슐 필요량에 대한 배수로 판정하므로
 *  캡슐이 없거나 required <= 0이면 태그 없음. 잔액이 없으면(지갑 행 없음) 0으로 본다. */
export function jamBalanceTag(
  balance: number | null | undefined,
  capsule: { required: number } | null | undefined
): string | null {
  if (!capsule || !(capsule.required > 0)) return null
  const jam = typeof balance === 'number' && Number.isFinite(balance) ? balance : 0
  if (jam >= capsule.required * JAM_PLENTY_MULTIPLE) return 'jam_plenty'
  if (jam < capsule.required * JAM_LOW_FRACTION) return 'jam_low'
  return null
}

/** 인벤토리 남은 칸 → 태그 (순수 함수, 티켓 20261026_2030). 인벤토리 행이 없으면 태그 없음.
 *  남은 칸 0 이하(used > max 포함)는 inventory_full, 1~INVENTORY_LOW_FREE_SLOTS는 inventory_nearly_full. */
export function inventoryRoomTag(
  inventory: { max_slots: number; used_slots: number } | null | undefined
): string | null {
  if (!inventory) return null
  const free = inventory.max_slots - inventory.used_slots
  if (free <= 0) return 'inventory_full'
  if (free <= INVENTORY_LOW_FREE_SLOTS) return 'inventory_nearly_full'
  return null
}

/** 유저의 챕터 번호. 행이 없거나 조회 오류면 null(태그 없음) */
async function getUserChapterNo(userId: string): Promise<number | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_chapters')
    .select('chapter_no')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) console.error('[getUserChapterNo] user_chapters 조회 오류:', error.message)
  return data?.chapter_no ?? null
}

/** 유저의 지금 캡슐. 행이 없거나 조회 오류면 null(캡슐·잼 태그 없음) */
async function getUserCapsule(userId: string): Promise<CapsuleGauge | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_capsules')
    .select('required, filled')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) console.error('[getUserCapsule] user_capsules 조회 오류:', error.message)
  return data ? { required: data.required, filled: data.filled } : null
}

/** 잼 지갑 잔액. 조회 오류면 failed=true(잼 태그만 뺀다), 행이 없으면 balance=null(잔액 0으로 본다) */
async function getJamBalance(userId: string): Promise<{ failed: boolean; balance: number | null }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('jam_wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) console.error('[getJamBalance] jam_wallets 조회 오류:', error.message)
  return { failed: !!error, balance: data?.balance ?? null }
}

/** 유저의 인벤토리 칸 수. 행이 없거나 조회 오류면 null(인벤토리 태그 없음) */
async function getUserInventory(userId: string): Promise<{ max_slots: number; used_slots: number } | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('inventory')
    .select('max_slots, used_slots')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) console.error('[getUserInventory] inventory 조회 오류:', error.message)
  return data ? { max_slots: data.max_slots, used_slots: data.used_slots } : null
}

/** 유저의 소속 트라이브 ID. 조회 오류면 failed=true(트라이브 태그만 뺀다), 온보딩 전이면 tribeId=null */
async function getUserTribeId(userId: string): Promise<{ failed: boolean; tribeId: string | null }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('tribe_id')
    .eq('id', userId)
    .maybeSingle()
  if (error) console.error('[getUserTribeId] users 조회 오류:', error.message)
  return { failed: !!error, tribeId: data?.tribe_id ?? null }
}

/**
 * 유저의 현재 노출조건 태그 집합을 계산한다.
 * 항상 'all' 과 시간대 태그를 포함하고, 자동계산 조건들을 만족하면 추가한다.
 *
 * @param userTribeId 호출부가 users 행을 이미 읽었다면 그 tribe_id(없으면 null). `undefined`일 때만 여기서 읽는다.
 */
export async function computeUserExposureTags(
  userId: string,
  now: Date,
  userCreatedAt?: string | null,
  userTribeId?: string | null,
): Promise<string[]> {
  const tags: string[] = ['all', timeOfDayTag(now)]

  const [participating, endingSoon, itemBookProgress, staleDays, weather, specialDays, chapterNo, capsule, jamWallet, inventory, tribe] =
    await Promise.all([
      hasParticipatingMission(userId),
      hasEndingSoonMission(userId, now),
      getItemBookProgress(userId),
      stravaStaleDays(userId, now),
      getTodayWeather(),
      getTodaySpecialDays(),
      getUserChapterNo(userId),
      getUserCapsule(userId),
      getJamBalance(userId),
      getUserInventory(userId),
      userTribeId === undefined ? getUserTribeId(userId) : { failed: false, tribeId: userTribeId },
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
  // 공휴일·절기·기념일은 이름 목록으로 태그를 나눈다(티켓 20260924_0805)
  tags.push(...specialDayTags(specialDays))

  // JAM 2.0 태그 (티켓 20261026_2030) — 챕터 → 캡슐 → 잼 → 인벤토리 순. 읽기가 실패한 항목은 태그만 빠진다
  const chapterTag = chapterBandTag(chapterNo)
  if (chapterTag) tags.push(chapterTag)
  const capsuleTag = capsuleGaugeTag(capsule)
  if (capsuleTag) tags.push(capsuleTag)
  const jamTag = jamWallet.failed ? null : jamBalanceTag(jamWallet.balance, capsule)
  if (jamTag) tags.push(jamTag)
  const inventoryTag = inventoryRoomTag(inventory)
  if (inventoryTag) tags.push(inventoryTag)

  // 소속 트라이브 태그 (티켓 20261026_2030 2회차) — 소속이 있으면 tribe_<ID> 하나. 읽기가 실패하면 태그만 빠진다
  const tribeTag = tribe.failed ? null : tribeTagOf(tribe.tribeId)
  if (tribeTag) tags.push(tribeTag)

  return tags
}
