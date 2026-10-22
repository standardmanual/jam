/**
 * 등급 올리기 — 레시피 없이 규칙으로 처리하는 믹스의 예외 (티켓 20261022_2119 2회, 운영 로직 8.4절)
 *
 * 같은 등급의 내 아이템 배지 5개를 내면 재료를 소각하고, 결과 아이템 배지 1개를 지급한다. 트라이브·컬렉션·아이템 이름은 상관없다.
 * 결과의 **등급은 확률로 정해지고(재료 등급 이상)** 그 등급의 아이템은 열린 컬렉션 안에서 **균등 무작위**로 나온다. 윗등급이 꼭 나오지는 않는다.
 * 레시피 행을 만들지 않는다(2026-10-23 사용자 결정) — 믹스의 «정해진 레시피대로 확률 없이» 원칙의 유일한 예외다.
 *
 * 규칙
 *  - 확률(`tierUpProbabilities`): 캡슐 정책의 `rarity_*`(퍼센트)에서 **재료 등급 이상만 남기고 합이 1이 되게** 다시 맞춘다.
 *    Common 재료는 70/22/6/2, Rare 재료는 약 73.3/20/6.7, Epic 재료는 75/25(%)다. 재료보다 낮은 등급은 나오지 않는다. Mystic은 재료가 되지 않는다.
 *  - 굴림(`rollTierUp`): 트라이브 → 등급 → 아이템 순서로 난수를 쓴다. 트라이브는 캡슐과 같다(내 트라이브가 기본, 확률 `other_tribe_probability`로 다른 트라이브).
 *    대상 트라이브는 `tribesWithCandidates`로 좁히되, 이 굴림이 실제로 내놓을 수 있는 등급(재료 등급 이상)의 아이템만 후보로 센다.
 *    아이템은 정한 트라이브·등급의 후보에서 균등이다. 후보가 없으면 정한 등급에서 **재료 등급까지만** 한 등급씩 내려간다(캡슐의 `pickWithRarityFallback`과 달리 재료 아래로는 내려가지 않는다).
 *    그래도 없으면 `null`이다. 난수 함수와 현재 시각은 인자로 받는다 — 시험이 고정한 난수로 경계를 재현한다.
 *  - 실행(`tierUp`) 순서: ① 개수 5개·중복 없음 ② 이용 정지 ③ 받지 않은 결과 ④ 인벤토리·개체 ⑤ 잠김 ⑥ 재료 배지 ⑦ **굴림(소각 전)** ⑧ 소각 ⑨ 결과 지급
 *    ⑩ 후속(남은 칸 알림, 열린 개체의 배지 포인트) ⑪ 챕터 점수 «믹스 성공». 소각 앞(①~⑦)의 거절은 재료·포인트·점수 모두 그대로다.
 *    풀이 비어 굴림이 `null`이면 재료를 소각하기 전에 `no_candidate`로 거절한다.
 *  - 결과 지급은 믹스와 같은 `combine_grant_results`(마이그레이션 236)다. 레시피가 없으므로 `p_recipe_id`는 null, 잠김은 배지(`always_locked`)만 정한다.
 *    빈칸이 모자라면 결과를 받지 않은 결과로 남기고(재료는 소모됨) 받기 전에는 새 믹스와 등급 올리기를 할 수 없다. 잠긴 결과를 가리는 방식은 믹스와 같다.
 *  - 챕터 점수 «믹스 성공»(20점)은 시도마다 새로 만든 UUID를 원천 id로 센다. 성공 기록 표(`user_combine_success_logs`)와 JAM! 행동 지표는 쓰지 않는다
 *    (`recipe_id`가 필수라 담을 수 없고, 레시피 첫 성공 같은 조건은 레시피가 있는 믹스의 것이다). 추적은 개체 이력(`custody_events` Consume, `inventory_item_events` received)이다.
 *  - 결과를 지급하지 못하면(`combine_grant_results` 오류·결과 없음) 재료가 이미 소각된 뒤라 되돌릴 수 없다. 운영이 복구할 수 있게 로그를 남기고 던진다(라우트가 500).
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다). 클라이언트 컴포넌트가 가져오는 모듈에서 이 파일을 가져오지 않는다.
 */
