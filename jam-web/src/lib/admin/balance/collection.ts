/**
 * 밸런스 설정 «컬렉션과 믹스» 구역의 연결 (티켓 20261022_1133 1회, 운영 로직 8.6·19.1절)
 *
 * 두 표를 한 구역으로 편집한다.
 * - `item_book_tier_default_rewards` 4행(`tier` 키): 컬렉션을 등급별로 완성했을 때 주는 **기본 포인트**(마이그레이션 222, 0 이상 정수, 0이면 지급 생략).
 *   컬렉션마다 따로 정한 값(`item_book_tier_rewards.reward_points`)이 있으면 그 값이 먼저이고, 이미 받은 보상은 바뀌지 않는다. 칸 이름은 `default_reward:epic` 형식이고 이력에도 그대로 남는다.
 * - `combine_policy` id=1 한 행의 두 칸:
 *   - `fail_reward_points`: 레시피에 맞지 않는 재료로 믹스했을 때 주는 포인트(마이그레이션 153, 0 이상 정수).
 *   - `tier_up_probability`: 등급 올리기에서 결과 등급이 재료 등급의 바로 위일 확률(마이그레이션 287, 티켓 20261023_1648 4회, 운영 로직 8.4절). 한 칸이고 재료 등급마다 따로 두지 않는다.
 *
 * 옛 «믹스 정책» 화면(`/admin/combine-policy`)을 이 구역으로 옮겼다. 확률 안내 페이지가 읽는 칸은 `tier_up_probability` 하나라(`COMBINE_COLUMNS`) 그 칸만 `affectsDisclosure`가 `true`이고
 * 저장 전에 확률 안내 확인창이 뜬다. 나머지 칸은 `false`다(가정 차). 「챕터 점수」(`chapter_score_rules.collection_complete_*`)와 이 구역의 「포인트」는 값이 같아도 다른 설정이다.
 *
 * **윗등급 확률은 화면에서 퍼센트(0~100, 소수 첫째 자리), DB에서 0~1이다.** 읽을 때 ×100, 쓸 때 ÷100으로 바꾸고(`fields.ts`의 `fractionToPercent`·`percentToFraction`) 이력 값도 화면 단위인 퍼센트로 남는다.
 * `combine_policy`는 한 행이라 두 칸을 함께 바꿔도 **한 번의 조건부 갱신**이다(수정 시각을 한 번만 올리므로 칸마다 따로 갱신하면 두 번째가 충돌한다).
 *
 * 읽기는 **가공하지 않은 행**을 읽는다(비정상 값을 기본값으로 바꿔 보이지 않는다). 쓰기는 두 표라 한 번의 조건부 갱신으로 끝나지 않는다.
 * 구역 수정 시각 계산과 행 단위 갱신·되돌림은 공용 모듈(`rowwise.ts`)에 맡기고, 이 파일은 표에 맞는 갱신·되돌림 함수만 만든다.
 * `lib/combine/policy.ts`의 `updateCombinePolicy`는 정책 대시보드 저장 라우트가 없어지면서(티켓 20261022_1717) 부르는 곳이 없다. 함수와 시험은 남겨 두었다(삭제는 후속, 가정 카).
 */
import { DEFAULT_COMBINE_POLICY } from '@/lib/combine/policy'
import { TIER_ORDER, type TierName } from '@/lib/itembook/tier-readiness'
import { COMBINE_COLUMNS } from '@/lib/probability/disclosure'
import type { Database } from '@/types/database.generated'
import { dbNumber, fractionToPercent, percentToFraction } from './fields'
import { didUndo, latestStamp, runRowOps, toRowOutcome, type RowOp } from './rowwise'
import {
  INTEGER_MAX,
  type BalanceFieldDef,
  type BalanceSectionBinding,
  type BalanceServiceClient,
  type BalanceValues,
  type BalanceWriteResult,
} from './types'

export const COLLECTION_SECTION_ID = 'collection'

export const FAIL_REWARD_KEY = 'fail_reward_points'

/** 등급 올리기 윗등급 확률의 칸 이름. `combine_policy` 열 이름과 같다. */
export const TIER_UP_PROBABILITY_KEY = 'tier_up_probability'

