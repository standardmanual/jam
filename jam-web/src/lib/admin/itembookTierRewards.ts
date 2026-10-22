/**
 * 컬렉션 등급별 보상 읽기·검증·저장 (티켓 20261022_1139 2회, 상위 20261022_1131 묶음 7)
 *
 * `item_book_tier_rewards`는 `(item_book_id, tier)`가 키이고 등급 하나에 포인트와 보상 배지를 둔다.
 *   - `reward_points`가 NULL이면 기본값(`item_book_tier_default_rewards`)을 쓰고, 0이면 지급하지 않는다.
 *   - `reward_badge_id`가 NULL이면 보상 배지를 주지 않는다.
 *   - 두 칸이 모두 비면 그 등급의 행을 두지 않는다(행이 없는 것과 같은 뜻이다).
 * 지급은 장착 함수(`slot_item_into_book_tiered`)와 `lib/itembook/slotReward.ts`가 이 표를 읽어 한다. 이 파일은 읽고 쓰기만 한다.
 *
 * 순수 함수(`validateTierRewardsBody`·`parsePointsText`·`findDuplicateRewardBadgeTiers`)는 화면(`ItemBookTierRewards`)도 가져다 쓴다.
 * 그래서 이 파일은 서버 모듈을 값으로 가져오지 않는다(`createServiceClient`는 타입으로만 가져온다).
 *
 * 저장은 등급 네 개를 한 번에 받는다. DB 호출은 둘이다(행이 남는 등급은 `upsert` 한 번, 비는 등급은 `delete` 한 번). 둘을 한 트랜잭션으로
 * 묶지는 못한다 — 마이그레이션 없이 supabase-js만으로는 방법이 없다. 하나가 실패하면 던지고, 부르는 쪽이 500을 내며 화면은 다시 읽는다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { TIER_ORDER, type TierName } from '@/lib/itembook/tier-readiness'
import { isUuid } from '@/lib/admin/uuid'

type ServiceClient = ReturnType<typeof createServiceClient>

export const TIER_NAME_LABEL: Record<TierName, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

/** 화면에 보이는 등급 한 행 */
export interface TierRewardRow {
  tier: TierName
  /** 저장된 포인트. NULL이면 기본값을 쓴다(칸이 빈 상태) */
  rewardPoints: number | null
  /** 이 등급의 기본 포인트. 기본값 행을 읽지 못했거나 없으면 NULL */
  defaultPoints: number | null
  rewardBadgeId: string | null
  /** 보상 배지의 이름. 삭제 여부를 걸지 않고 읽는다(소프트 삭제된 배지도 이름은 보인다) */
  rewardBadgeName: string | null
}

/** 저장할 등급 한 행 */
export interface TierRewardInput {
  tier: TierName
  rewardPoints: number | null
  rewardBadgeId: string | null
}

// ── 순수 함수 ──────────────────────────────────────────────────────────────────────────────────────

/**
 * 포인트 칸의 글을 값으로 바꾼다. 빈 칸은 `null`(기본값), 0 이상의 정수만 숫자다. 그 밖(소수·음수·글자)은 `ok: false`다.
 * 상한은 두지 않는다(기존 컬렉션 양식의 포인트 보상과 같다).
 */
export function parsePointsText(text: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: true, value: null }
  if (!/^\d+$/.test(trimmed)) return { ok: false }
  const value = Number(trimmed)
  return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false }
}

/** 같은 보상 배지를 고른 등급 묶음. 둘 이상의 등급이 한 배지를 고른 경우만 돌려준다. */
export function findDuplicateRewardBadgeTiers(
  rows: readonly { tier: TierName; rewardBadgeId: string | null }[]
): { badgeId: string; tiers: TierName[] }[] {
  const tiersByBadge = new Map<string, TierName[]>()
  for (const row of rows) {
    if (!row.rewardBadgeId) continue
    const list = tiersByBadge.get(row.rewardBadgeId)
    if (list) list.push(row.tier)
    else tiersByBadge.set(row.rewardBadgeId, [row.tier])
  }
  return [...tiersByBadge.entries()]
    .filter(([, tiers]) => tiers.length > 1)
    .map(([badgeId, tiers]) => ({ badgeId, tiers: [...tiers].sort((a, b) => TIER_ORDER.indexOf(a) - TIER_ORDER.indexOf(b)) }))
}

export const INVALID_BODY_MESSAGE = `요청 형식이 올바르지 않아요. 등급 네 개(${TIER_ORDER.map((tier) => TIER_NAME_LABEL[tier]).join('·')})를 한 번에 보내 주세요.`

