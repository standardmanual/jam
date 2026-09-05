/**
 * 2단 교차 게이트 — 축 내 교차 · 축 간 교차 · 미션 보상 배지 (v5 B2, 티켓 20260905_0030 §3)
 *
 * 마스터 티켓 20260905_0026의 게이트 표를 그대로 옮긴 판정이다.
 *
 * | 관문 | 조건 | 조건 필드 |
 * |---|---|---|
 * | Rare → Epic | 축 내 교차 **또는** 축 간 교차 | `cross_in_axis` / `cross_between_axis` |
 * | Epic → Mystic | 축 간 교차 **+** 미션 보상 배지 | `cross_between_axis` + `gate_mission_badge` |
 *
 * ## 왜 별도 파일인가
 * `index.ts`의 `evaluateBadgeGates()`는 세 후보 루프(등급형·레벨형·반복형)가 공유하는
 * 클로저다. 판정 로직까지 그 안에 두면 보유 컨텍스트가 캡처된 채 섞여 단위 테스트가
 * 불가능해진다. `activityFilters.ts`·`badgeKind.ts`와 같은 태도로 **순수 함수**만 뺐다.
 *
 * ## 세 가지 원칙
 *
 * ① **대상은 이름이 아니라 `family_key`다.** v5는 「무한레벨형·반복형이 등급형과 이름을
 *   공유할 수 있다」를 설계 전제로 두므로 이름은 배지를 유일하게 식별하지 못한다
 *   (티켓 20260905_0030 B-6). `prerequisite_badge_names`는 이름 기반이라 그 모호성을
 *   없앨 수 없어 「등급형 보유 이름만 본다」로 좁혔고, 신규 게이트는 처음부터 계열 기준이다.
 *
 * ② **형태가 어긋나면 통과가 아니라 차단이다(fail-closed).** `condition_json`은 jsonb라
 *   형태 보장이 없다. 게이트 값이 깨져 있을 때 「검사할 게 없으니 통과」로 두면 게이트가
 *   조용히 사라진다 — 이 티켓이 없애려는 실패 모드 그 자체다.
 *
 * ③ **교차는 종목 경계를 넘지 않는다.** 마스터 티켓: 「축은 같은 종목 안에서만 공유한다 —
 *   교차도 미션도 종목 경계를 넘지 않는다」. 보유 배지의 `activity_types`가 이 배지와
 *   하나도 겹치지 않으면 교차로 인정하지 않는다.
 */
import type { ActivityType, BadgeCondition, BadgeGateRequirement, BadgeRow } from '@/types/database'
import { RARITY_TIER, RARITY_LABEL, rarityTier } from '@/lib/rarity'
import { familyKeyOf } from './badgeKind'

/**
 * 게이트 판정에 필요한 «보유 배지 정의» 한 건 (티켓 20260905_0030 B-5).
 *
 * 예전에는 보유 컨텍스트가 이름 `Set<string>` 하나뿐이라 계열·등급·종목을 볼 수 없었다.
 * 보유 정의 조회는 이미 이 값들을 읽고 있었고 **버리고 있었을 뿐이다.**
 */
export type OwnedBadgeDef = Pick<
  BadgeRow,
  'id' | 'name' | 'rarity' | 'level' | 'family_key' | 'activity_types' | 'condition_json'
>

/**
 * 게이트 성격의 조건 키 — **활동 1건을 보고 판정하는 술어가 아니다.**
 *
 * `collectRepeatOccurrences`(index.ts)의 fail-closed 가드가 「회차 술어가 소비하지 않는 키가
 * 조건에 있으면 회차 0」으로 떨어뜨리므로, 이 목록을 그 `consumed` 집합에 넣지 않으면
 * **게이트가 붙은 반복형 배지의 회차가 통째로 0이 된다**(티켓 20260905_0030 B-10).
 * `prerequisite_badge_names`가 이미 그 상태였다(카탈로그에 반복형이 0건이라 잠복).
 */