/** 확률 안내 페이지가 읽는 `combine_policy` 칸(`COMBINE_COLUMNS`) — 이 칸을 바꾸면 확률 안내가 함께 바뀐다. */
const DISCLOSED = new Set<string>(COMBINE_COLUMNS)

type CombinePolicyUpdate = Database['public']['Tables']['combine_policy']['Update']

/**
 * 등급별 기본 완성 포인트의 기본값 — 마이그레이션 222 시드(운영 로직 8.6절)와 같다. 코드에 따로 있던 값이 아니라 이 화면이 «기본값»을 보이려고 두는 사본이다.
 * 시드를 바꾸는 마이그레이션을 쓰면 같은 티켓에서 이 상수도 바꾼다(시험이 시드 SQL과 대조한다).
 */
export const COLLECTION_DEFAULT_TIER_REWARDS: Readonly<Record<TierName, number>> = {
  common: 100,
  rare: 200,
  epic: 400,
  mystic: 800,
}

/** 등급별 기본 포인트의 칸 이름(`default_reward:epic`). 저장 본문·이력의 `field`와 같다. */
export function tierRewardKey(tier: TierName): string {
  return `default_reward:${tier}`
}

/** `default_reward:epic` → `epic`. 등급이 아니면 `null`. */
export function parseTierRewardKey(key: string): TierName | null {
  const match = /^default_reward:([a-z]+)$/.exec(key)
  if (!match) return null
  return (TIER_ORDER as readonly string[]).includes(match[1]) ? (match[1] as TierName) : null
}

export const COLLECTION_TIER_KEYS: readonly string[] = TIER_ORDER.map(tierRewardKey)

export const TIER_REWARD_GROUP = '컬렉션 등급별 완성 포인트'
export const COMBINE_GROUP = '믹스'

const TIER_LABEL: Readonly<Record<TierName, string>> = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

function tierField(tier: TierName): BalanceFieldDef {
  return {
    key: tierRewardKey(tier),
    label: TIER_LABEL[tier],
    unit: '포인트',
    group: TIER_REWARD_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: COLLECTION_DEFAULT_TIER_REWARDS[tier],
    affectsDisclosure: false,
  }
}

/**
 * 칸 정의. 범위는 DB CHECK와 같다: 등급별 기본 포인트는 마이그레이션 222(0 이상), 믹스 실패 포인트는 마이그레이션 153(0 이상). 둘 다 정수이고 0이면 지급을 생략한다.
 * 윗등급 확률은 마이그레이션 287의 CHECK(0 이상 1 이하)를 화면 단위로 옮긴 0~100(%)이고 소수 첫째 자리까지다. 기본값은 `DEFAULT_COMBINE_POLICY`(0.7)를 퍼센트로 바꾼 70이다.
 */
export const COLLECTION_FIELDS: readonly BalanceFieldDef[] = [
  ...TIER_ORDER.map(tierField),
  {
    key: FAIL_REWARD_KEY,
    label: '믹스 실패 포인트',
    unit: '포인트',
    hint: '0이면 포인트를 주지 않아요.',
    group: COMBINE_GROUP,
    decimals: 0,
    min: 0,
    max: INTEGER_MAX,
    defaultValue: DEFAULT_COMBINE_POLICY.fail_reward_points,
    affectsDisclosure: DISCLOSED.has(FAIL_REWARD_KEY),
  },
  {
    key: TIER_UP_PROBABILITY_KEY,
    label: '등급 올리기 윗등급 확률',
    unit: '%',
    hint: '같은 등급 5개로 등급 올리기를 했을 때 한 등급 위가 나올 확률이에요. 나머지는 같은 등급이 나와요. Epic 5개가 Mystic이 될 확률도 같은 값이에요.',
    group: COMBINE_GROUP,
    decimals: 1,
    min: 0,
    max: 100,
    defaultValue: fractionToPercent(DEFAULT_COMBINE_POLICY.tier_up_probability),
    affectsDisclosure: DISCLOSED.has(TIER_UP_PROBABILITY_KEY),
  },
]