import { awardChapterScore } from '@/lib/chapter/score'
import { burnMaterials, type InventorySlotState } from '@/lib/combine/burn'
import { readUnlockRequired, type CombineResultBadge } from '@/lib/combine/index'
import { getPendingCount } from '@/lib/combine/pending'
import { followUpCombineResultPoints } from '@/lib/combine/resultPointFollowUp'
import { rollCapsuleTribe, tribesWithCandidates } from '@/lib/capsule/capsuleRoll'
import { loadRollData } from '@/lib/capsule/open'
import { getCapsulePolicy, type CapsulePolicy } from '@/lib/capsule/policy'
import { pickItemBadge, pickWeighted, type IssueBadge, type IssueBook, type Rand } from '@/lib/drop-engine/syncIssue'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import { createServiceClient } from '@/lib/supabase/server'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import type { BadgeRarity } from '@/types/database'

/** 재료 개수 — 운영 로직 8.4절의 코드 상수 */
export const TIER_UP_MATERIAL_COUNT = 5

/** 재료가 될 수 있는 등급. Mystic은 더 올릴 등급이 없어 재료가 되지 않는다(2026-10-10 결정) */
export const TIER_UP_MATERIAL_RARITIES = ['common', 'rare', 'epic'] as const satisfies readonly BadgeRarity[]

export type TierUpMaterialRarity = (typeof TIER_UP_MATERIAL_RARITIES)[number]

export function isTierUpMaterialRarity(rarity: unknown): rarity is TierUpMaterialRarity {
  return (TIER_UP_MATERIAL_RARITIES as readonly unknown[]).includes(rarity)
}

/** 낮은 등급부터 높은 등급 순서 */
const RARITY_ASCENDING: readonly BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

const rarityRank = (rarity: BadgeRarity): number => RARITY_ASCENDING.indexOf(rarity)

/** 확률표가 읽는 정책 칸 — 캡슐 등급 확률(퍼센트) */
export type TierUpRarityPolicy = Pick<CapsulePolicy, 'rarity_common' | 'rarity_rare' | 'rarity_epic' | 'rarity_mystic'>

/**
 * 재료 등급별 결과 등급 확률. 캡슐 정책의 등급 확률에서 재료 등급 이상만 남겨 합이 1이 되게 다시 맞춘 `[등급, 확률][]`을 낮은 등급부터 돌려준다.
 * 확률 0인 등급도 줄에 남긴다(확률 안내가 0% 줄을 지우지 않는다). 확률 안내 페이지와 굴림이 같은 함수를 쓴다.
 *
 * 재료 등급 이상의 설정 확률이 전부 0이면 올릴 길이 없으므로 재료 등급 그대로 100%다(합 1, 낮은 등급 없음 유지).
 * Mystic 재료는 지원하지 않는다 — 던진다.
 */
export function tierUpProbabilities(materialRarity: TierUpMaterialRarity, policy: TierUpRarityPolicy): Array<[BadgeRarity, number]> {
  if (!isTierUpMaterialRarity(materialRarity)) {
    throw new Error(`등급 올리기 재료가 될 수 없는 등급: ${String(materialRarity)}`)
  }
  const weightOf: Record<BadgeRarity, number> = {
    common: policy.rarity_common,
    rare: policy.rarity_rare,
    epic: policy.rarity_epic,
    mystic: policy.rarity_mystic,
  }
  const eligible = RARITY_ASCENDING.slice(rarityRank(materialRarity))
  const total = eligible.reduce((sum, rarity) => sum + weightOf[rarity], 0)
  if (!(total > 0)) return [[materialRarity, 1]]
  return eligible.map((rarity): [BadgeRarity, number] => [rarity, weightOf[rarity] / total])
}

