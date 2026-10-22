/**
 * 캡슐 열기 — 추첨 결과를 DB에 잇는 서버 모듈 (티켓 20261018_0052 2회, 운영 로직 5.2·6.6절)
 *
 * 순서: 이용 정지 확인 → 캡슐 상태와 빈칸 사전 확인(안 되면 **추첨하지 않는다**) → 정책·카운터·소속 트라이브·후보 조회 → 추첨(`capsuleRoll.ts`)
 * → RPC `capsule_open`(채운 양 확인·빈칸 확인·지급·발급 기록·열기 기록·보정 카운터·다음 캡슐이 한 트랜잭션) → 응답에 개체 정보를 채움 → 후속 처리.
 *
 * 규칙
 *  - 사전 확인은 «추첨 난수와 후보 조회를 낭비하지 않기» 위한 것이고 최종 판정은 DB 함수가 한다. 사전 확인 뒤 경쟁으로 거절되어도 같은 `CapsuleError`다.
 *  - 소속 트라이브(`users.tribe_id`)가 없으면 열 수 없다(`no_tribe`). 채운 잼은 그대로 남는다.
 *  - 모든 등급에 후보가 없어 나올 개체가 하나도 없으면 열지 않고 던진다(일반 오류) — 채운 잼이 개체 없이 사라지지 않게 한다.
 *  - 후속 처리(포인트, `recordIssuedRewards`)는 열기가 확정된 뒤에 한다. 잠긴 개체는 포인트에서 빠진다(7.3절, 티켓 20261018_0051).
 *    **캡슐을 열어 나온 아이템 배지는 피드에 올리지 않는다**(운영 로직 15.3절, 2026-10-10 사용자 결정). 열린 개체도 `skipFeed`로 피드를 건너뛴다(티켓 20261021_1249 6-3 5회). 이미 올라간 옛 피드 행은 그대로 둔다.
 *    캡슐에는 대상 활동이 없어 활동 결산 알림은 보내지 않는다. 후속 처리가 실패해도 열기는 되돌리지 않고 로그만 남긴다.
 *  - 열기가 확정되면 챕터 점수 «캡슐 열기»를 센다(`lib/chapter/score.ts`, 원천 id = 열기 기록 id, 티켓 20261019_1315). 점수 실패는 기록만 남고 열기와 응답을 바꾸지 않는다.
 *  - 그 다음 퀘스트 완료 처리를 부른다(티켓 20261021_1248, 운영 로직 2.2절). 실제 단계 ② «캡슐 열기»가 여기서 끝날 수 있고, 실제 3단계가 다 끝났으면 챕터 1이 시작된다.
 *    점수 다음이라 퀘스트 전에 쌓인 점수가 챕터 1 시작 때 함께 계산된다. 던지지 않고, 어떤 실패도 열기와 응답을 바꾸지 않는다(응답에 완료 배지를 싣지 않는다).
 *  - 다른 트라이브를 고를 때는 후보 배지가 있는 트라이브만 대상이다(`tribesWithCandidates`, 티켓 20261021_1248). 후보가 없는 트라이브가 뽑혀 개체가 비는 일을 없앤다.
 *  - 응답의 잠긴 개체는 이름·그림·일련번호 없이 등급과 여는 데 필요한 양만 싣는다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { awardChapterScore } from '@/lib/chapter/score'
import { fetchAllRowsIn } from '@/lib/db/fetchAllRows'
import { recordIssuedRewards } from '@/lib/drop-engine/issueFollowUp'
import type { IssueBadge, IssueBook, Rand } from '@/lib/drop-engine/syncIssue'
import { logEngineDecision } from '@/lib/engine-log'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import { getJamPolicy } from '@/lib/jam/policy'
import { recordOnboardingQuestCompletion } from '@/lib/onboarding-quest/completion'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import { CapsuleError, getCapsuleState } from './capsule'
import {
  CAPSULE_OPEN_ERROR_CODES,
  type CapsuleOpenErrorCode,
  type CapsuleOpenedItem,
  type CapsuleOpenPayload,
  type CapsuleRarity,
} from './capsule-contract'
import { rollCapsule, tribesWithCandidates, type RolledCapsuleItem } from './capsuleRoll'
import { getCapsulePolicy } from './policy'

/** 발급 기록(`item_issue_log.route`)에 쓰는 경로 값 */
export const CAPSULE_ISSUE_ROUTE = 'capsule'

export interface OpenCapsuleOptions {
  rand?: Rand
  now?: Date
}

type CapsuleBadge = IssueBadge & {
  name: string
  image_url: string | null
  point_reward: number | null
}

interface DbOpenedItem {
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
}

