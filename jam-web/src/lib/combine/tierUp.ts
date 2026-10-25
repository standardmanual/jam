/**
 * 등급 올리기 — 레시피 없이 규칙으로 처리하는 믹스의 예외 (티켓 20261022_2119 2회, 20261023_1648 2회, 운영 로직 8.4절)
 *
 * 같은 등급의 내 아이템 배지 5개와 **유저가 고른 컬렉션**을 내면 재료를 소각하고, 결과 아이템 배지 1개를 지급한다. 재료의 트라이브·컬렉션·아이템 이름은 상관없다.
 * 결과의 **등급은 확률로 정해지고(재료 등급 그대로 또는 바로 위 등급)** 그 등급의 아이템은 고른 컬렉션 안에서 **균등 무작위**로 나온다. 윗등급이 꼭 나오지는 않는다.
 * 레시피 행을 만들지 않는다(2026-10-23 사용자 결정) — 믹스의 «정해진 레시피대로 확률 없이» 원칙의 유일한 예외다.
 *
 * 규칙
 *  - 확률(`tierUpProbabilities`): 바로 위 등급이 `combine_policy.tier_up_probability`(0~1, 기본 0.7), 재료 등급 그대로가 나머지다. 재료 등급마다 같은 한 칸이다.
 *    Common 재료는 Common 30%·Rare 70%, Rare 재료는 Rare 30%·Epic 70%, Epic 재료는 Epic 30%·Mystic 70%(기본값). Mystic은 재료가 되지 않는다.
 *  - 굴림(`rollTierUp`): 등급(난수 1번) → 아이템(난수 1번) 순서다. 트라이브 굴림과 `other_tribe_probability`는 쓰지 않는다.
 *    아이템은 **고른 컬렉션**의 그 등급 후보에서 균등이다(후보 판정은 `listIssueCandidates` — 소속 트라이브, 활성, 공개 기간 안, 드랍 제외 아님, 삭제 아님).
 *    정한 등급의 후보가 고른 컬렉션에 없으면 `null`이다 — 아래 등급으로 내려가지 않는다. 난수 함수와 현재 시각은 인자로 받는다 — 시험이 고정한 난수로 경계를 재현한다.
 *  - 실행(`tierUp`) 순서: ① 개수 5개·중복 없음 ② 이용 정지 ③ 받지 않은 결과 ④ 인벤토리·개체 ⑤ 잠김 ⑥ 재료 배지 ⑥-2 **고른 컬렉션**(소각 전)
 *    ⑦ **굴림(소각 전)** ⑧ 소각 ⑨ 결과 지급 ⑩ 후속(남은 칸 알림, 열린 개체의 배지 포인트) ⑪ 챕터 점수 «믹스 성공». 소각 앞(①~⑦)의 거절은 재료·포인트·점수 모두 그대로다.
 *    고른 컬렉션이 소속 트라이브의 열린 컬렉션이 아니거나(모르는 id 포함), 재료 등급과 바로 윗등급의 아이템 배지 가운데 한쪽이라도 나올 수 없으면 `invalid_collection`으로 소각 전에 거절한다
 *    (믹스 화면 목록의 `tierUpCollectionChoices`와 같은 `collectionSupportsTierUp` 판정, 티켓 20261025_2011). 한쪽만 있는 컬렉션을 받으면 굴린 등급에 따라 «받을 것 없음» 거절이 나는데
 *    거절은 비용이 없어, 윗등급만 있는 컬렉션으로 윗등급이 나올 때까지 다시 시도해 윗등급 100%를 얻을 수 있었다. 위 검사를 통과했는데도 굴림이 `null`이면(방어) `no_candidate`로 소각 전에 거절한다.
 *  - 윗등급 확률은 `getCombinePolicy`로 읽는다. 읽기에 실패하거나 칸이 아직 없으면 기본값 0.7로 굴린다(믹스 기능이 죽지 않게 하는 폴백). 확률 안내 페이지는 이 폴백을 쓰지 않고 엄격하게 읽는다.
 *  - 결과 지급은 믹스와 같은 `combine_grant_results`(마이그레이션 236)다. 레시피가 없으므로 `p_recipe_id`는 null, 잠김은 배지(`always_locked`)만 정한다.
 *    빈칸이 모자라면 결과를 받지 않은 결과로 남기고(재료는 소모됨) 받기 전에는 새 믹스와 등급 올리기를 할 수 없다. 잠긴 결과를 가리는 방식은 믹스와 같다.
 *  - 응답의 결과 배지에는 `id`·`name`·`rarity` 외에 `imageUrl`(`badges.image_url`, 없으면 null)을 싣는다. 믹스는 레시피의 보상 배지 정보로 그림을 찾지만
 *    등급 올리기에는 레시피가 없어서다. 잠긴 결과는 그림도 가리므로 `imageUrl`이 null이다.
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
import { getCombinePolicy } from '@/lib/combine/policy'
import { issuableRaritiesByBook } from '@/lib/combine/tierUpCollections'
import {
  TIER_UP_MATERIAL_COUNT,
  TIER_UP_MATERIAL_RARITIES,
  collectionSupportsTierUp,
  isTierUpMaterialRarity,
  tierUpProbabilities,
  type TierUpMaterialRarity,
} from '@/lib/combine/tierUpOdds'
import { loadRollData } from '@/lib/capsule/open'
import { isIssuableBook, pickItemBadge, pickWeighted, type IssueBadge, type IssueBook, type Rand } from '@/lib/drop-engine/syncIssue'
import { notifyInventorySlotsLow } from '@/lib/inventory/slotAlert'
import { createServiceClient } from '@/lib/supabase/server'
import { assertNotSuspended } from '@/lib/suspension/suspension'
import type { BadgeRarity } from '@/types/database'

// 재료 개수·재료 등급·확률표는 순수한 부분이라 `tierUpOdds.ts`에 있다(확률 안내 페이지가 서버 모듈 없이 같은 함수를 쓴다, 티켓 20261022_2119 4회).
// 이 파일은 같은 이름으로 다시 내보내므로 기존 가져오기는 그대로다.
export { TIER_UP_MATERIAL_COUNT, TIER_UP_MATERIAL_RARITIES, isTierUpMaterialRarity, tierUpProbabilities }
export type { TierUpMaterialRarity }

export interface TierUpRollInput<B extends IssueBadge = IssueBadge> {
  materialRarity: TierUpMaterialRarity
  /** 윗등급 확률(0~1) — `combine_policy.tier_up_probability` */
  tierUpProbability: number
  /** 유저의 소속 트라이브 */
  tribeId: string
  /** 유저가 고른 컬렉션(아이템북) id */
  collectionId: string
  books: readonly IssueBook[]
  /** 판정 칸(`IssueBadge`) 외에 이름·이미지 같은 칸을 더 실어도 그대로 돌려준다 */
  badges: readonly B[]
  now: Date
}

