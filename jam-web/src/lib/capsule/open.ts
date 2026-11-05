/**
 * 캡슐 열기 — 추첨 결과를 DB에 잇는 서버 모듈 (티켓 20261018_0052 2회, 운영 로직 5.2·6.6절)
 *
 * 순서: 이용 정지 확인 → 캡슐 상태 사전 확인(다 채우지 못했으면 **추첨하지 않는다**) → 정책·카운터·소속 트라이브·후보 조회 → 추첨(`capsuleRoll.ts`)
 * → 빈칸이 뽑힌 개수 이상이면 RPC `capsule_open_counted`(채운 양 확인·빈칸 확인·지급·발급 기록·열기 기록·보정 카운터·다음 캡슐이 한 트랜잭션) → 응답에 개체 정보를 채움 → 후속 처리.
 * 빈칸이 뽑힌 개수보다 적으면 지급하지 않고 RPC `capsule_hold_rolled`로 **뽑은 결과를 대기 보상으로 저장**하고 캡슐을 소진한다(`held: true`, 티켓 20261105_1437 R1).
 *
 * 규칙
 *  - 빈칸 사전 확인은 «뽑힌 개수» 기준이다(나올 수 있는 최대 개수가 아니다). 빈칸이 모자라도 추첨은 한다 — 그 결과를 저장해야 «배지 n개를 얻었다»고 말할 수 있다.
 *    저장할 때 지갑은 건드리지 않는다(남은 잼은 지갑에 남는다). 사전 확인 뒤 경쟁으로 `capsule_open_counted`가 빈칸 부족으로 거절하면 `CapsuleError('insufficient_slots')`를 던지고 캡슐은 가득 찬 채 남는다(다음 동기화가 다시 시도한다).
 *  - 소속 트라이브(`users.tribe_id`)가 없으면 열 수 없다(`no_tribe`). 채운 잼은 그대로 남는다.
 *  - 모든 등급에 후보가 없어 나올 개체가 하나도 없으면 열지 않고 던진다(일반 오류) — 채운 잼이 개체 없이 사라지지 않게 한다.
 *  - 후속 처리(포인트, `recordIssuedRewards`)는 열기가 확정된 뒤에 한다. 잠긴 개체는 포인트에서 빠진다(7.3절, 티켓 20261018_0051).
 *    **캡슐을 열어 나온 아이템 배지는 피드에 올리지 않는다**(운영 로직 15.3절, 2026-10-10 사용자 결정). 열린 개체도 `skipFeed`로 피드를 건너뛴다(티켓 20261021_1249 6-3 5회). 이미 올라간 옛 피드 행은 그대로 둔다.
 *    캡슐에는 대상 활동이 없어 활동 결산 알림은 보내지 않는다. 후속 처리가 실패해도 열기는 되돌리지 않고 로그만 남긴다.
 *  - **열기는 집계 열기 하나뿐이다(티켓 20261028_1742 1회).** 동기화 자동 채움이 부르는 열기이고, RPC는 `capsule_open_counted`(열기와 같은 트랜잭션에서 다음 캡슐 필요량 v2·알림 단계 0)다.
 *    옛 비집계 경로(RPC `capsule_open`과 챕터 점수 «캡슐 열기» `awardChapterScore`)는 걷었다. 챕터 횟수와 오름 판정은 열기가 아니라 `capsule_auto_fill`이 캡슐이 100%에 닿는 시점에 하므로
 *    **여기서는 오름 처리(`processChapterRise`)를 하지 않는다**(`auto-fill.ts`가 한다 — 이중 호출 방지). 응답에는 `chapterNo`·`reachedChapters`·`chapterCount`를 싣는다
 *    (DB가 `reachedChapters`를 항상 빈 배열로 돌려준다).
 *  - 퀘스트 완료 처리는 부르지 않는다(티켓 20261028_1738). 캡슐 열기는 더 이상 퀘스트 단계가 아니다. 퀘스트는 첫 동기화와 잠긴 개체 열기 두 단계라
 *    완료 판정은 동기화(`syncStravaActivities`)와 잠긴 개체 열기(`lockedItemFill.ts`)가 각각 부른다. 이 열기는 두 단계 어느 쪽의 기록도 바꾸지 않는다.
 *  - 다른 트라이브를 고를 때는 후보 배지가 있는 트라이브만 대상이다(`tribesWithCandidates`, 티켓 20261021_1248). 후보가 없는 트라이브가 뽑혀 개체가 비는 일을 없앤다.
 *  - 응답의 잠긴 개체는 이름·그림·일련번호 없이 등급과 여는 데 필요한 양만 싣는다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import { recordIssuedRewards } from '@/lib/drop-engine/issueFollowUp'
import type { IssueBadge, IssueBook, Rand } from '@/lib/drop-engine/syncIssue'
import { logEngineDecision } from '@/lib/engine-log'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import { getJamPolicy } from '@/lib/jam/policy'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import { CapsuleError, getCapsuleState } from './capsule'
import {
  CAPSULE_OPEN_ERROR_CODES,
  type CapsuleHeldPayload,
  type CapsuleOpenErrorCode,
  type CapsuleOpenedItem,
  type CapsuleOpenPayload,
  type CapsuleRarity,
} from './capsule-contract'
import type { LockAssignment, LockReason } from '@/lib/drop-engine/lockAssignment'
import type { BadgeRarity } from '@/types/database'
import { rollCapsule, tribesWithCandidates, type RolledCapsuleItem } from './capsuleRoll'
import { getCapsulePolicy, type CapsulePolicy } from './policy'

/** 발급 기록(`item_issue_log.route`)에 쓰는 경로 값 */
export const CAPSULE_ISSUE_ROUTE = 'capsule'

