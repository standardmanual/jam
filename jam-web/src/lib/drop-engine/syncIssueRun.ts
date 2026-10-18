/**
 * 동기화 아이템 배지 발급 — 판정 결과를 DB에 잇는 서버 모듈 (티켓 20261017_1424 2회, 운영 로직 6.2·6.6절)
 *
 * 개수·등급·후보 판정은 순수 모듈(`syncIssue.ts`)이 하고, 이 모듈은 조회·지급·기록만 한다.
 * 동기화(`strava/sync.ts`)가 잼 정산을 마친 뒤 **정산한 모든 활동**에 대해 부른다(3건 상한 없음, 첫 동기화는 정산이 이미 최근 1건).
 *
 * 규칙
 *  - 소속 트라이브(`users.tribe_id`)가 없으면 아이템 배지만 건너뛴다(로그). 잼 정산 등 다른 보상은 이 모듈 밖이라 그대로다.
 *  - 계획 → 지급 또는 보류(티켓 20261017_1425, 운영 로직 6.4절). 먼저 정산한 모든 활동의 개수·등급·후보를 굴려 이번 동기화의
 *    발급 목록을 만든다. 목록 전체가 빈칸(`max_slots - used_slots`) 이하이면 `grant_inventory_item_locked` RPC로 바로 지급한다(잠김 배정은 아래 규칙).
 *    빈칸보다 많으면 **하나도 지급하지 않고 전부** `sync_pending_items`(status pending)에 넣는다. 유저가 빈칸만큼 고른다
 *    (`resolve_sync_pending_items`, `lib/strava/pending-items.ts`). 지급 도중 경합으로 `slot_full`이 나면 그 개체와 남은 개체도 보류한다.
 *  - 동기화로 받은 배지의 기한을 공개 종료일로 두지 않는다(`p_expires_at` null). 공개 기간이 끝난 배지는 후보에서 빠진다.
 *  - `user_drop_state.common_streak`를 갱신한다(없는 행은 만든다). 줄 때 받은 **실제 등급**이 Common이면 +1, 아니면 0이다.
 *    계획 단계에서 굴린 순서대로 이어 센다. 후보가 없어 건너뛴 개체는 세지 않는다. 보류한 개체도 센다(받을 개체가 정해진 것이다).
 *  - 줄 때마다 `item_issue_log`에 한 줄(경로 `sync`, 대상 활동, 배지, 등급, `rolled_rarity`, 잠김 여부, 일련번호, 개체 id)을 남긴다.
 *    기록 실패는 지급과 동기화를 막지 않는다.
 *  - 잠김 배정(티켓 20261018_0051, 운영 로직 7.5절): 계획 단계에서 개체마다 `assignLock`(경로 `sync`)으로 잠김·까닭·필요한 양을 정한다.
 *    지급은 `grant_inventory_item_locked`로 개체에 저장하고, 보류는 `locked`·`lock_reason`·`unlock_required`로 저장해 고르기 RPC가 개체로 옮긴다.
 *    발급 기록 `item_issue_log.locked`에도 같은 값을 적는다. 잠긴 채 받은 개체는 포인트를 주지 않는다(연 때 주는 것은 3-3).
 *  - 활동 하나의 실패는 그 활동만 건너뛰고 `onActivityError`로 알린다. 던지지 않는다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 * 옛 드랍 엔진(`index.ts`)의 함수·상수는 호출하지 않는다 — 트라이브를 고르는 규칙·등급 보정 셋·컬렉션 쪽 보정이 거기 있다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import { logEngineDecision } from '@/lib/engine-log'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import { recordIssuedRewards } from './issueFollowUp'
import { assignLock, type LockAssignment, type LockPolicy } from './lockAssignment'
import type { GrantInventoryItemResult } from '@/lib/inventory/slots'
import type { JamPolicy } from '@/lib/jam/policy'
import { recordActivityRecap } from '@/lib/notifications/recap'
import type { RecapItemBadge } from '@/lib/notifications/types'
import {
  pickWithRarityFallback,
  rollItemCount,
  rollRarity,
  type IssueBadge,
  type IssueBook,
  type Rand,
} from './syncIssue'

/** 발급 기록(`item_issue_log.route`)에 쓰는 경로 값 */
export const SYNC_ISSUE_ROUTE = 'sync'