/** 굴림이 읽는 정책 칸 — 캡슐 등급 확률과 다른 트라이브 확률 */
export type TierUpRollPolicy = TierUpRarityPolicy & Pick<CapsulePolicy, 'other_tribe_probability'>

export interface TierUpRollInput<B extends IssueBadge = IssueBadge> {
  materialRarity: TierUpMaterialRarity
  policy: TierUpRollPolicy
  /** 유저의 소속 트라이브 */
  tribeId: string
  /** 트라이브 전체 id(소속 포함). 후보가 있는 트라이브로 좁히는 일은 이 굴림이 한다 */
  tribeIds: readonly string[]
  books: readonly IssueBook[]
  /** 판정 칸(`IssueBadge`) 외에 이름·이미지 같은 칸을 더 실어도 그대로 돌려준다 */
  badges: readonly B[]
  now: Date
}

export interface TierUpRollResult<B extends IssueBadge = IssueBadge> {
  badge: B
  /** 이 아이템을 뽑은 트라이브 */
  tribeId: string
  /** 실제 받는 등급 */
  rarity: BadgeRarity
  /** 확률로 처음 정해진 등급 — 후보가 없어 내려가지 않았다면 `rarity`와 같다 */
  rolledRarity: BadgeRarity
}

/**
 * 결과 아이템 하나를 정한다(순수). 난수는 트라이브(1~2번) → 등급(1번) → 아이템(1번 이상) 순서로 쓴다. 정할 수 없으면 `null`이다.
 */
export function rollTierUp<B extends IssueBadge>(input: TierUpRollInput<B>, rand: Rand): TierUpRollResult<B> | null {
  const { materialRarity, policy, books, badges, now } = input
  const floor = rarityRank(materialRarity)

  // 이 굴림이 내놓을 수 있는 등급(재료 등급 이상)의 아이템만 «후보가 있는 트라이브» 판정에 센다.
  // 낮은 등급 후보만 있는 트라이브(옛 컬렉션)가 뽑혀 거절되는 일을 없앤다. 소속 트라이브는 후보가 없어도 남는다(`tribesWithCandidates`).
  const reachable = badges.filter((b) => b.rarity !== null && rarityRank(b.rarity) >= floor)
  const tribeIds = tribesWithCandidates<B>(input.tribeIds, input.tribeId, books, reachable, now)

  const tribeId = rollCapsuleTribe(policy, input.tribeId, tribeIds, rand)
  const rolledRarity = pickWeighted<BadgeRarity>(tierUpProbabilities(materialRarity, policy), rand)

  // 정한 등급에 후보가 없으면 한 등급씩 내려가되 재료 등급 아래로는 내려가지 않는다
  for (let rank = rarityRank(rolledRarity); rank >= floor; rank--) {
    const rarity = RARITY_ASCENDING[rank]
    const badge = pickItemBadge<B>({ tribeId, rarity, books, badges, now }, rand)
    if (badge) return { badge, tribeId, rarity, rolledRarity }
  }
  return null
}

/** 등급 올리기가 거절되는 이유. 믹스의 `CombineFailReason`과 별개다(믹스 실패 이력 표의 CHECK 값과 무관하다) */
export type TierUpFailReason =
  | 'invalid_count'
  | 'pending_results_exist'
  | 'items_not_found'
  | 'locked_item_not_allowed'
  /** 재료가 아이템 배지가 아니거나, 등급이 섞였거나, Mystic이다 */
  | 'invalid_materials'
  /** 결과로 나올 수 있는 아이템 배지가 하나도 없다. 소각 전에 거절하므로 재료는 그대로다 */
  | 'no_candidate'

export type TierUpResult =
  | {
      success: true
      path: 'tier_up'
      /** 낸 재료의 등급 */
      materialRarity: TierUpMaterialRarity
      /** 지급된 결과. 잠긴 채 나온 것은 `locked: true`이고 `id`·`name`을 가린다. 받지 않은 결과(`pending`)는 빈 배열이다 */
      resultBadges: CombineResultBadge[]
      /** 등급 올리기는 포인트를 주지 않는다 */
      pointsAwarded: 0
      resultStatus: 'granted' | 'pending'
      /** `pending`일 때 받지 않은 결과 개수 */
      pendingCount?: number
      /** `pending`일 때 시도 시점의 인벤토리 빈칸 수 */
      freeSlots?: number
    }
  | { success: false; reason: TierUpFailReason; pointsAwarded: 0 }