export interface OpenCapsuleOptions {
  rand?: Rand
  now?: Date
}

/** 열기가 응답에 더하는 챕터 횟수 정보 */
export interface CapsuleCountedInfo {
  /** 횟수를 센 챕터(오르기 전). 센 게 없으면(퀘스트 전 캡슐 등) null */
  chapterNo: number | null
  /** 이번 열기로 오른 챕터 번호 목록(최대 한 칸). 오르지 않았으면 빈 배열 */
  reachedChapters: number[]
  /** 센 뒤의 횟수(오르면 0). 센 게 없으면 null */
  chapterCount: number | null
}

export type CountedCapsuleOpenPayload = CapsuleOpenPayload & CapsuleCountedInfo

type CapsuleBadge = IssueBadge & {
  name: string
  image_url: string | null
  point_reward: number | null
}

export interface DbOpenedItem {
  inventoryItemId?: string
  serialNumber?: number | null
}

interface CapsuleOpenResult {
  ok?: boolean
  error?: string
  free?: number
  needed?: number
  openId?: string
  items?: DbOpenedItem[]
  next?: { required?: number; filled?: number }
  chapterNo?: unknown
  reachedChapters?: unknown
  chapterCount?: unknown
}

/**
 * `capsule_open_counted`의 챕터 정보를 읽는다. 열기는 이미 확정된 뒤라 던지지 않고, 모양이 틀린 칸은 «센 게 없음»으로 본다.
 * 오른 챕터 번호는 1 이상의 정수만 받는다.
 */
function toCountedInfo(result: CapsuleOpenResult): CapsuleCountedInfo {
  const reached = Array.isArray(result.reachedChapters)
    ? (result.reachedChapters as unknown[]).filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1)
    : []
  return {
    chapterNo: typeof result.chapterNo === 'number' ? result.chapterNo : null,
    reachedChapters: reached,
    chapterCount: typeof result.chapterCount === 'number' ? result.chapterCount : null,
  }
}

interface CapsuleHoldResult {
  ok?: boolean
  error?: string
  pendingItemCount?: number
  next?: { required?: number; filled?: number }
}

/**
 * `capsule_hold_rolled` 거절 코드를 `CapsuleError`로 바꾼다. 열기와 같은 코드만 쓴다.
 * `pending_exists`(그 사이 다른 호출이 대기를 만들었다)는 «다시 시도하면 된다»는 `capsule_changed`로 접는다 — 자동 채움은 다음 동기화 맨 앞에서 대기 보상을 보고 멈춘다.
 */
function toHoldError(result: CapsuleHoldResult): Error {
  const code = result.error ?? ''
  if (code === 'pending_exists') return new CapsuleError('capsule_changed')
  if (!(CAPSULE_OPEN_ERROR_CODES as readonly string[]).includes(code)) {
    return new Error(`capsule_hold_rolled가 알 수 없는 거절 코드를 돌려줬다: ${code}`)
  }
  return new CapsuleError(code as CapsuleOpenErrorCode)
}

