/**
 * 미션 노출 판정 — 목록·상세·참가 API·오늘카드가 공유하는 단일 규칙 (티켓 20260825_028)
 *
 * 순수 함수만 둔다(Supabase·React 의존 없음). 서버에서 필요한 데이터 조회는
 * `visibility-server.ts`가 담당하고, 판정 자체는 반드시 이 파일을 거치게 해서
 * 화면마다 규칙이 갈라지지 않게 한다.
 *
 * ## 판정 규칙
 *
 *  1. `user_mission_completions`에 기록이 있으면 → `completed` (완료 판정의 단일 기준.
 *     "보상배지 보유"를 기준으로 쓰면 배지 소프트삭제로 지급이 스킵된 경우
 *     완료한 미션이 되살아난다 — 티켓 20260825_016·018)
 *  2. **`gate_axis`가 있으면 게이트 미션** → 축·단계 기반 노출 규칙
 *     (`visibility_rule_json`)으로 판정한다. 아래 §게이트 미션 참조 (티켓 20260905_0033)
 *  3. `gated_badge_id`가 없으면 → `open` (게이팅 없는 일반 기간형 미션)
 *  4. **레거시 게이팅** — 게이트 배지 등급(gateTier)과 유저가 보유한 같은 이름 배지의
 *     최고 등급(ownedTier) 비교. v5 이전의 레벨업 미션 15종이 쓰는 경로다
 *     - gateTier ≤ ownedTier + 1 → `open`   (바로 다음 1단계만 참가 가능)
 *     - gateTier = ownedTier + 2 → `locked` (그 다음 1단계는 잠금 카드로만 노출)
 *     - 그 위                    → `hidden` (목록에서 완전 제외)
 *     - 미보유(ownedTier=0)는 Common 보유(1)로 취급한다 — Common 배지가 없는 신규 유저에게도
 *       첫 레벨업 미션(Rare용)은 항상 노출한다는 요구사항(티켓 20260825_028 §2).
 *  5. 위 판정이 `hidden`이더라도 유저의 참가 이력(`user_mission_participations`)이 있으면
 *     `locked`로 완화한다 — 완전 숨김 상태에서는 유저가 자기 참가 이력을 어디서도 볼 수
 *     없기 때문이다(티켓 20260825_029). `open`/`completed`/`locked` 판정에는 관여하지 않는다.
 *
 * 완료 판정이 배지 보유보다 앞선다: 본 배지를 이미 받았더라도 완료 기록이 있으면 `completed`.
 *
 * ## 게이트 미션 (v5, 티켓 20260905_0033)
 *
 * v5는 「종목당 8개 × 5종목 = 미션 40개」가 Mystic·Lv.8+를 여는 열쇠가 된다. 그 노출 조건은
 * «해당 축 Epic 보유 **AND** Mystic 미보유»인데, 레거시 규칙(§4)은 「본 배지 등급 = 보유
 * 등급 + 1」밖에 말할 수 없어 이를 표현하지 못한다. 그래서 축·단계와 노출 규칙을 데이터로
 * 옮겼다(`missions.gate_axis` · `gate_stage` · `visibility_rule_json`, 마이그레이션 135).
 *
 * - `require_owned` 미충족 → `unmet_visibility`(기본 `locked`)
 * - `hide_when_owned` 충족 → `hidden` (이미 다음 자리에 도달 — 미션의 역할이 끝났다)
 * - 둘 다 통과 → `open`
 *
 * 대상은 **이름이 아니라 계열(`family_key`)**이다. v5는 「무한레벨형·반복형이 등급형과
 * 이름을 공유할 수 있다」를 설계 전제로 두므로 이름은 배지를 유일하게 식별하지 못한다
 * (티켓 20260905_0030 B-6). 요구의 형태 검증은 2단 교차 게이트와 **같은 함수**
 * (`normalizeGateRequirement`)를 쓴다 — 게이트 미션은 `gate_mission_badge` 요구의 «대상»이라
 * (티켓 20260905_0030 B2) 두 판정이 어긋나면 「미션은 열렸는데 Mystic은 안 열리는」 상태가 된다.
 *
 * ## ⚠️ 게이팅은 «조용히 꺼지는» 방향으로 실패하면 안 된다
 *
 * 예전 §4 구현은 `RARITY_TIER[gatedBadge.rarity] ?? 0`으로 게이트 등급을 읽었다. v5에서
 * `badges.rarity`가 nullable이 되면서(마이그레이션 130) **등급 없는 배지(무한레벨형)를
 * 게이트로 걸면 `0 <= 1`이 되어 `open`을 돌려줬다 — 에러도 로그도 없이 게이팅이 통째로
 * 꺼진다.** 이 저장소가 반복해 겪은 유형이다(마스터 티켓 20260905_0026 B-1의
 * `rarityTier(badge.rarity) <= highestOwned`도 같은 형태였다).
 *
 * 그래서 이 파일은 두 가지를 지킨다:
 *  - **`0`은 「서열의 맨 아래」가 아니라 「이 서열에 속하지 않는다」**는 뜻으로 다룬다
 *    (`rarityTier()`, 티켓 20260905_0027). 등급 없는 배지가 레거시 게이트에 걸려 있으면
 *    판정 불가로 보고 `locked` + 경고 로그를 남긴다 — 통과시키지 않는다
 *  - 게이트 미션의 노출 규칙 **형태가 깨지면 통과가 아니라 차단이다(fail-closed)**.
 *    `visibility_rule_json`은 jsonb라 형태 보장이 없다
 *
 * 반대로 **레거시 게이트 배지를 «찾을 수 없는» 경우만** fail-open(open)을 유지한다 —
 * 삭제·오설정 하나로 기간형 미션이 통째로 사라지는 것보다 낫다는 기존 판단
 * (티켓 20260825_028·029)이고, 그 경우는 `visibility-server.ts`가 경고 로그로 관측한다.
 */