export interface TierUpOptions {
  /** 난수 함수 — 시험이 고정한 값을 넣는다. 기본은 `Math.random` */
  rand?: Rand
  now?: Date
}

const fail = (reason: TierUpFailReason): TierUpResult => ({ success: false, reason, pointsAwarded: 0 })

/**
 * 등급 올리기를 실행한다. 던지는 것: `UserSuspendedError`(정지, 라우트가 403), 읽기 실패 같은 일반 오류(라우트가 500),
 * `CapsuleError('no_tribe')`(소속 트라이브 없음). 모두 소각 전이라 재료는 그대로다. 단 «결과 지급 실패»는 소각 뒤에 던진다(머리말 참고).
 */
export async function tierUp(userId: string, itemIds: string[], options: TierUpOptions = {}): Promise<TierUpResult> {
  const rand = options.rand ?? Math.random
  const now = options.now ?? new Date()

  // ① 개수 5개, 중복 없음
  if (
    !Array.isArray(itemIds) ||
    itemIds.length !== TIER_UP_MATERIAL_COUNT ||
    itemIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(itemIds).size !== itemIds.length
  ) {
    return fail('invalid_count')
  }

  const supabase = createServiceClient()

  // ② 이용 정지 — 던진다(라우트가 403). 읽지 못해도 던진다(정지 유저가 조회 실패 틈에 쓰면 안 된다).
  await assertNotSuspended(supabase, userId)
  // ③ 받지 않은 결과가 있으면 새 등급 올리기를 막는다(운영 로직 8.4·6.4절)
  if ((await getPendingCount(supabase, userId)) > 0) return fail('pending_results_exist')

  // ④ 인벤토리와 개체 — 내 것이고 아이템북에 슬롯되거나 드랍된 것이 아니어야 한다
  const { data: invRaw } = await supabase.from('inventory').select('id, used_slots, max_slots').eq('user_id', userId).single()
  const inventory = invRaw as InventorySlotState | null
  if (!inventory) return fail('items_not_found')

  const { data: itemsRaw } = await supabase
    .from('inventory_items')
    .select('id, badge_id, locked')
    .eq('inventory_id', inventory.id)
    .in('id', itemIds)
    .is('slotted_in', null)
    .is('dropped_at', null)
  const items = (itemsRaw ?? []) as { id: string; badge_id: string; locked?: boolean | null }[]
  if (items.length !== itemIds.length) return fail('items_not_found')

  // ⑤ 잠긴 개체는 재료로 쓸 수 없다(운영 로직 7.2절)
  if (items.some((i) => i.locked === true)) return fail('locked_item_not_allowed')

  // ⑥ 재료 배지 — 모두 아이템 배지이고 등급이 같고 Mystic이 아니어야 한다. 읽지 못하면 던진다(아직 소각 전이다)
  const materialBadgeIds = [...new Set(items.map((i) => i.badge_id))]
  const { data: badgeRaw, error: badgeError } = await supabase.from('badges').select('id, type, rarity').in('id', materialBadgeIds)
  if (badgeError) throw new Error(`재료 배지 조회 실패: ${badgeError.message}`)
  const materialBadges = (badgeRaw ?? []) as { id: string; type: string | null; rarity: BadgeRarity | null }[]
  if (materialBadges.length !== materialBadgeIds.length || materialBadges.some((b) => b.type !== 'item')) {
    return fail('invalid_materials')
  }
  const materialRarity = materialBadges[0]?.rarity
  if (!isTierUpMaterialRarity(materialRarity) || materialBadges.some((b) => b.rarity !== materialRarity)) {
    return fail('invalid_materials')
  }

  // ⑦ 굴림(소각 전) — 풀을 읽지 못하면 던진다. 결과로 나올 아이템이 없으면 재료를 소각하기 전에 거절한다.
  const capsulePolicy = await getCapsulePolicy(supabase)
  const pool = await loadRollData(supabase, userId)
  const rolled = rollTierUp(
    {
      materialRarity,
      policy: capsulePolicy,
      tribeId: pool.tribeId,
      tribeIds: pool.tribes.map((t) => t.id),
      books: pool.books,
      badges: pool.badges,
      now,
    },
    rand
  )
  if (!rolled) return fail('no_candidate')

  // ⑧ 소각 — 동시 시도로 소각 행 수가 맞지 않으면 보상 없이 중단한다(믹스와 같다)
  const burn = await burnMaterials(supabase, { userId, inventory, itemIds, logPrefix: '[tierUp]' })
  if (!burn.ok) return fail('items_not_found')

  // ⑨ 결과 지급 — 믹스와 같은 `combine_grant_results` 한 번. 레시피가 없어 `p_recipe_id`는 null, 잠김은 배지(`always_locked`)가 정한다.
  const { data: grantRaw, error: grantError } = await supabase.rpc('combine_grant_results', {
    p_user_id: userId,
    p_recipe_id: null,
    p_badge_ids: [rolled.badge.id],
    p_locked: false,
  })
  const grant = grantRaw as { ok?: boolean; error?: string; status?: string; pendingCount?: number; free?: number; itemIds?: string[] } | null
  if (grantError || !grant || grant.ok !== true || (grant.status !== 'granted' && grant.status !== 'pending')) {
    const detail = { userId, materialItemIds: itemIds, resultBadgeId: rolled.badge.id, rpcError: grantError?.message ?? grant?.error ?? grant?.status ?? 'unknown' }
    console.error('[tierUp] combine_grant_results 실패 — 재료만 소각되고 결과가 지급되지 않음:', detail)
    throw new Error('등급 올리기 결과를 지급하지 못했다. 재료는 이미 소각됐다')
  }

  let result: TierUpResult
  if (grant.status === 'pending') {
    result = {
      success: true,
      path: 'tier_up',
      materialRarity,
      resultBadges: [],
      pointsAwarded: 0,
      resultStatus: 'pending',
      pendingCount: Number(grant.pendingCount ?? 1),
      freeSlots: Number(grant.free ?? 0),
    }
  } else {
    const grantedItemIds = Array.isArray(grant.itemIds) ? grant.itemIds : []
    const locked = rolled.badge.always_locked === true
    let resultBadge: CombineResultBadge = { id: rolled.badge.id, name: rolled.badge.name, rarity: rolled.rarity }
    if (locked) {
      // 잠긴 결과는 이름·그림·일련번호를 싣지 않는다(운영 로직 7.3절). 필요한 양은 DB가 정한 값을 개체에서 읽고, 읽지 못하면 칸을 뺀다.
      const [unlockRequired] = await readUnlockRequired(supabase, grantedItemIds)
      resultBadge = { id: '', name: '', rarity: rolled.rarity, locked: true, ...(unlockRequired !== undefined ? { unlockRequired } : {}) }
    }
    result = {
      success: true,
      path: 'tier_up',
      materialRarity,
      resultBadges: [resultBadge],
      pointsAwarded: 0,
      resultStatus: 'granted',
    }

    // ⑩ 결과를 바로 지급했으면 남은 칸 알림을 검사하고, 열린 개체의 배지 포인트를 일련번호마다 한 번 준다. 둘 다 던지지 않는다.
    await notifyInventorySlotsLow(userId, supabase)
    await followUpCombineResultPoints(supabase, userId, grantedItemIds)
  }

  // ⑪ 챕터 점수 «믹스 성공» — 레시피 성공 기록이 없으므로 시도마다 새 UUID를 원천 id로 쓴다. 던지지 않는다(실패는 기록만 남는다).
  await awardChapterScore(supabase, { userId, kind: 'mix_success', sourceId: crypto.randomUUID() })

  return result
}