/** 열기 거절 코드를 `CapsuleError`로 바꾼다. DB 함수가 돌려주는 코드만 받고, 모르는 코드는 일반 오류다. */
function toOpenError(result: CapsuleOpenResult): Error {
  const code = result.error ?? ''
  if (!(CAPSULE_OPEN_ERROR_CODES as readonly string[]).includes(code)) {
    return new Error(`capsule_open_counted가 알 수 없는 거절 코드를 돌려줬다: ${code}`)
  }
  if (code === 'insufficient_slots') {
    return new CapsuleError('insufficient_slots', { freeSlots: result.free ?? 0, neededSlots: result.needed ?? 0 })
  }
  return new CapsuleError(code as CapsuleOpenErrorCode)
}

/**
 * 추첨에 쓸 데이터(트라이브·후보·카운터)를 읽는다. 읽지 못하면 던진다 — 틀린 값으로 추첨하지 않는다.
 * 등급 올리기(`lib/combine/tierUp.ts`, 티켓 20261022_2119 2회)도 같은 풀을 읽으려고 내보낸다.
 */
export async function loadRollData(supabase: SupabaseClient, userId: string) {
  const { data: userRow, error: userError } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
  if (userError) throw new Error(`users 조회 실패: ${userError.message}`)
  const tribeId = (userRow as { tribe_id?: string | null } | null)?.tribe_id ?? null
  if (!tribeId) throw new CapsuleError('no_tribe')

  const { data: tribeRows, error: tribeError } = await supabase.from('tribes').select('id, name')
  if (tribeError) throw new Error(`tribes 조회 실패: ${tribeError.message}`)
  const tribes = (tribeRows ?? []) as { id: string; name: string }[]

  const { data: bookRows, error: bookError } = await supabase
    .from('item_books')
    .select('id, tribe_id, is_active, drop_excluded, valid_from, valid_until')
    .eq('is_active', true)
    .eq('drop_excluded', false)
  if (bookError) throw new Error(`item_books 조회 실패: ${bookError.message}`)
  const books = (bookRows ?? []) as IssueBook[]

  const badges = await fetchAllRowsIn<CapsuleBadge, string>(
    'capsule-open:item-badges',
    'id',
    books.map((b) => b.id),
    (chunk) =>
      supabase
        .from('badges')
        .select(
          'id, name, image_url, rarity, item_book_id, drop_excluded, valid_from, valid_until, deleted_at, point_reward, always_locked, unlock_required'
        )
        .eq('type', 'item')
        .is('deleted_at', null)
        .in('item_book_id', chunk)
  )

  // 읽지 못한 값을 0으로 보고 추첨하면 보정이 틀어진다 — 던진다. 행이 없으면 둘 다 0이다.
  const { data: stateRow, error: stateError } = await supabase
    .from('user_drop_state')
    .select('common_streak, capsule_epic_miss')
    .eq('user_id', userId)
    .maybeSingle()
  if (stateError) throw new Error(`user_drop_state 조회 실패: ${stateError.message}`)
  const state = stateRow as { common_streak?: number | null; capsule_epic_miss?: number | null } | null

  return {
    tribeId,
    tribes,
    books,
    badges,
    commonStreak: Number(state?.common_streak ?? 0) || 0,
    epicMiss: Number(state?.capsule_epic_miss ?? 0) || 0,
  }
}

/** 열린 개체와 잠긴 개체를 응답 모양으로 바꾼다. 잠긴 개체는 이름·그림·일련번호를 싣지 않는다. */
function toOpenedItem(planned: RolledCapsuleItem<CapsuleBadge>, db: DbOpenedItem): CapsuleOpenedItem {
  const inventoryItemId = db.inventoryItemId ?? ''
  const rarity = planned.rarity as CapsuleRarity
  if (planned.lock.locked) {
    return { locked: true, inventoryItemId, rarity, unlockRequired: planned.lock.unlockRequired }
  }
  return {
    locked: false,
    inventoryItemId,
    badgeId: planned.badge.id,
    name: planned.badge.name,
    imageUrl: planned.badge.image_url,
    rarity,
    serialNumber: typeof db.serialNumber === 'number' ? db.serialNumber : null,
  }
}

type CapsuleRollData = Awaited<ReturnType<typeof loadRollData>>
type CapsuleRolled = ReturnType<typeof rollCapsule<CapsuleBadge>>