import type { BadgeRarity, MissionGateStage, MissionVisibilityRule } from '@/types/database'
// 등급 서열표는 @/lib/rarity 한 곳에만 둔다 (티켓 20260831_1115에서 통합)
import { RARITY_TIER, rarityTier } from '@/lib/rarity'
// 계열 요구의 형태 검증은 2단 교차 게이트와 같은 함수를 쓴다 — 재선언하지 않는다
import { normalizeGateRequirement, type NormalizedGateRequirement } from '@/lib/badge-engine/crossGate'

/** 티어 값 → 배지 등급 (잠금 안내에 쓸 "먼저 획득해야 하는 등급" 역산용) */
const RARITY_BY_TIER: Record<number, BadgeRarity> = { 1: 'common', 2: 'rare', 3: 'epic', 4: 'mystic' }

/** 미보유 유저에게도 첫 레벨업 미션(Rare용)을 노출하기 위한 하한 티어 */
const MIN_EFFECTIVE_TIER = RARITY_TIER.common

export type MissionVisibility = 'open' | 'locked' | 'hidden' | 'completed'

/**
 * 게이트가 걸린 본 배지 정보 (레거시 경로).
 *
 * `rarity`가 nullable인 이유: 마이그레이션 130에서 `badges.rarity`가 nullable이 됐다
 * (무한레벨형). 타입을 `BadgeRarity`로 두면 DB에서 온 null이 타입 위에서만 사라지고
 * 판정은 그 null을 만난다 — 게이팅이 조용히 꺼지던 경로가 그것이다.
 */
export interface GatedBadgeInfo {
  id: string
  name: string
  rarity: BadgeRarity | null
}

/** 판정에 필요한 미션 필드만 추린 최소 형태 */
export interface MissionVisibilityInput {
  id: string
  gated_badge_id: string | null
  /**
   * 게이트 미션이 여는 축. null이면 게이트 미션이 아니다 (티켓 20260905_0033).
   *
   * ⚠️ 마이그레이션 135가 아직 실행되지 않은 환경에서는 이 필드가 런타임에 `undefined`다.
   * 그래서 판정은 `!= null`로 확인해 레거시 경로로 떨어뜨린다 — 배포 순서가 어긋나도
   * 미션 목록이 통째로 깨지지 않는다(`join/route.ts`가 `select('*')`를 쓰는 것과 같은 이유).
   */
  gate_axis: string | null
  gate_stage: MissionGateStage | null
  visibility_rule_json: MissionVisibilityRule | null
}