/** 정산을 마친 활동 1건 — 개수 계산에 필요한 값만 담는다 */
export interface SyncIssueTarget {
  /** Strava 활동 id (피드 귀속용) */
  stravaId: number
  /** `strava_activities.id` — 발급 기록의 대상 활동 */
  activityId: string
  /** 활동 시작 시각(UTC ISO) */
  startDate: string
  /** 그 활동의 정산 잼 */
  jam: number
  /** `jamActivityType === 'hiking'` */
  isHiking: boolean
}

export interface SyncIssueOptions {
  rand?: Rand
  now?: Date
  /** 활동 하나의 발급이 던졌을 때 부른다. 호출부가 실패 기록을 남긴다. 이 콜백이 던져도 무시한다. */
  onActivityError?: (target: SyncIssueTarget, error: unknown) => Promise<void> | void
}

/** 발급 결과 — 바로 지급한 배지 id와 보류한 개수 */
export interface SyncIssueOutcome {
  /** 이번 호출에서 실제로 지급된 배지 id (지급 순서, 없으면 빈 배열) */
  issuedBadgeIds: string[]
  /** 이번 호출에서 새로 보류한 아이템 배지 개수. 0이면 보류가 없다 */
  pendingCount: number
}

/** 계획 단계가 정한 개체 1개 — 지급하거나 보류한다 */
interface PlannedItem {
  /** `ordered`에서 이 개체가 속한 활동의 위치 */
  activityIndex: number
  badge: SyncIssueBadge
  /** 실제 받는 등급 */
  rarity: NonNullable<IssueBadge['rarity']>
  /** 처음 뽑힌 등급 */
  rolledRarity: NonNullable<IssueBadge['rarity']>
  /** 이 개체까지 세었을 때의 `common_streak` */
  streakAfter: number
  /** 계획 단계에서 정한 잠김(티켓 20261018_0051). 지급·보류·발급 기록이 같은 값을 쓴다 */
  lock: LockAssignment
}

type SyncIssueBadge = IssueBadge & {
  name: string
  image_url: string | null
  point_reward: number | null
}

type SyncPolicy = Pick<
  JamPolicy,
  | 'sync_item_guaranteed'
  | 'sync_item_guaranteed_hiking'
  | 'sync_item_bonus_rolls'
  | 'sync_item_bonus_jam_divisor'
  | 'sync_item_bonus_max_probability'
  | 'sync_rarity_common'
  | 'sync_rarity_rare'
  | 'sync_rarity_epic'
  | 'sync_rarity_mystic'
  | 'common_streak_threshold'
> &
  LockPolicy

/** 드랍 없이 끝난 이유를 엔진 판정 로그(`drop_attempt`)에 남긴다. 로그 실패는 흐름을 막지 않는다(`logEngineDecision`이 삼킨다). */
async function logOutcome(userId: string, outcome: string, extra: Record<string, unknown> = {}): Promise<void> {
  await logEngineDecision('drop', 'drop_attempt', userId, { path: SYNC_ISSUE_ROUTE, outcome, ...extra })
}

/**
 * 정산한 활동들에 아이템 배지를 발급한다. 먼저 이번 동기화의 발급 목록 전체를 만들고(계획), 빈칸에 들어가면 지급하고 모자라면 보류한다.
 * @returns 바로 지급한 배지 id(지급 순서)와 새로 보류한 개수
 */