/** 열기 거절 코드를 `CapsuleError`로 바꾼다. DB 함수가 돌려주는 코드만 받고, 모르는 코드는 일반 오류다. */
function toOpenError(result: CapsuleOpenResult): Error {
  const code = result.error ?? ''
  if (!(CAPSULE_OPEN_ERROR_CODES as readonly string[]).includes(code)) {
    return new Error(`capsule_open이 알 수 없는 거절 코드를 돌려줬다: ${code}`)
  }
  if (code === 'insufficient_slots') {
    return new CapsuleError('insufficient_slots', undefined, { freeSlots: result.free ?? 0, neededSlots: result.needed ?? 0 })
  }
  return new CapsuleError(code as CapsuleOpenErrorCode)
}

/** 추첨에 쓸 데이터(트라이브·후보·카운터)를 읽는다. 읽지 못하면 던진다 — 틀린 값으로 추첨하지 않는다. */
async function loadRollData(supabase: SupabaseClient, userId: string) {
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

/**
 * 캡슐을 연다. 던지는 것: `UserSuspendedError`(정지), `CapsuleError`(`not_full`·`insufficient_slots`·`no_tribe`·DB 거절), 그 밖의 일반 오류.
 */
export async function openCapsule(supabase: SupabaseClient, userId: string, options: OpenCapsuleOptions = {}): Promise<CapsuleOpenPayload> {
  const rand = options.rand ?? Math.random
  const now = options.now ?? new Date()

  await assertNotSuspended(supabase, userId)

  // 사전 확인 — 안 되면 추첨하지 않는다
  const capsulePolicy = await getCapsulePolicy(supabase)
  const { status, chapterNo } = await getCapsuleState(supabase, userId, capsulePolicy)
  if (status.notOpenableReason === 'not_full') throw new CapsuleError('not_full')
  if (status.notOpenableReason === 'no_free_slots') {
    throw new CapsuleError('insufficient_slots', undefined, { freeSlots: status.freeSlots ?? 0, neededSlots: status.neededSlots ?? 0 })
  }

  const jamPolicy = await getJamPolicy(supabase)
  const data = await loadRollData(supabase, userId)

  const rolled = rollCapsule<CapsuleBadge>(
    {
      policy: { ...capsulePolicy, ...jamPolicy },
      tribeId: data.tribeId,
      tribeIds: tribesWithCandidates(data.tribes.map((t) => t.id), data.tribeId, data.books, data.badges, now),
      books: data.books,
      badges: data.badges,
      commonStreak: data.commonStreak,
      epicMiss: data.epicMiss,
      preQuest: chapterNo === null,
      now,
    },
    rand
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

  const { data: rpcData, error: rpcError } = await supabase.rpc('capsule_open', {
    p_user_id: userId,
    p_items: rolled.items.map((item) => ({
      badge_id: item.badge.id,
      rarity: item.rarity,
      rolled_rarity: item.rolledRarity,
      locked: item.lock.locked,
      lock_reason: item.lock.lockReason,
      unlock_required: item.lock.unlockRequired,
    })),
  })
  if (rpcError) throw new Error(`capsule_open RPC 오류: ${rpcError.message}`)
  const result = rpcData as CapsuleOpenResult | null
  if (result?.ok === false) throw toOpenError(result)
  if (
    result?.ok !== true ||
    typeof result.openId !== 'string' ||
    !Array.isArray(result.items) ||
    typeof result.next?.required !== 'number' ||
    typeof result.next.filled !== 'number'
  ) {
    throw new Error('capsule_open이 해석할 수 없는 응답을 돌려줬다')
  }

  // 여기부터는 열기가 확정됐다. 어떤 실패도 열기를 되돌리지 않는다.
  // 챕터 점수 «캡슐 열기» (티켓 20261019_1315, 운영 로직 12.2절). 후속 처리(`recordIssuedRewards`) 결과와 무관하게 먼저 센다.
  // 원천 id는 열기 기록 id(`capsule_opens.id`)라 같은 열기를 다시 보내도 한 번만 센다. 던지지 않는다(실패는 기록만 남는다).
  await awardChapterScore(supabase, { userId, kind: 'capsule_open', sourceId: result.openId })
  // 퀘스트 실제 단계 ② «캡슐 열기»(티켓 20261021_1248). 점수 다음이다. 완료 처리는 던지지 않지만, 어떤 실패도 열기와 응답을 바꾸지 않도록 한 번 더 감싼다.
  try {
    await recordOnboardingQuestCompletion(supabase, userId)
  } catch (e) {
    console.error(`[capsule-open] 퀘스트 완료 처리 실패 — 열기는 유지한다 (userId: ${userId}):`, e)
  }

  const tribeNameOf = new Map(data.tribes.map((t) => [t.id, t.name]))
  const items: CapsuleOpenedItem[] = []
  for (const [index, planned] of rolled.items.entries()) {
    const db = result.items[index] ?? {}
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

  return { openId: result.openId, items, next: { required: result.next.required, filled: result.next.filled } }
}