export interface MissionVisibilityContext {
  /** 유저가 완료한 미션 id (user_mission_completions 기준) */
  completedMissionIds: ReadonlySet<string>
  /** gated_badge_id → 본 배지 정보. 없는 id(삭제된 배지 등)는 게이팅 없음으로 취급 */
  gatedBadges: ReadonlyMap<string, GatedBadgeInfo>
  /** 유저가 보유한 배지 이름별 최고 등급 티어 (미보유는 키 없음) — 레거시 경로 전용 */
  ownedTierByBadgeName: ReadonlyMap<string, number>
  /**
   * 유저가 보유한 **계열**(`badges.family_key`)별 최고 등급 티어 — 게이트 미션 경로.
   *
   * **키가 있으면 「그 계열의 배지를 보유」**이고, 값 `0`은 「등급이 없는 배지(무한레벨형)만
   * 보유」다 — 「서열의 맨 아래」가 아니다. 그래서 `min_rarity`가 걸린 요구는 값 0으로
   * 만족되지 않는다(레벨형 계열에 등급 요구를 걸면 영원히 막힌다 — 어드민 정합성 검사가
   * 그 설정을 잡는다).
   */
  ownedFamilyTiers: ReadonlyMap<string, number>
  /**
   * 유저가 참가한 적 있는 미션 id (user_mission_participations 기준).
   * `hidden` 판정을 `locked`로 완화하는 데만 쓴다 — open/completed/locked 우선순위는
   * 그대로 유지한다(티켓 20260825_029).
   */
  participatedMissionIds: ReadonlySet<string>
}

export interface MissionVisibilityResult {
  visibility: MissionVisibility
  /**
   * locked/hidden일 때 "이 미션을 열려면 먼저 획득해야 하는 배지".
   * 레거시 게이팅 경로에서만 채워진다(게이트 배지의 바로 아래 등급 — 예: 첫 숨결 Epic
   * 게이트 → 첫 숨결 Rare). 게이트 미션은 요구가 «계열 목록»이라 배지 하나로 특정되지
   * 않으므로 null이고, 화면은 일반 잠금 문구(`d.missions.lockedBodyGeneric`)를 쓴다.
   */
  requiredBadge: { name: string; rarity: BadgeRarity } | null
}

const OPEN: MissionVisibilityResult = { visibility: 'open', requiredBadge: null }
const LOCKED: MissionVisibilityResult = { visibility: 'locked', requiredBadge: null }
const HIDDEN: MissionVisibilityResult = { visibility: 'hidden', requiredBadge: null }

/**
 * 계열 요구를 유저의 보유 계열로 판정한다.
 *
 * - `min_rarity`가 없으면(minRarityTier=0) 「그 계열의 배지를 하나라도 보유」 — 무한레벨형
 *   계열도 대상이 된다
 * - 있으면 등급 서열 비교다. 등급이 없는 배지만 보유한 계열은 티어가 0이라 만족시키지
 *   못한다 — `0`은 「서열 밖」이지 「맨 아래」가 아니다(티켓 20260905_0027)
 */
function countSatisfiedFamilies(
  req: NormalizedGateRequirement,
  ownedFamilyTiers: ReadonlyMap<string, number>,
): number {
  let matched = 0
  for (const familyKey of req.familyKeys) {
    if (req.minRarityTier === 0) {
      if (ownedFamilyTiers.has(familyKey)) matched += 1
      continue
    }
    if ((ownedFamilyTiers.get(familyKey) ?? 0) >= req.minRarityTier) matched += 1
  }
  return matched
}