export interface TierUpRollResult<B extends IssueBadge = IssueBadge> {
  badge: B
  /** 실제 받는 등급 — 재료 등급 그대로 또는 바로 위 등급 */
  rarity: BadgeRarity
}

/**
 * 결과 아이템 하나를 정한다(순수). 난수는 등급(1번) → 아이템(1번) 순서로 쓴다.
 * 정한 등급의 후보가 고른 컬렉션에 없으면(컬렉션이 열려 있지 않은 경우 포함) 아래 등급으로 내려가지 않고 `null`이다.
 */
export function rollTierUp<B extends IssueBadge>(input: TierUpRollInput<B>, rand: Rand): TierUpRollResult<B> | null {
  const { materialRarity, tierUpProbability, tribeId, collectionId, books, badges, now } = input

  const rarity = pickWeighted<BadgeRarity>(tierUpProbabilities(materialRarity, tierUpProbability), rand)
  // 후보 판정은 발급과 같은 `listIssueCandidates`를 쓰되 고른 컬렉션 하나로 좁힌다
  const badge = pickItemBadge<B>({ tribeId, rarity, books: books.filter((b) => b.id === collectionId), badges, now }, rand)
  return badge ? { badge, rarity } : null
}

/** 등급 올리기가 거절되는 이유. 믹스의 `CombineFailReason`과 별개다(믹스 실패 이력 표의 CHECK 값과 무관하다) */
export type TierUpFailReason =
  | 'invalid_count'
  | 'pending_results_exist'
  | 'items_not_found'
  | 'locked_item_not_allowed'
  /** 재료가 아이템 배지가 아니거나, 등급이 섞였거나, Mystic이다 */
  | 'invalid_materials'
  /** 고른 컬렉션이 소속 트라이브의 열린 컬렉션이 아니거나(고르지 않았거나 모르는 id 포함), 재료 등급·바로 윗등급 아이템 배지 가운데 한쪽이 없다. 소각 전에 거절하므로 재료는 그대로다 */
  | 'invalid_collection'
  /** 방어용 — 컬렉션 검사를 통과했는데도 정한 등급으로 나올 수 있는 아이템 배지가 없다. 소각 전에 거절하므로 재료는 그대로다 */
  | 'no_candidate'