export const GATE_CONDITION_KEYS = [
  'prerequisite_badge_names',
  'cross_in_axis',
  'cross_between_axis',
  'gate_mission_badge',
] as const

/** 게이트 판정 결과. 막혔으면 어드민 미발급 사유에 그대로 실린다 */
export type CrossGateResult =
  | { pass: true }
  | { pass: false; reason: string; actual: string; required: string }

const REQUIREMENT_LABEL: Record<(typeof GATE_CONDITION_KEYS)[number], string> = {
  prerequisite_badge_names: '선행 배지',
  cross_in_axis: '축 내 교차',
  cross_between_axis: '축 간 교차',
  gate_mission_badge: '미션 보상 배지',
}

type RequirementKey = 'cross_in_axis' | 'cross_between_axis' | 'gate_mission_badge'

/** 형태 검증을 통과한 요구. `familyKeys`에서 자기 계열은 이미 빠져 있다 */
type NormalizedRequirement = {
  familyKeys: string[]
  minRarityTier: number
  minRarityLabel: string | null
  minCount: number
}

/**
 * 요구 값의 형태를 검증하고 정규화한다. 어긋나면 사유 문자열을 돌려준다(통과가 아니다).
 *
 * **자기 계열은 대상에서 제외한다.** §3이 「교차 대상은 조건이 겹치지 않는 계열이어야 한다」로
 * 경계한 것 중 엔진이 확실하게 판정할 수 있는 유일한 경우다 — 자기 계열을 지정하면 이 배지를
 * 받는 활동이 곧 교차 대상까지 채워 게이트가 항상 자동 통과된다. 제외 후 대상이 남지 않으면
 * 그 게이트는 «표현 자체가 잘못된» 것이므로 막는다.
 */
function normalizeRequirement(
  raw: unknown,
  selfFamilyKey: string
): { ok: true; value: NormalizedRequirement } | { ok: false; error: string } {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '객체가 아님' }
  }
  const req = raw as Partial<BadgeGateRequirement>

  if (!Array.isArray(req.family_keys)) return { ok: false, error: 'family_keys 없음' }
  const keys = req.family_keys.filter((k): k is string => typeof k === 'string' && k.length > 0)
  if (keys.length !== req.family_keys.length) return { ok: false, error: 'family_keys에 문자열이 아닌 값' }
  if (keys.length === 0) return { ok: false, error: 'family_keys 비어 있음' }

  const targets = [...new Set(keys)].filter((k) => k !== selfFamilyKey)
  if (targets.length === 0) return { ok: false, error: '교차 대상이 자기 계열뿐' }

  let minRarityTier = 0
  let minRarityLabel: string | null = null
  if (req.min_rarity !== undefined) {
    if (typeof req.min_rarity !== 'string' || !(req.min_rarity in RARITY_TIER)) {
      return { ok: false, error: `min_rarity 값 오류(${String(req.min_rarity)})` }
    }
    minRarityTier = RARITY_TIER[req.min_rarity]
    minRarityLabel = RARITY_LABEL[req.min_rarity]
  }

  let minCount = 1
  if (req.min_count !== undefined) {
    if (typeof req.min_count !== 'number' || !Number.isInteger(req.min_count) || req.min_count < 1) {
      return { ok: false, error: `min_count 값 오류(${String(req.min_count)})` }
    }
    minCount = req.min_count
  }
  // 요구 개수가 대상 계열 수보다 많으면 영원히 통과할 수 없다 — 카탈로그 오류다
  if (minCount > targets.length) {
    return { ok: false, error: `min_count(${minCount})가 대상 계열 수(${targets.length})보다 큼` }
  }

  return { ok: true, value: { familyKeys: targets, minRarityTier, minRarityLabel, minCount } }
}