function satisfiesRequirement(
  req: NormalizedGateRequirement,
  ownedFamilyTiers: ReadonlyMap<string, number>,
): boolean {
  return countSatisfiedFamilies(req, ownedFamilyTiers) >= req.minCount
}

/**
 * 게이트 미션(축·단계 기반)의 노출 판정.
 *
 * 형태가 깨진 규칙은 **fail-closed**로 `locked`다. 「검사할 게 없으니 통과」로 두면
 * 게이트가 에러도 로그도 없이 사라진다 — 이 티켓이 없애려는 실패 모드 그 자체다.
 */
function resolveGateMissionVisibility(
  mission: MissionVisibilityInput,
  ctx: MissionVisibilityContext,
): MissionVisibilityResult {
  const rule = mission.visibility_rule_json
  // 규칙이 아예 없으면 「노출 제한 없음」이다 — 축만 지정하고 조건을 두지 않은 게이트 미션은
  // 처음부터 모두에게 보인다(어드민 정합성 검사가 이 상태를 «노출 조건 없음»으로 알린다).
  if (rule == null) return OPEN

  if (typeof rule !== 'object' || Array.isArray(rule)) {
    console.warn(`[missions/visibility] 노출 조건 형태 오류(객체가 아님) — mission: ${mission.id}`)
    return LOCKED
  }

  // 아는 키가 하나도 없는 규칙({foo:1} 같은 것)은 fail-closed로 잠근다. 저장 검증
  // (parseVisibilityRule)과 마이그레이션 135의 CHECK가 앞에서 막으므로 실사용 경로로는
  // 도달하지 않지만, 여기서 통과시키면 「규칙이 있는데 아무 조건도 안 걸린 미션」이
  // 조용히 전체 공개가 된다 — 이 파일이 표방하는 fail-closed와 어긋나는 유일한 자리였다.
  const KNOWN_RULE_KEYS = ['require_owned', 'hide_when_owned', 'unmet_visibility']
  const unknownKeys = Object.keys(rule).filter((k) => !KNOWN_RULE_KEYS.includes(k))
  if (unknownKeys.length > 0) {
    console.warn(
      `[missions/visibility] 노출 조건에 모르는 키가 있어 잠근다 — mission: ${mission.id}, ` +
        `키: ${unknownKeys.join(', ')}`,
    )
    return LOCKED
  }

  const requirements: { key: 'require_owned' | 'hide_when_owned'; value: NormalizedGateRequirement }[] = []
  for (const key of ['require_owned', 'hide_when_owned'] as const) {
    const raw = rule[key]
    if (raw === undefined || raw === null) continue
    const result = normalizeGateRequirement(raw)
    if (!result.ok) {
      console.warn(
        `[missions/visibility] 노출 조건 형태 오류 — mission: ${mission.id}, ${key}: ${result.error}`,
      )
      return LOCKED
    }
    requirements.push({ key, value: result.value })
  }

  const hideWhenOwned = requirements.find((r) => r.key === 'hide_when_owned')?.value
  if (hideWhenOwned && satisfiesRequirement(hideWhenOwned, ctx.ownedFamilyTiers)) {
    return softenHidden(mission, ctx, HIDDEN)
  }

  const requireOwned = requirements.find((r) => r.key === 'require_owned')?.value
  if (requireOwned && !satisfiesRequirement(requireOwned, ctx.ownedFamilyTiers)) {
    return rule.unmet_visibility === 'hidden' ? softenHidden(mission, ctx, HIDDEN) : LOCKED
  }

  return OPEN
}

/**
 * hidden 대상이더라도 참가 이력이 있으면 완전 숨김 대신 locked로 완화한다 — 자기 참가
 * 이력을 어디서도 볼 수 없게 되는 것을 막기 위함(티켓 20260825_029).
 */
function softenHidden(
  mission: MissionVisibilityInput,
  ctx: MissionVisibilityContext,
  hidden: MissionVisibilityResult,
): MissionVisibilityResult {
  if (!ctx.participatedMissionIds.has(mission.id)) return hidden
  return { visibility: 'locked', requiredBadge: hidden.requiredBadge }
}