/**
 * 등급 올리기 응답의 결과 배지 한 줄 — 믹스의 `CombineResultBadge`에 그림 주소(`imageUrl`)를 더했다.
 * 믹스는 레시피의 보상 배지 정보로 그림을 찾지만 등급 올리기에는 레시피가 없어서, 응답이 그림 주소를 직접 싣는다.
 * 믹스 응답 타입(`CombineResultBadge`)은 바꾸지 않는다.
 */
export interface TierUpResultBadge extends CombineResultBadge {
  /** `badges.image_url`. 그림이 없는 배지는 `null`이다. 잠긴 결과(`locked: true`)는 그림을 가리므로 늘 `null`이다 */
  imageUrl: string | null
}

export type TierUpResult =
  | {
      success: true
      path: 'tier_up'
      /** 낸 재료의 등급 */
      materialRarity: TierUpMaterialRarity
      /** 지급된 결과. 잠긴 채 나온 것은 `locked: true`이고 `id`·`name`·`imageUrl`을 가린다. 받지 않은 결과(`pending`)는 빈 배열이다 */
      resultBadges: TierUpResultBadge[]
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
 *
 * @param collectionId 유저가 고른 컬렉션(아이템북) id. 비어 있거나 소속 트라이브의 열린 컬렉션이 아니거나, 재료 등급·바로 윗등급 아이템 배지 가운데 한쪽이 없으면 `invalid_collection`이다
 */
export async function tierUp(userId: string, itemIds: string[], collectionId: string, options: TierUpOptions = {}): Promise<TierUpResult> {
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

  // ⑥-2 고른 컬렉션 — 소속 트라이브의 열린 컬렉션이어야 한다(소각 전). 풀을 읽지 못하면 던진다.
  if (typeof collectionId !== 'string' || !collectionId) return fail('invalid_collection')
  const pool = await loadRollData(supabase, userId)
  const chosenBook = pool.books.find((b) => b.id === collectionId)
  if (!chosenBook || !isIssuableBook(chosenBook, pool.tribeId, now)) return fail('invalid_collection')
  // 재료 등급과 바로 윗등급의 아이템 배지가 모두 나올 수 있는 컬렉션이어야 한다(소각 전, 티켓 20261025_2011). 한쪽만 있으면 굴린 등급에 따라 받을 것이 없어
  // 거절이 나는데 거절은 비용이 없으므로, 윗등급만 있는 컬렉션으로 윗등급이 나올 때까지 다시 시도해 윗등급 100%를 얻는 길이 열린다. 믹스 화면의 목록과 같은 판정이다.
  const chosenRarities = issuableRaritiesByBook({ tribeId: pool.tribeId, books: [chosenBook], badges: pool.badges, now }).get(collectionId)
  if (!chosenRarities || !collectionSupportsTierUp([...chosenRarities], materialRarity)) return fail('invalid_collection')

  // ⑦ 굴림(소각 전) — 위 검사를 통과했으므로 정한 등급의 후보가 늘 있다. 그래도 없으면(방어) 재료를 소각하기 전에 거절한다.
  const { tier_up_probability: tierUpProbability } = await getCombinePolicy()
  const rolled = rollTierUp(
    {
      materialRarity,
      tierUpProbability,
      tribeId: pool.tribeId,
      collectionId,
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
    let resultBadge: TierUpResultBadge = {
      id: rolled.badge.id,
      name: rolled.badge.name,
      rarity: rolled.rarity,
      imageUrl: rolled.badge.image_url ?? null,
    }
    if (locked) {
      // 잠긴 결과는 이름·그림·일련번호를 싣지 않는다(운영 로직 7.3절). 필요한 양은 DB가 정한 값을 개체에서 읽고, 읽지 못하면 칸을 뺀다.
      const [unlockRequired] = await readUnlockRequired(supabase, grantedItemIds)
      resultBadge = { id: '', name: '', rarity: rolled.rarity, imageUrl: null, locked: true, ...(unlockRequired !== undefined ? { unlockRequired } : {}) }
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