/** 두 종목 목록이 하나라도 겹치는가. 어느 한쪽이 비어 있으면 «종목 제한 없음»으로 본다 */
function sharesActivityType(a: readonly ActivityType[] | null, b: readonly ActivityType[] | null): boolean {
  if (!a || a.length === 0 || !b || b.length === 0) return true
  return a.some((t) => b.includes(t))
}

/**
 * 요구를 만족하는 계열 수를 센다.
 *
 * `requireMissionReward`가 true면 보유 배지가 실제 미션 보상 배지여야 한다 — 일반 배지를
 * 가리킨 `gate_mission_badge`가 조용히 통과하는 것을 막는다.
 */
function countSatisfiedFamilies(
  req: NormalizedRequirement,
  ownedDefs: readonly OwnedBadgeDef[],
  gatedActivityTypes: readonly ActivityType[] | null,
  requireMissionReward: boolean,
  /**
   * 미충족 계열 키를 여기에 담는다(선택). 미발급 사유에 「어느 계열이 비었는지」를 싣기 위함 —
   * 대상이 3계열이어도 사유가 「해당 계열 배지 미보유」 하나뿐이면 550종 시딩(티켓 0035) 후
   * 어드민 시뮬레이터에서 원인을 좁힐 수 없다(B2 개선 리뷰).
   */
  unmetOut?: string[]
): number {
  let matched = 0
  for (const familyKey of req.familyKeys) {
    const hit = ownedDefs.some((owned) => {
      if (familyKeyOf(owned) !== familyKey) return false
      if (!sharesActivityType(gatedActivityTypes, owned.activity_types)) return false
      if (requireMissionReward) {
        if ((owned.condition_json as BadgeCondition | null)?.mission_reward !== true) return false
      }
      // min_rarity가 없으면 «그 계열의 배지를 하나라도 보유»다(무한레벨형 계열도 대상이 된다).
      // 있으면 등급 서열 비교이므로 등급이 없는 배지(레벨형)는 만족시킬 수 없다 — rarityTier가
      // 0을 돌려주는 것은 «서열의 맨 아래»가 아니라 «이 서열에 속하지 않는다»는 뜻이다.
      if (req.minRarityTier > 0 && rarityTier(owned.rarity) < req.minRarityTier) return false
      return true
    })
    if (hit) matched += 1
    else unmetOut?.push(familyKey)
  }
  return matched
}

/** 미발급 사유의 `required` 문자열 — 「계열 A 또는 B, Rare 이상」 */
function describeRequirement(key: RequirementKey, req: NormalizedRequirement): string {
  const joiner = req.minCount > 1 ? ', ' : ' 또는 '
  const families = req.familyKeys.join(joiner)
  const parts = [`${REQUIREMENT_LABEL[key]}: 계열 ${families}`]
  if (req.minCount > 1) parts.push(`${req.minCount}개 이상`)
  if (req.minRarityLabel) parts.push(`${req.minRarityLabel} 이상`)
  return parts.join(' / ')
}

/**
 * 2단 교차 게이트 판정. 통과하면 `{ pass: true }`, 막히면 미발급 사유를 담아 돌려준다.
 *
 * ## 결합 규칙 (마스터 티켓 20260905_0026의 게이트 표를 그대로 옮긴 것)
 * - `cross_in_axis` ↔ `cross_between_axis`: **OR** — 둘 다 선언하면 하나만 충족해도 통과한다
 *   (Rare → Epic: 「축 내 교차 **또는** 축 간 교차」)
 * - 교차 요구 ↔ `gate_mission_badge`: **AND** — 미션 게이트는 언제나 따로 충족해야 한다
 *   (Epic → Mystic: 「축 간 교차 **+** 미션 보상 배지」)
 *
 * 축 내 교차가 성립하지 않는 축(9축 중 5축)은 `cross_between_axis`만 선언하면 된다 —
 * 그때는 OR의 한쪽이 없으므로 그 하나가 곧 필수 요건이 된다.
 */