export async function issueSyncItemBadges(
  supabase: SupabaseClient,
  userId: string,
  policy: SyncPolicy,
  targets: readonly SyncIssueTarget[],
  options: SyncIssueOptions = {}
): Promise<SyncIssueOutcome> {
  const outcome: SyncIssueOutcome = { issuedBadgeIds: [], pendingCount: 0 }
  if (targets.length === 0) return outcome
  const rand = options.rand ?? Math.random
  const now = options.now ?? new Date()

  // ① 소속 트라이브 — 없으면 아이템 배지만 건너뛴다
  const { data: userRow, error: userError } = await supabase.from('users').select('tribe_id').eq('id', userId).maybeSingle()
  if (userError) {
    console.error(`[syncIssue] 소속 트라이브 조회 실패 — 아이템 배지 발급 건너뜀 (userId: ${userId}):`, userError)
    await logOutcome(userId, 'tribe_lookup_failed')
    return outcome
  }
  const tribeId = (userRow as { tribe_id?: string | null } | null)?.tribe_id ?? null
  if (!tribeId) {
    console.info(`[syncIssue] 소속 트라이브 없음 — 아이템 배지 발급 건너뜀 (userId: ${userId}, 대상 활동 ${targets.length}건)`)
    await logOutcome(userId, 'no_tribe', { activities: targets.length })
    return outcome
  }

  // ② 활동마다 개수 — 오래된 활동부터 처리한다(지급 순서가 시간 순서가 되게)
  const ordered = [...targets].sort(
    (a, b) => Date.parse(a.startDate) - Date.parse(b.startDate) || a.stravaId - b.stravaId
  )
  const counts = ordered.map((t) => rollItemCount(policy, { jam: t.jam, isHiking: t.isHiking }, rand))
  if (counts.every((c) => c === 0)) return outcome

  // ③ 인벤토리·후보·보정 카운터를 한 번만 읽는다
  const { data: inventoryRaw } = await supabase.from('inventory').select('id, used_slots, max_slots').eq('user_id', userId).maybeSingle()
  const inventory = inventoryRaw as { id: string; used_slots: number; max_slots: number } | null
  if (!inventory) {
    console.error(`[syncIssue] 인벤토리 없음 (userId: ${userId})`)
    await logOutcome(userId, 'no_inventory')
    return outcome
  }

  let books: IssueBook[]
  let badges: SyncIssueBadge[]
  try {
    const { data: bookRows, error: bookError } = await supabase
      .from('item_books')
      .select('id, tribe_id, is_active, drop_excluded, valid_from, valid_until')
      .eq('tribe_id', tribeId)
    if (bookError) throw new Error(`item_books 조회 실패: ${bookError.message}`)
    books = (bookRows ?? []) as IssueBook[]
    badges =
      books.length === 0
        ? []
        : await fetchAllRows<SyncIssueBadge>('sync-issue:item-badges', 'id', () =>
            supabase
              .from('badges')
              .select(
                'id, name, image_url, rarity, item_book_id, drop_excluded, valid_from, valid_until, deleted_at, point_reward, always_locked, unlock_required'
              )
              .eq('type', 'item')
              .is('deleted_at', null)
              .in('item_book_id', books.map((b) => b.id))
          )
  } catch (e) {
    console.error(`[syncIssue] 발급 후보 조회 실패 — 아이템 배지 발급 건너뜀 (userId: ${userId}):`, e)
    await logOutcome(userId, 'candidate_lookup_failed')
    return outcome
  }

  const { data: stateRow, error: stateError } = await supabase
    .from('user_drop_state')
    .select('common_streak')
    .eq('user_id', userId)
    .maybeSingle()
  if (stateError) {
    // 읽지 못한 값을 0으로 보고 덮어쓰면 연속 기록이 사라진다 — 이번 동기화는 값을 쓰지 않는다
    console.error(`[syncIssue] common_streak 조회 실패 — 값은 갱신하지 않는다 (userId: ${userId}):`, stateError)
  }
  const streakWritable = !stateError
  let commonStreak = Number((stateRow as { common_streak?: number } | null)?.common_streak ?? 0) || 0

  const { data: tribeRow } = await supabase.from('tribes').select('name').eq('id', tribeId).maybeSingle()
  const tribeName = (tribeRow as { name?: string } | null)?.name ?? ''

  /** 값을 쓴다. 없는 행은 upsert가 만든다. 던지지 않는다. */
  const saveStreak = async (value: number): Promise<void> => {
    if (!streakWritable) return
    try {
      const { error } = await supabase
        .from('user_drop_state')
        .upsert({ user_id: userId, common_streak: value, updated_at: new Date().toISOString() })
      if (error) console.error(`[syncIssue] common_streak 저장 실패 (userId: ${userId}):`, error)
    } catch (e) {
      console.error(`[syncIssue] common_streak 저장 예외 (userId: ${userId}):`, e)
    }
  }

  // ④ 계획 — 이번 동기화에서 받을 개체 전체를 먼저 정한다(지급·보류는 그 뒤)
  const planned: PlannedItem[] = []
  for (let index = 0; index < ordered.length; index++) {
    for (let i = 0; i < counts[index]; i++) {
      const rolled = rollRarity(policy, commonStreak, rand)
      const pick = pickWithRarityFallback<SyncIssueBadge>(
        { tribeId, rolledRarity: rolled.rarity, books, badges, now },
        rand
      )
      if (!pick) {
        // 모든 등급에 후보가 없다 — 이 개체는 건너뛴다
        console.warn(`[syncIssue] 후보 없음 — 개체 건너뜀 (userId: ${userId}, tribe: ${tribeId}, 뽑힌 등급: ${rolled.rarity})`)
        await logOutcome(userId, 'no_candidate', { attempt: i, rolledRarity: rolled.rarity, tribeId })
        continue
      }
      // 받은 실제 등급 기준으로 센다 — 뽑힌 등급이 높아도 Common을 받았다면 Common 연속이다
      commonStreak = pick.rarity === 'common' ? commonStreak + 1 : 0
      // 잠김은 받은 실제 등급 기준으로 정한다. 동기화 경로라 잠김으로 만든 배지는 늘 잠기고 그 밖에는 설정 확률로 정한다
      const lock = assignLock(
        {
          alwaysLocked: pick.badge.always_locked ?? false,
          unlockRequired: pick.badge.unlock_required ?? null,
          rarity: pick.rarity,
          route: 'sync',
        },
        policy,
        rand
      )
      planned.push({
        activityIndex: index,
        badge: pick.badge,
        rarity: pick.rarity,
        rolledRarity: pick.rolledRarity,
        streakAfter: commonStreak,
        lock,
      })
    }
  }
  if (planned.length === 0) return outcome
  const finalStreak = planned[planned.length - 1].streakAfter

  /** 보류에 넣는다. 던지지 않고, 실패하면 첫 개체의 활동으로 `onActivityError`에 알린다. 성공 여부를 돌려준다. */
  const persistPending = async (items: readonly PlannedItem[]): Promise<boolean> => {
    try {
      const { error } = await supabase.from('sync_pending_items').insert(
        items.map((item) => ({
          user_id: userId,
          source_activity_id: ordered[item.activityIndex].activityId,
          badge_id: item.badge.id,
          rarity: item.rarity,
          rolled_rarity: item.rolledRarity,
          locked: item.lock.locked,
          lock_reason: item.lock.lockReason,
          unlock_required: item.lock.unlockRequired,
        }))
      )
      if (error) throw new Error(`sync_pending_items 저장 실패: ${error.message}`)
      outcome.pendingCount = items.length
      await logOutcome(userId, 'pending', {
        pendingCount: items.length,
        usedSlots: inventory.used_slots,
        maxSlots: inventory.max_slots,
        tribeId,
      })
      return true
    } catch (e) {
      console.error(`[syncIssue] 보류 저장 실패 — 받을 아이템 배지 ${items.length}개를 잃었다 (userId: ${userId}):`, e)
      try {
        await options.onActivityError?.(ordered[items[0].activityIndex], e)
      } catch {
        // 실패 기록이 실패해도 흐름을 막지 않는다
      }
      return false
    }
  }

  // ⑤ 전체가 빈칸보다 많으면 하나도 지급하지 않고 전부 보류한다
  const freeSlots = Math.max(0, inventory.max_slots - inventory.used_slots)
  if (planned.length > freeSlots) {
    console.info(
      `[syncIssue] 빈칸 부족 — 전부 보류 (userId: ${userId}, 받을 ${planned.length}개, 빈칸 ${freeSlots}개)`
    )
    if (await persistPending(planned)) await saveStreak(finalStreak)
    return outcome
  }

  // ⑥ 빈칸에 다 들어간다 — 활동마다 바로 지급한다. 경합으로 slot_full이 나면 그 개체와 남은 개체는 보류한다.
  const spill: PlannedItem[] = []
  let slotFull = false
  for (let index = 0; index < ordered.length; index++) {
    const group = planned.filter((p) => p.activityIndex === index)
    if (group.length === 0) continue
    if (slotFull) {
      spill.push(...group)
      continue
    }

    const target = ordered[index]
    const recapItems: RecapItemBadge[] = []
    let streakToSave: number | null = null
    try {
      let skipRest = false
      for (const [i, item] of group.entries()) {
        if (slotFull) {
          spill.push(item)
          continue
        }
        if (skipRest) continue

        // 잠김과 지급을 한 트랜잭션으로 저장한다(마이그레이션 231). 열린 개체(p_locked false)는 옛 지급과 같다
        const { data: rpcResult, error: rpcError } = await supabase.rpc('grant_inventory_item_locked', {
          p_inventory_id: inventory.id,
          p_badge_id: item.badge.id,
          p_obtained_by: 'drop',
          p_expires_at: null,
          p_locked: item.lock.locked,
          p_lock_reason: item.lock.lockReason,
          p_unlock_required: item.lock.unlockRequired,
        })
        const grant: GrantInventoryItemResult = rpcError
          ? { ok: false, reason: 'inventory_not_found' }
          : (rpcResult as GrantInventoryItemResult)
        if (rpcError) console.error(`[syncIssue] grant_inventory_item_locked RPC 오류 (badge_id: ${item.badge.id}):`, rpcError)
        if (!grant.ok) {
          if (grant.reason === 'slot_full') {
            slotFull = true
            spill.push(item)
          } else {
            skipRest = true
          }
          await logOutcome(userId, grant.reason === 'slot_full' ? 'slot_full' : 'insert_failed', {
            attempt: i,
            badgeId: item.badge.id,
            rolledRarity: item.rolledRarity,
          })
          continue
        }
        outcome.issuedBadgeIds.push(item.badge.id)
        streakToSave = item.streakAfter
        // 잠긴 채 받은 개체는 결산 알림에 이름·등급을 싣지 않는다(운영 로직 7.3절, 티켓 20261018_0051)
        recapItems.push(
          item.lock.locked
            ? { inventory_item_id: grant.itemId, badge_id: '', name: '', rarity: null, locked: true }
            : { inventory_item_id: grant.itemId, badge_id: item.badge.id, name: item.badge.name, rarity: item.rarity }
        )

        await recordIssued({
          supabase,
          userId,
          target,
          tribeName,
          inventoryItemId: grant.itemId,
          badge: item.badge,
          rarity: item.rarity,
          rolledRarity: item.rolledRarity,
          locked: item.lock.locked,
        })
        await logOutcome(userId, 'issued', {
          attempt: i,
          badgeId: item.badge.id,
          rarity: item.rarity,
          rolledRarity: item.rolledRarity,
          tribeId,
          activityId: target.activityId,
          locked: item.lock.locked,
        })
      }
    } catch (e) {
      console.error(`[syncIssue] 활동 발급 실패 — userId: ${userId}, stravaId: ${target.stravaId}:`, e)
      try {
        await options.onActivityError?.(target, e)
      } catch {
        // 실패 기록이 실패해도 다음 활동으로 계속한다
      }
    }

    if (streakToSave !== null) await saveStreak(streakToSave)
    if (recapItems.length > 0) {
      try {
        await recordActivityRecap(userId, { activity_ids: [target.stravaId], item_badges: recapItems })
      } catch (e) {
        console.error(`[syncIssue] 결산 알림 기록 실패 (userId: ${userId}):`, e)
      }
    }
  }

  if (spill.length > 0) {
    console.info(`[syncIssue] 지급 도중 슬롯 초과 — 남은 ${spill.length}개 보류 (userId: ${userId})`)
    if (await persistPending(spill)) await saveStreak(finalStreak)
  }

  // 바로 지급한 것이 있으면 남은 칸 알림을 검사한다(티켓 20261018_0056). 실패해도 던지지 않는다.
  if (outcome.issuedBadgeIds.length > 0) await notifyInventorySlotsLow(userId, supabase)

  return outcome
}