/**
 * 추첨 한 번(조회 → 추첨 → 후보 없음 기록). 열기(`openCapsule`)와 보류 받기(`claim.ts`)가 같은 추첨을 쓰도록 꺼냈다(티켓 20261028_1734 2회).
 * 나올 개체가 하나도 없으면 던진다 — 채운 잼이 개체 없이 사라지지 않게 한다. `no_tribe`는 `CapsuleError`.
 */
export async function rollCapsuleItems(
  supabase: SupabaseClient,
  userId: string,
  params: { capsulePolicy: CapsulePolicy; preQuest: boolean; rand: Rand; now: Date }
): Promise<{ data: CapsuleRollData; rolled: CapsuleRolled }> {
  const jamPolicy = await getJamPolicy(supabase)
  const data = await loadRollData(supabase, userId)

  const rolled = rollCapsule<CapsuleBadge>(
    {
      policy: { ...params.capsulePolicy, ...jamPolicy },
      tribeId: data.tribeId,
      tribeIds: tribesWithCandidates(data.tribes.map((t) => t.id), data.tribeId, data.books, data.badges, params.now),
      books: data.books,
      badges: data.badges,
      commonStreak: data.commonStreak,
      epicMiss: data.epicMiss,
      preQuest: params.preQuest,
      now: params.now,
    },
    params.rand
  )
  for (const skip of rolled.skipped) {
    console.warn(`[capsule-open] 후보 없음 — 개체 건너뜀 (userId: ${userId}, tribe: ${skip.tribeId}, 뽑힌 등급: ${skip.rolledRarity})`)
    await logEngineDecision('drop', 'drop_attempt', userId, {
      path: CAPSULE_ISSUE_ROUTE,
      outcome: 'no_candidate',
      tribeId: skip.tribeId,
      rolledRarity: skip.rolledRarity,
    })
  }
  if (rolled.items.length === 0) throw new Error('캡슐에서 나올 아이템 배지 후보가 하나도 없어 열지 않았다')
  return { data, rolled }
}

/** 추첨 결과를 RPC `p_items` 모양으로 바꾼다(`capsule_open_counted`·`capsule_claim_pending` 공통) */
export function toRpcItems(rolled: CapsuleRolled) {
  return rolled.items.map((item) => ({
    badge_id: item.badge.id,
    rarity: item.rarity,
    rolled_rarity: item.rolledRarity,
    locked: item.lock.locked,
    lock_reason: item.lock.lockReason,
    unlock_required: item.lock.unlockRequired,
  }))
}

/** 대기 보상 줄에 저장된 추첨 결과 한 항목(`toRpcItems` 모양, 마이그레이션 323 `drawn_items`) */
export interface StoredDrawnItem {
  badge_id: string
  rarity: string
  rolled_rarity?: string | null
  locked?: boolean
  lock_reason?: string | null
  unlock_required?: number | null
}

/**
 * 저장된 추첨 결과(`drawn_items`)를 `recordOpenedItems`가 받는 모양(`rolled.items` + `data.tribes`)으로 되살린다 (티켓 20261105_1438 R2).
 * 추첨은 다시 하지 않는다 — 저장된 `badge_id`로 배지를, 배지의 컬렉션으로 트라이브를 다시 읽어 저장된 등급·잠금을 그대로 얹는다.
 * 배지를 찾지 못하면 던진다(지급 전이라 잃는 것이 없고, 보류 줄은 그대로 남는다).
 */