export function evaluateCrossGates(
  badge: Pick<BadgeRow, 'name' | 'family_key' | 'activity_types'>,
  condition: BadgeCondition,
  ownedDefs: readonly OwnedBadgeDef[]
): CrossGateResult {
  const selfFamilyKey = familyKeyOf(badge)
  const declared: RequirementKey[] = (['cross_in_axis', 'cross_between_axis', 'gate_mission_badge'] as const).filter(
    (k) => condition[k] !== undefined
  )
  if (declared.length === 0) return { pass: true }

  const normalized = new Map<RequirementKey, NormalizedRequirement>()
  for (const key of declared) {
    const result = normalizeRequirement(condition[key], selfFamilyKey)
    if (!result.ok) {
      // fail-closed — 형태가 깨진 게이트를 「검사할 게 없으니 통과」로 두면 게이트가 사라진다.
      // **형태 오류일 때만** 로그를 남긴다(정상 미충족까지 남기면 싱크마다 폭발한다).
      // 이게 없으면 카탈로그 한 행의 family_keys 오타가 「그 배지는 영원히 안 나온다」로
      // 조용히 남는다 — missed는 어드민 시뮬레이터만 읽고 실 싱크에서는 아무도 보지 않는다
      // (A묶음이 가입 앵커에 남긴 관측 로그와 같은 태도, B2 개선 리뷰).
      console.warn(
        `[badge-engine] 교차 게이트 설정 오류 — badge: ${badge.name}, ${REQUIREMENT_LABEL[key]}: ${result.error}`
      )
      return {
        pass: false,
        reason: '교차 게이트 설정 오류',
        actual: `${REQUIREMENT_LABEL[key]}: ${result.error}`,
        required: '계열 키 목록(family_keys)이 있는 교차 게이트',
      }
    }
    normalized.set(key, result.value)
  }

  /** 키별 미충족 계열 — 미발급 사유에 실어 어느 계열이 비었는지 드러낸다 */
  const unmetByKey = new Map<RequirementKey, string[]>()
  const satisfied = (key: RequirementKey): boolean => {
    const req = normalized.get(key)
    if (!req) return false
    const unmet: string[] = []
    const matched = countSatisfiedFamilies(
      req,
      ownedDefs,
      badge.activity_types,
      key === 'gate_mission_badge',
      unmet
    )
    unmetByKey.set(key, unmet)
    return matched >= req.minCount
  }

  /** 「미보유 계열: walking:밤의 보행자」 — 계열을 특정하지 못하면 기존 문구로 폴백 */
  const describeUnmet = (keys: readonly RequirementKey[]): string => {
    const families = keys.flatMap((k) => unmetByKey.get(k) ?? [])
    return families.length > 0 ? `미보유 계열: ${families.join(', ')}` : '해당 계열 배지 미보유'
  }

  // ── ① 교차 요구 (축 내 · 축 간) — 선언된 것끼리 OR
  const crossKeys = (['cross_in_axis', 'cross_between_axis'] as const).filter((k) => normalized.has(k))
  if (crossKeys.length > 0 && !crossKeys.some(satisfied)) {
    return {
      pass: false,
      reason: crossKeys.length > 1 ? '교차 게이트 미충족 — 축 내 교차 또는 축 간 교차' : `${REQUIREMENT_LABEL[crossKeys[0]]} 미충족`,
      actual: describeUnmet(crossKeys),
      required: crossKeys.map((k) => describeRequirement(k, normalized.get(k)!)).join(' 또는 '),
    }
  }

  // ── ② 미션 보상 배지 — 교차 요구와 AND
  if (normalized.has('gate_mission_badge') && !satisfied('gate_mission_badge')) {
    return {
      pass: false,
      reason: '미션 보상 배지 미보유',
      actual: describeUnmet(['gate_mission_badge']),
      required: describeRequirement('gate_mission_badge', normalized.get('gate_mission_badge')!),
    }
  }

  return { pass: true }
}