/** 미션 하나의 노출 상태를 판정한다. */
export function resolveMissionVisibility(
  mission: MissionVisibilityInput,
  ctx: MissionVisibilityContext,
): MissionVisibilityResult {
  if (ctx.completedMissionIds.has(mission.id)) {
    return { visibility: 'completed', requiredBadge: null }
  }

  // ── 게이트 미션 (v5) — 축·단계 기반 ──────────────────────────────────────
  // 마이그레이션 135의 CHECK가 `gate_axis`와 `gated_badge_id`의 공존을 막으므로 두 경로가
  // 한 미션에서 겹치지 않는다. 그래도 순서를 명시해 둔다: 축이 있으면 축이 정본이다.
  if (mission.gate_axis != null) return resolveGateMissionVisibility(mission, ctx)

  // ── 레거시 게이팅 (v5 이전 레벨업 미션 15종) ─────────────────────────────
  if (!mission.gated_badge_id) return OPEN

  const gatedBadge = ctx.gatedBadges.get(mission.gated_badge_id)
  // 게이트 배지를 찾을 수 없으면(삭제·오설정) 게이팅을 적용하지 않는다 — 잘못된 연결 하나로
  // 미션이 통째로 사라지는 것보다 그대로 노출되는 쪽이 안전하다.
  if (!gatedBadge) return OPEN

  const gateTier = rarityTier(gatedBadge.rarity)

  // ⚠️ 등급이 없는 배지(무한레벨형)를 레거시 게이트로 걸면 이 규칙(등급 서열 ±1 비교)은
  // 판정할 수 없다. 예전 코드는 `?? 0`으로 0을 얻어 `0 <= 1`이 성립해 **open을 돌려줬다** —
  // 에러도 로그도 없이 게이팅이 통째로 꺼졌다. 통과시키지 않고 잠근 뒤 경고를 남긴다.
  // (v5 게이트 미션은 이 경로를 쓰지 않는다 — `gate_axis` + `visibility_rule_json`이 정본이다)
  if (gateTier === 0) {
    console.warn(
      `[missions/visibility] 등급 없는 배지(무한레벨형)가 레거시 게이트로 걸려 있어 판정 불가 — ` +
        `mission: ${mission.id}, badge: ${gatedBadge.name}(${gatedBadge.id}). ` +
        `게이트 미션은 gate_axis + visibility_rule_json으로 설정해주세요.`,
    )
    return LOCKED
  }

  if (gateTier <= MIN_EFFECTIVE_TIER) return OPEN

  const ownedTier = ctx.ownedTierByBadgeName.get(gatedBadge.name) ?? 0
  const effectiveOwnedTier = Math.max(ownedTier, MIN_EFFECTIVE_TIER)

  if (gateTier <= effectiveOwnedTier + 1) return OPEN

  // 여기까지 왔으면 gateTier ≥ 2다(0은 위에서 잠갔고 1은 open이다) — 바로 아래 등급은
  // 항상 common/rare/epic 중 하나이므로 RARITY_BY_TIER에 값이 있다.
  const requiredBadge = {
    name: gatedBadge.name,
    rarity: RARITY_BY_TIER[gateTier - 1],
  }

  if (gateTier === effectiveOwnedTier + 2) {
    return { visibility: 'locked', requiredBadge }
  }

  return softenHidden(mission, ctx, { visibility: 'hidden', requiredBadge })
}

/** 미션 목록 전체를 한 번에 판정 — id → 결과 맵 */
export function resolveMissionVisibilityMap<T extends MissionVisibilityInput>(
  missions: readonly T[],
  ctx: MissionVisibilityContext,
): Map<string, MissionVisibilityResult> {
  const map = new Map<string, MissionVisibilityResult>()
  for (const m of missions) map.set(m.id, resolveMissionVisibility(m, ctx))
  return map
}

/** 참가(join) 가능 여부 — 목록/상세/API가 같은 기준을 쓰도록 이 함수 하나로 통일 */
export function isMissionJoinable(result: MissionVisibilityResult): boolean {
  return result.visibility === 'open'
}