export async function rebuildRolledFromDrawn(
  supabase: SupabaseClient,
  drawn: readonly StoredDrawnItem[]
): Promise<{ data: Pick<CapsuleRollData, 'tribes'>; rolled: Pick<CapsuleRolled, 'items'> }> {
  const badgeIds = [...new Set(drawn.map((d) => d.badge_id))]
  const { data: badgeRows, error: badgeError } = await supabase
    .from('badges')
    .select(
      'id, name, image_url, rarity, item_book_id, drop_excluded, valid_from, valid_until, deleted_at, point_reward, always_locked, unlock_required'
    )
    .in('id', badgeIds)
  if (badgeError) throw new Error(`badges 조회 실패: ${badgeError.message}`)
  const badgeOf = new Map(((badgeRows ?? []) as CapsuleBadge[]).map((b) => [b.id, b]))

  const bookIds = [...new Set([...badgeOf.values()].map((b) => b.item_book_id).filter((id): id is string => typeof id === 'string'))]
  const { data: bookRows, error: bookError } =
    bookIds.length === 0 ? { data: [], error: null } : await supabase.from('item_books').select('id, tribe_id').in('id', bookIds)
  if (bookError) throw new Error(`item_books 조회 실패: ${bookError.message}`)
  const tribeOfBook = new Map(((bookRows ?? []) as { id: string; tribe_id: string | null }[]).map((b) => [b.id, b.tribe_id]))

  const tribeIds = [...new Set([...tribeOfBook.values()].filter((id): id is string => typeof id === 'string'))]
  const { data: tribeRows, error: tribeError } =
    tribeIds.length === 0 ? { data: [], error: null } : await supabase.from('tribes').select('id, name').in('id', tribeIds)
  if (tribeError) throw new Error(`tribes 조회 실패: ${tribeError.message}`)

  const items: RolledCapsuleItem<CapsuleBadge>[] = drawn.map((d) => {
    const badge = badgeOf.get(d.badge_id)
    if (!badge) throw new Error(`저장된 대기 보상의 배지를 찾지 못했다 (badge_id: ${d.badge_id})`)
    const lock: LockAssignment = d.locked
      ? { locked: true, lockReason: (d.lock_reason ?? 'rolled') as LockReason, unlockRequired: Number(d.unlock_required ?? 0) }
      : { locked: false, lockReason: null, unlockRequired: null }
    return {
      badge,
      tribeId: (badge.item_book_id && tribeOfBook.get(badge.item_book_id)) || '',
      rarity: d.rarity as BadgeRarity,
      rolledRarity: (d.rolled_rarity || d.rarity) as BadgeRarity,
      lock,
    }
  })
  return { data: { tribes: (tribeRows ?? []) as { id: string; name: string }[] }, rolled: { items } }
}

/**
 * 확정된 개체를 응답 모양으로 바꾸고 개체마다 후속 처리(포인트, `recordIssuedRewards`)를 한다. 후속 처리가 던져도 지급은 유지된다.
 * 열기와 보류 받기가 같이 쓴다.
 */
export async function recordOpenedItems(
  userId: string,
  data: Pick<CapsuleRollData, 'tribes'>,
  rolled: Pick<CapsuleRolled, 'items'>,
  dbItems: readonly DbOpenedItem[]
): Promise<CapsuleOpenedItem[]> {
  const tribeNameOf = new Map(data.tribes.map((t) => [t.id, t.name]))
  const items: CapsuleOpenedItem[] = []
  for (const [index, planned] of rolled.items.entries()) {
    const db = dbItems[index] ?? {}
    items.push(toOpenedItem(planned, db))
    if (!db.inventoryItemId) continue
    try {
      await recordIssuedRewards({
        userId,
        stravaId: null,
        startDate: null,
        tribeName: tribeNameOf.get(planned.tribeId) ?? '',
        inventoryItemId: db.inventoryItemId,
        badge: planned.badge,
        rarity: planned.rarity,
        locked: planned.lock.locked,
        // 캡슐을 열어 나온 아이템 배지는 피드에 올리지 않는다(운영 로직 15.3절, 2026-10-10 사용자 결정 — 티켓 20261021_1249 6-3 5회에서 코드를 맞췄다). 포인트는 그대로 준다
        skipFeed: true,
      })
    } catch (e) {
      console.error(`[capsule-open] 후속 처리 실패 — 열기는 유지한다 (userId: ${userId}, badge_id: ${planned.badge.id}):`, e)
    }
  }
  return items
}

/**
 * 뽑은 결과를 대기 보상으로 저장한다(`capsule_hold_rolled`: 보류 줄 저장·캡슐 소진·새 캡슐이 한 트랜잭션). 지갑은 건드리지 않는다.
 * 개체는 지급되지 않으므로 포인트·발급 후속 처리와 «보지 않은 결과»는 만들지 않는다 — 받는 시점이 한다.
 */
async function holdRolledItems(
  supabase: SupabaseClient,
  userId: string,
  rpcItems: ReturnType<typeof toRpcItems>,
  chapterNo: number | null
): Promise<CapsuleHeldPayload> {
  const rpcName = 'capsule_hold_rolled'
  const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, { p_user_id: userId, p_items: rpcItems })
  if (rpcError) throw new Error(`${rpcName} RPC 오류: ${rpcError.message}`)
  const result = rpcData as CapsuleHoldResult | null
  if (result?.ok === false) throw toHoldError(result)
  if (
    result?.ok !== true ||
    typeof result.pendingItemCount !== 'number' ||
    typeof result.next?.required !== 'number' ||
    typeof result.next.filled !== 'number'
  ) {
    throw new Error(`${rpcName}이 해석할 수 없는 응답을 돌려줬다`)
  }

  try {
    await logEngineDecision('drop', 'drop_attempt', userId, {
      path: CAPSULE_ISSUE_ROUTE,
      outcome: 'held',
      count: result.pendingItemCount,
      preQuest: chapterNo === null,
    })
  } catch (e) {
    console.error(`[capsule-open] 판정 로그 실패 — 보류는 유지한다 (userId: ${userId}):`, e)
  }

  return { held: true, drawnCount: result.pendingItemCount, next: { required: result.next.required, filled: result.next.filled } }
}