/** 읽기에 쓰는 칸 목록(타입이 칸 이름을 알도록 글자 그대로 둔다). */
export const COLLECTION_TIER_SELECT = 'tier, reward_points, updated_at'
export const COLLECTION_COMBINE_SELECT = 'fail_reward_points, tier_up_probability, updated_at'

interface CollectionRows {
  /** 등급 → 기본 포인트와 수정 시각. 네 등급이 모두 있다. */
  tiers: Map<TierName, { points: number; stamp: string }>
  /** `points`는 믹스 실패 포인트, `tierUpFraction`은 DB에 저장된 0~1 그대로의 윗등급 확률(되돌릴 때 이 값을 쓴다). */
  combine: { points: number; tierUpFraction: number; stamp: string }
}

function rowsStamp(rows: CollectionRows): string {
  return latestStamp([...[...rows.tiers.values()].map((tier) => tier.stamp), rows.combine.stamp])
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 두 표를 가공 없이 읽는다(윗등급 확률의 퍼센트 변환은 읽기 함수가 한다). 등급 행이 모자라거나 숫자가 아닌 칸이 있으면 던진다(기본값으로 바꿔 보이지 않는다). */
async function readRows(service: BalanceServiceClient): Promise<CollectionRows> {
  const [tierRes, combineRes] = await Promise.all([
    service.from('item_book_tier_default_rewards').select(COLLECTION_TIER_SELECT),
    service.from('combine_policy').select(COLLECTION_COMBINE_SELECT).eq('id', 1).maybeSingle(),
  ])
  if (tierRes.error) throw new Error(`컬렉션 등급별 기본 포인트 조회 실패: ${tierRes.error.message}`)
  if (combineRes.error) throw new Error(`믹스 정책 조회 실패: ${combineRes.error.message}`)
  if (!combineRes.data) throw new Error('믹스 정책 조회 실패: id=1 행이 없음')

  const tiers = new Map<TierName, { points: number; stamp: string }>()
  for (const row of tierRes.data ?? []) {
    const tier = (TIER_ORDER as readonly string[]).includes(row.tier) ? (row.tier as TierName) : null
    if (tier === null) continue
    const points = dbNumber(row.reward_points)
    if (points === null) throw new Error(`컬렉션 등급별 기본 포인트 조회 실패: ${tier} 값을 숫자로 읽을 수 없음`)
    tiers.set(tier, { points, stamp: row.updated_at })
  }
  for (const tier of TIER_ORDER) {
    if (!tiers.has(tier)) throw new Error(`컬렉션 등급별 기본 포인트 조회 실패: ${tier} 행이 없음`)
  }

  const failPoints = dbNumber(combineRes.data.fail_reward_points)
  if (failPoints === null) throw new Error(`믹스 정책 조회 실패: ${FAIL_REWARD_KEY} 값을 숫자로 읽을 수 없음`)
  const tierUpFraction = dbNumber(combineRes.data.tier_up_probability)
  if (tierUpFraction === null) throw new Error(`믹스 정책 조회 실패: ${TIER_UP_PROBABILITY_KEY} 값을 숫자로 읽을 수 없음`)
  return { tiers, combine: { points: failPoints, tierUpFraction, stamp: combineRes.data.updated_at } }
}

export const COLLECTION_BINDING: BalanceSectionBinding = {
  id: COLLECTION_SECTION_ID,
  fields: COLLECTION_FIELDS,
  validators: Object.fromEntries(
    COLLECTION_FIELDS.map((def) => [
      def.key,
      def.key === TIER_UP_PROBABILITY_KEY
        ? (n: number) => Number.isFinite(n) && n >= 0 && n <= 100
        : (n: number) => Number.isInteger(n) && n >= 0,
    ])
  ),

  async read(service) {
    const rows = await readRows(service)
    const values: BalanceValues = {}
    for (const tier of TIER_ORDER) values[tierRewardKey(tier)] = rows.tiers.get(tier)?.points ?? 0
    values[FAIL_REWARD_KEY] = rows.combine.points
    values[TIER_UP_PROBABILITY_KEY] = fractionToPercent(rows.combine.tierUpFraction)
    return { values, updatedAt: rowsStamp(rows) }
  },

  async write(service, input): Promise<BalanceWriteResult> {
    const tierPatch: Array<{ tier: TierName; value: number }> = []
    // combine_policy는 한 행이라 두 칸(믹스 실패 포인트, 윗등급 확률)을 한 번의 갱신으로 쓴다. 윗등급 확률은 화면 퍼센트를 0~1로 바꿔 쓴다.
    const combinePatch: Pick<CombinePolicyUpdate, 'fail_reward_points' | 'tier_up_probability'> = {}
    for (const [key, value] of Object.entries(input.values)) {
      const tier = parseTierRewardKey(key)
      if (tier !== null) tierPatch.push({ tier, value })
      else if (key === FAIL_REWARD_KEY) combinePatch.fail_reward_points = value
      else if (key === TIER_UP_PROBABILITY_KEY) combinePatch.tier_up_probability = percentToFraction(value)
    }
    tierPatch.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier))
    const combineTouched = combinePatch.fail_reward_points !== undefined || combinePatch.tier_up_probability !== undefined
    if (tierPatch.length === 0 && !combineTouched) return { ok: false, reason: 'error', message: '바꿀 칸이 없음' }

    let rows: CollectionRows
    try {
      rows = await readRows(service)
    } catch (e) {
      return { ok: false, reason: 'error', message: messageOf(e) }
    }
    if (rowsStamp(rows) !== input.expectedUpdatedAt) return { ok: false, reason: 'conflict' }

    const ops: RowOp[] = []
    for (const { tier, value } of tierPatch) {
      const before = rows.tiers.get(tier)
      if (!before) return { ok: false, reason: 'error', message: `${tier} 행이 없음` }
      ops.push({
        label: tierRewardKey(tier),
        apply: async () =>
          toRowOutcome(
            await service
              .from('item_book_tier_default_rewards')
              .update({ reward_points: value, updated_at: input.nextUpdatedAt })
              .eq('tier', tier)
              .eq('updated_at', before.stamp)
              .select('updated_at')
          ),
        undo: async (appliedStamp) =>
          didUndo(
            await service
              .from('item_book_tier_default_rewards')
              .update({ reward_points: before.points, updated_at: before.stamp })
              .eq('tier', tier)
              .eq('updated_at', appliedStamp)
              .select('updated_at')
          ),
      })
    }
    if (combineTouched) {
      const before = rows.combine
      // 바꾸는 칸만 이전 값으로 되돌린다(바꾸지 않은 칸은 건드리지 않는다)
      const restore: CombinePolicyUpdate = { updated_at: before.stamp }
      if (combinePatch.fail_reward_points !== undefined) restore.fail_reward_points = before.points
      if (combinePatch.tier_up_probability !== undefined) restore.tier_up_probability = before.tierUpFraction
      ops.push({
        label: 'combine_policy',
        apply: async () =>
          toRowOutcome(
            await service
              .from('combine_policy')
              .update({ ...combinePatch, updated_at: input.nextUpdatedAt })
              .eq('id', 1)
              .eq('updated_at', before.stamp)
              .select('updated_at')
          ),
        undo: async (appliedStamp) =>
          didUndo(await service.from('combine_policy').update(restore).eq('id', 1).eq('updated_at', appliedStamp).select('updated_at')),
      })
    }

    const result = await runRowOps(COLLECTION_SECTION_ID, ops)
    if (!result.ok) return result

    // 구역의 수정 시각 = 이번에 쓴 행들(모두 같은 시각)과 쓰지 않은 행들 가운데 가장 늦은 것
    const touched = new Set(tierPatch.map((entry) => entry.tier))
    const untouched = [
      ...[...rows.tiers.entries()].filter(([tier]) => !touched.has(tier)).map(([, tier]) => tier.stamp),
      ...(combineTouched ? [] : [rows.combine.stamp]),
    ]
    return { ok: true, updatedAt: latestStamp([...result.stamps, ...untouched]) }
  },
}