interface RecordIssuedInput {
  supabase: SupabaseClient
  userId: string
  target: SyncIssueTarget
  tribeName: string
  inventoryItemId: string
  badge: SyncIssueBadge
  rarity: NonNullable<IssueBadge['rarity']>
  rolledRarity: NonNullable<IssueBadge['rarity']>
  /** 지급한 개체가 잠긴 채인가 — 발급 기록에 적고, 잠긴 개체는 포인트를 주지 않는다 */
  locked: boolean
}

/**
 * 지급 뒤의 곁다리 — 잼 연계 포인트·피드(`issueFollowUp.ts`, 보류에서 받은 개체와 공용), 발급 기록. 지급은 이미 끝났으므로 여기서 던지지 않는다.
 * 포인트 규칙은 옛 지급과 같다(`badge.point_reward`가 있으면 1회 지급, 14장·묶음 5에서 바뀐다).
 */
async function recordIssued(input: RecordIssuedInput): Promise<void> {
  const { supabase, userId, target, badge } = input

  await recordIssuedRewards({
    userId,
    stravaId: target.stravaId,
    startDate: target.startDate,
    tribeName: input.tribeName,
    inventoryItemId: input.inventoryItemId,
    badge,
    rarity: input.rarity,
    locked: input.locked,
  })

  // 발급 기록 — 실패해도 지급과 동기화를 막지 않는다
  try {
    let serial: number | null = null
    const { data: itemRow, error: serialError } = await supabase
      .from('inventory_items')
      .select('serial_number')
      .eq('id', input.inventoryItemId)
      .maybeSingle()
    if (serialError) console.error(`[syncIssue] 일련번호 조회 실패 (item: ${input.inventoryItemId}):`, serialError)
    const rawSerial = (itemRow as { serial_number?: number } | null)?.serial_number
    if (typeof rawSerial === 'number') serial = rawSerial

    const { error: logError } = await supabase.from('item_issue_log').insert({
      user_id: userId,
      inventory_item_id: input.inventoryItemId,
      route: SYNC_ISSUE_ROUTE,
      source_activity_id: target.activityId,
      badge_id: badge.id,
      rarity: input.rarity,
      rolled_rarity: input.rolledRarity,
      locked: input.locked,
      serial_number: serial,
    })
    if (logError) console.error(`[syncIssue] 발급 기록 실패 (badge_id: ${badge.id}):`, logError)
  } catch (e) {
    console.error(`[syncIssue] 발급 기록 예외 (badge_id: ${badge.id}):`, e)
  }
}