/**
 * 캡슐을 연다. 빈칸이 뽑힌 개수보다 적으면 지급하지 않고 뽑은 결과를 대기 보상으로 저장해 `CapsuleHeldPayload`(`held: true`)를 돌려준다.
 * 던지는 것: `UserSuspendedError`(정지), `CapsuleError`(`not_full`·`insufficient_slots`(경쟁으로 거절된 경우만)·`no_tribe`·DB 거절), 그 밖의 일반 오류.
 * 열렸다면 응답에는 챕터 횟수 정보가 더해진다(파일 머리말).
 */
export async function openCapsule(
  supabase: SupabaseClient,
  userId: string,
  options: OpenCapsuleOptions = {}
): Promise<CountedCapsuleOpenPayload | CapsuleHeldPayload> {
  const rpcName = 'capsule_open_counted'
  const rand = options.rand ?? Math.random
  const now = options.now ?? new Date()

  await assertNotSuspended(supabase, userId)

  // 사전 확인 — 다 채우지 못했으면 추첨하지 않는다
  const capsulePolicy = await getCapsulePolicy(supabase)
  const { status, chapterNo } = await getCapsuleState(supabase, userId, capsulePolicy)
  if (status.notOpenableReason === 'not_full') throw new CapsuleError('not_full')

  const { data, rolled } = await rollCapsuleItems(supabase, userId, { capsulePolicy, preQuest: chapterNo === null, rand, now })
  const rpcItems = toRpcItems(rolled)

  // 빈칸이 뽑힌 개수보다 적으면 지급하지 않고 결과를 대기 보상으로 저장한다(빈칸을 읽지 못했다면 DB 함수가 판정한다)
  if (typeof status.freeSlots === 'number' && status.freeSlots < rpcItems.length) {
    return await holdRolledItems(supabase, userId, rpcItems, chapterNo)
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(rpcName, {
    p_user_id: userId,
    p_items: rpcItems,
  })
  if (rpcError) throw new Error(`${rpcName} RPC 오류: ${rpcError.message}`)
  const result = rpcData as CapsuleOpenResult | null
  if (result?.ok === false) throw toOpenError(result)
  if (
    result?.ok !== true ||
    typeof result.openId !== 'string' ||
    !Array.isArray(result.items) ||
    typeof result.next?.required !== 'number' ||
    typeof result.next.filled !== 'number'
  ) {
    throw new Error(`${rpcName}이 해석할 수 없는 응답을 돌려줬다`)
  }

  // 여기부터는 열기가 확정됐다. 어떤 실패도 열기를 되돌리지 않는다.
  // 챕터 횟수와 오름 판정은 열기가 아니라 `capsule_auto_fill`이 캡슐이 100%에 닿는 시점에 한다(티켓 20261028_1734 2회).
  // 그래서 여기서는 오름 처리(`processChapterRise`)를 부르지 않는다 — 부르면 `runCapsuleAutoFill`의 오름 처리와 이중 호출이 된다.
  const countedInfo = toCountedInfo(result)
  const items = await recordOpenedItems(userId, data, rolled, result.items)

  // 열어서 받은 만큼 칸이 찼으니 남은 칸 알림을 검사한다(티켓 20261018_0056). 던지지 않는다.
  await notifyInventorySlotsLow(userId, supabase)

  try {
    await logEngineDecision('drop', 'drop_attempt', userId, {
      path: CAPSULE_ISSUE_ROUTE,
      outcome: 'opened',
      openId: result.openId,
      count: items.length,
      preQuest: chapterNo === null,
    })
  } catch (e) {
    console.error(`[capsule-open] 판정 로그 실패 — 열기는 유지한다 (userId: ${userId}):`, e)
  }

  return { openId: result.openId, items, next: { required: result.next.required, filled: result.next.filled }, ...countedInfo }
}