export function invalidPointsMessage(tier: TierName): string {
  return `${TIER_NAME_LABEL[tier]}의 보상을 저장하지 못했어요. 포인트는 0 이상의 정수만 쓸 수 있어요. 숫자를 고치거나, 기본값을 쓰려면 비워 주세요.`
}

export function unavailableBadgeMessage(tiers: readonly TierName[]): string {
  return `${tiers.map((tier) => TIER_NAME_LABEL[tier]).join('·')}의 보상 배지를 저장하지 못했어요. 삭제됐거나 없는 배지예요. 다른 배지를 고르거나, 주지 않으려면 비워 주세요.`
}

export function duplicateBadgeMessage(tiers: readonly TierName[]): string {
  return `보상을 저장하지 못했어요. 같은 배지를 ${tiers.map((tier) => TIER_NAME_LABEL[tier]).join('·')}에 골랐어요. 한 배지는 한 번만 받을 수 있어서 두 등급이 나누면 한 등급의 보상만 나가요. 등급마다 다른 배지를 고르거나 비워 주세요.`
}

export type ValidatedTierRewards = { ok: true; tiers: TierRewardInput[] } | { ok: false; message: string }

/**
 * 저장 요청의 본문을 검사한다. DB를 읽지 않는 검사만 한다(배지가 있는지는 `findUnavailableRewardBadgeTiers`가 읽어 본다).
 * 본문은 `{ tiers: [{ tier, reward_points, reward_badge_id }] }`이고 등급 네 개가 하나씩 있어야 한다. 결과는 등급 순서로 돌려준다.
 */
export function validateTierRewardsBody(body: unknown): ValidatedTierRewards {
  const rawTiers = (body as { tiers?: unknown } | null)?.tiers
  if (!Array.isArray(rawTiers) || rawTiers.length !== TIER_ORDER.length) return { ok: false, message: INVALID_BODY_MESSAGE }

  const byTier = new Map<TierName, TierRewardInput>()
  const malformedBadgeTiers: TierName[] = []
  for (const raw of rawTiers) {
    const item = raw as { tier?: unknown; reward_points?: unknown; reward_badge_id?: unknown } | null
    const tier = (TIER_ORDER as readonly unknown[]).includes(item?.tier) ? (item?.tier as TierName) : null
    if (!item || tier === null || byTier.has(tier)) return { ok: false, message: INVALID_BODY_MESSAGE }

    const points = item.reward_points
    let rewardPoints: number | null
    if (points === null || points === undefined) rewardPoints = null
    else if (typeof points === 'number' && Number.isSafeInteger(points) && points >= 0) rewardPoints = points
    else return { ok: false, message: invalidPointsMessage(tier) }

    const badge = item.reward_badge_id
    let rewardBadgeId: string | null
    if (badge === null || badge === undefined || badge === '') rewardBadgeId = null
    else if (typeof badge !== 'string') return { ok: false, message: INVALID_BODY_MESSAGE }
    else if (!isUuid(badge)) {
      // 형식이 틀린 id는 DB에 넘기지 않는다(Postgres 오류 원문이 응답에 실릴 수 있다). 없는 배지와 같은 안내로 돌려준다.
      malformedBadgeTiers.push(tier)
      rewardBadgeId = null
    } else rewardBadgeId = badge.toLowerCase()

    byTier.set(tier, { tier, rewardPoints, rewardBadgeId })
  }

  if (malformedBadgeTiers.length > 0) return { ok: false, message: unavailableBadgeMessage(malformedBadgeTiers) }

  const tiers = TIER_ORDER.map((tier) => byTier.get(tier)).filter((row): row is TierRewardInput => Boolean(row))
  if (tiers.length !== TIER_ORDER.length) return { ok: false, message: INVALID_BODY_MESSAGE }

  const duplicates = findDuplicateRewardBadgeTiers(tiers)
  if (duplicates.length > 0) return { ok: false, message: duplicateBadgeMessage(duplicates.flatMap((d) => d.tiers)) }

  return { ok: true, tiers }
}

// ── DB 읽기·쓰기 ───────────────────────────────────────────────────────────────────────────────────

interface RewardDbRow {
  tier: TierName
  reward_points: number | null
  reward_badge_id: string | null
}

interface DefaultDbRow {
  tier: TierName
  reward_points: number
}

/** 이 컬렉션의 등급 네 행을 읽는다. 저장된 행이 없는 등급도 빈 값으로 채워 항상 네 행을 등급 순서로 돌려준다. 조회가 실패하면 던진다. */
export async function loadTierRewards(supabase: ServiceClient, itemBookId: string): Promise<TierRewardRow[]> {
  const [rewardsResult, defaultsResult] = await Promise.all([
    supabase.from('item_book_tier_rewards').select('tier, reward_points, reward_badge_id').eq('item_book_id', itemBookId),
    supabase.from('item_book_tier_default_rewards').select('tier, reward_points'),
  ])
  if (rewardsResult.error) throw new Error(`[itembookTierRewards] 등급별 보상 조회 실패: ${rewardsResult.error.message}`)
  if (defaultsResult.error) throw new Error(`[itembookTierRewards] 등급별 기본 보상 조회 실패: ${defaultsResult.error.message}`)

  const rewardByTier = new Map(((rewardsResult.data ?? []) as RewardDbRow[]).map((row) => [row.tier, row]))
  const defaultByTier = new Map(((defaultsResult.data ?? []) as DefaultDbRow[]).map((row) => [row.tier, row.reward_points]))

  const badgeIds = [...new Set([...rewardByTier.values()].map((row) => row.reward_badge_id).filter((id): id is string => Boolean(id)))]
  const nameById = new Map<string, string>()
  if (badgeIds.length > 0) {
    // 등급이 네 개뿐이라 id는 최대 네 개다. 소프트 삭제된 배지도 이름은 보여야 해서 deleted_at을 걸지 않는다.
    const { data, error } = await supabase.from('badges').select('id, name').in('id', badgeIds)
    if (error) throw new Error(`[itembookTierRewards] 보상 배지 이름 조회 실패: ${error.message}`)
    for (const badge of (data ?? []) as { id: string; name: string }[]) nameById.set(badge.id, badge.name)
  }

  return TIER_ORDER.map((tier) => {
    const stored = rewardByTier.get(tier)
    const rewardBadgeId = stored?.reward_badge_id ?? null
    return {
      tier,
      rewardPoints: stored?.reward_points ?? null,
      defaultPoints: defaultByTier.get(tier) ?? null,
      rewardBadgeId,
      rewardBadgeName: rewardBadgeId ? (nameById.get(rewardBadgeId) ?? null) : null,
    }
  })
}

/**
 * 고른 보상 배지 가운데 쓸 수 없는 배지(없거나 소프트 삭제됨)를 고른 등급을 돌려준다. 없으면 빈 배열이다.
 * 조회가 실패하면 던진다 — 읽지 못한 채 «문제없다»고 보지 않는다.
 */
export async function findUnavailableRewardBadgeTiers(supabase: ServiceClient, tiers: readonly TierRewardInput[]): Promise<TierName[]> {
  const ids = [...new Set(tiers.map((row) => row.rewardBadgeId).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('badges').select('id').in('id', ids).is('deleted_at', null)
  if (error) throw new Error(`[itembookTierRewards] 보상 배지 확인 실패: ${error.message}`)
  const available = new Set(((data ?? []) as { id: string }[]).map((row) => row.id))
  return tiers.filter((row) => row.rewardBadgeId && !available.has(row.rewardBadgeId)).map((row) => row.tier)
}

/**
 * 등급 네 개를 한 번에 저장한다. 값이 하나라도 있는 등급은 `upsert`, 두 칸이 모두 빈 등급은 행을 지운다.
 * 이미 받은 보상은 바뀌지 않는다(지급 기록은 다른 표에 있다). 쓰기가 실패하면 던진다.
 */
export async function saveTierRewards(supabase: ServiceClient, itemBookId: string, tiers: readonly TierRewardInput[]): Promise<void> {
  const kept = tiers.filter((row) => row.rewardPoints !== null || row.rewardBadgeId !== null)
  const emptied = tiers.filter((row) => row.rewardPoints === null && row.rewardBadgeId === null)

  if (kept.length > 0) {
    const updatedAt = new Date().toISOString()
    const { error } = await supabase.from('item_book_tier_rewards').upsert(
      kept.map((row) => ({
        item_book_id: itemBookId,
        tier: row.tier,
        reward_points: row.rewardPoints,
        reward_badge_id: row.rewardBadgeId,
        updated_at: updatedAt,
      })),
      { onConflict: 'item_book_id,tier' }
    )
    if (error) throw new Error(`[itembookTierRewards] 등급별 보상 저장 실패: ${error.message}`)
  }

  if (emptied.length > 0) {
    const { error } = await supabase
      .from('item_book_tier_rewards')
      .delete()
      .eq('item_book_id', itemBookId)
      .in(
        'tier',
        emptied.map((row) => row.tier)
      )
    if (error) throw new Error(`[itembookTierRewards] 비운 등급의 보상 삭제 실패: ${error.message}`)
  }
}
