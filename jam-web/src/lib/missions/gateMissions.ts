/**
 * 게이트 미션의 순수 로직 — 매트릭스 조립 · 노출 규칙 파싱 · 정합성 검사
 * (티켓 20260905_0033, 마스터 20260905_0026 §게이트)
 *
 * ## 이 파일에 두는 것 / 두지 않는 것
 * React·Supabase에 의존하지 않는 «판정과 조립»만 둔다. 어드민 화면
 * (`app/admin/gate-missions/**`)과 API(`app/api/admin/gate-missions/**`)와
 * 노출 판정 데이터 조회(`visibility-server.ts`)가 **같은 함수**를 부른다.
 *
 * 노출 «판정» 자체는 `visibility.ts`에만 있다 — 여기서 다시 선언하지 않는다.
 * 계열 요구의 형태 검증도 2단 교차 게이트와 같은 `normalizeGateRequirement()`를 쓴다
 * (`src/lib/badge-engine/crossGate.ts`).
 *
 * ## 축(axis)은 목록으로 고정하지 않는다
 * v5의 9축은 카탈로그(티켓 20260905_0035)가 정한다. ENUM이나 상수 배열로 굳히면 축을
 * 하나 바꿀 때마다 마이그레이션·배포가 필요해진다. 대신 **실제로 쓰이고 있는 축을
 * 데이터에서 모아** 매트릭스를 그리고, 그 축에 두 단계가 다 채워졌는지를 검사한다.
 */
import type {
  BadgeCondition,
  BadgeRow,
  MissionGateStage,
  MissionRow,
  MissionVisibilityRule,
} from '@/types/database'
import { MISSION_GATE_STAGES } from '@/types/database'
import {
  normalizeGateRequirement,
  describeGateRequirementTargets,
  type NormalizedGateRequirement,
} from '@/lib/badge-engine/crossGate'
import { familyKeyOf, isLeveledBadge } from '@/lib/badge-engine/badgeKind'
import { isValidFamilyKey } from '@/lib/admin/badge-families'

/** 게이트 단계 라벨 — 화면·검사 문구의 단일 출처 */
export const GATE_STAGE_LABEL: Record<MissionGateStage, string> = {
  rare_to_epic: 'Rare → Epic',
  epic_to_mystic: 'Epic → Mystic',
}

/** 노출 규칙 안에서 계열 요구를 담는 두 자리 */
export const VISIBILITY_RULE_REQUIREMENT_KEYS = ['require_owned', 'hide_when_owned'] as const
export type VisibilityRuleRequirementKey = (typeof VISIBILITY_RULE_REQUIREMENT_KEYS)[number]

export const VISIBILITY_RULE_REQUIREMENT_LABEL: Record<VisibilityRuleRequirementKey, string> = {
  require_owned: '노출 조건(이 배지를 보유해야 보여요)',
  hide_when_owned: '숨김 조건(이 배지를 보유하면 숨겨요)',
}

/** 판정·검사에 필요한 미션 필드만 추린 형태 */
export type GateMissionInput = Pick<
  MissionRow,
  'id' | 'title' | 'gate_axis' | 'gate_stage' | 'visibility_rule_json' | 'reward_badge_ids' | 'gated_badge_id'
>

/** 검사에 필요한 배지 필드만 추린 형태 */
export type GateMissionBadge = Pick<
  BadgeRow,
  'id' | 'name' | 'rarity' | 'level' | 'family_key' | 'deleted_at' | 'condition_json' | 'activity_types'
>

// ── 축 ──────────────────────────────────────────────────────────────────────

/**
 * 축 키로 쓸 수 있는 형태인가 — 계열 키와 **같은 규칙**이다(`isValidFamilyKey`).
 * `{종목}:{축슬러그}` 꼴이며, 쉼표(목록 구분자)와 `#`(폴백 접두어)를 막는다.
 * 마이그레이션 135의 `missions_gate_axis_format` CHECK가 DB에서도 같은 것을 막는다.
 */
export function isValidGateAxis(axis: string): boolean {
  return isValidFamilyKey(axis)
}

/** 축 키의 종목 부분 (`walking:거리` → `walking`). 형태가 아니면 null */
export function gateAxisActivityType(axis: string): string | null {
  const idx = axis.indexOf(':')
  return idx > 0 ? axis.slice(0, idx) : null
}

/** 축 키의 이름 부분 (`walking:거리` → `거리`) */
export function gateAxisLabel(axis: string): string {
  const idx = axis.indexOf(':')
  return idx >= 0 ? axis.slice(idx + 1) : axis
}

// ── 노출 규칙 ────────────────────────────────────────────────────────────────

/** 정규화된 노출 규칙. 어드민 화면이 그대로 문장으로 보여준다 */
export interface ParsedVisibilityRule {
  requirements: { key: VisibilityRuleRequirementKey; value: NormalizedGateRequirement }[]
  unmetVisibility: 'locked' | 'hidden'
}

export type ParseVisibilityRuleResult =
  | { ok: true; value: ParsedVisibilityRule | null }
  | { ok: false; error: string }

/**
 * 노출 규칙의 형태를 검증하고 정규화한다. **어긋나면 통과가 아니라 오류다(fail-closed)** —
 * `visibility.ts`가 같은 형태 오류를 `locked`로 떨어뜨리므로, 어드민은 그 상태를 저장
 * 시점에 잡아 「저장은 되는데 아무에게도 안 보이는 미션」을 만들지 않는다.
 *
 * `null`(규칙 없음)은 오류가 아니라 「노출 제한 없음」이다.
 */
export function parseVisibilityRule(raw: unknown): ParseVisibilityRuleResult {
  if (raw == null) return { ok: true, value: null }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '객체가 아님' }

  const rule = raw as MissionVisibilityRule & Record<string, unknown>

  const allowed = new Set<string>([...VISIBILITY_RULE_REQUIREMENT_KEYS, 'unmet_visibility'])
  const unknownKeys = Object.keys(rule).filter((k) => !allowed.has(k))
  if (unknownKeys.length > 0) return { ok: false, error: `모르는 키(${unknownKeys.join(', ')})` }

  if (rule.unmet_visibility !== undefined && rule.unmet_visibility !== 'locked' && rule.unmet_visibility !== 'hidden') {
    return { ok: false, error: `unmet_visibility 값 오류(${String(rule.unmet_visibility)})` }
  }

  const requirements: ParsedVisibilityRule['requirements'] = []
  for (const key of VISIBILITY_RULE_REQUIREMENT_KEYS) {
    const value = rule[key]
    if (value === undefined || value === null) continue
    const result = normalizeGateRequirement(value)
    if (!result.ok) return { ok: false, error: `${VISIBILITY_RULE_REQUIREMENT_LABEL[key]}: ${result.error}` }
    requirements.push({ key, value: result.value })
  }

  return { ok: true, value: { requirements, unmetVisibility: rule.unmet_visibility ?? 'locked' } }
}

/** 규칙 한 줄을 사람이 읽는 문장으로 — 어드민 목록·미리보기가 같은 문구를 쓴다 */
export function describeVisibilityRule(parsed: ParsedVisibilityRule | null): string {
  if (!parsed || parsed.requirements.length === 0) return '노출 조건 없음 (항상 보임)'
  return parsed.requirements
    .map((r) => `${VISIBILITY_RULE_REQUIREMENT_LABEL[r.key]} — ${describeGateRequirementTargets(r.value)}`)
    .join(' · ')
}

/**
 * 미션 목록의 노출 규칙이 가리키는 계열 키 전체 (중복 제거).
 *
 * `visibility-server.ts`가 「어떤 계열의 보유 여부를 조회해야 하는가」를 이 함수로 정한다 —
 * 조회 대상과 판정 대상이 갈리면 「규칙은 요구하는데 조회하지 않은 계열」이 생기고,
 * 그 계열은 항상 미보유로 판정돼 미션이 영영 잠긴다.
 *
 * 형태가 깨진 규칙은 어차피 `visibility.ts`가 fail-closed로 잠그므로 여기서도 건너뛴다.
 */
export function collectRuleFamilyKeys(
  missions: readonly Pick<GateMissionInput, 'visibility_rule_json'>[],
): string[] {
  const keys = new Set<string>()
  for (const mission of missions) {
    const parsed = parseVisibilityRule(mission.visibility_rule_json)
    if (!parsed.ok || !parsed.value) continue
    for (const req of parsed.value.requirements) {
      for (const key of req.value.familyKeys) keys.add(key)
    }
  }
  return [...keys]
}

// ── 매트릭스 (축 × 단계) ────────────────────────────────────────────────────

export interface GateMatrixRow {
  axis: string
  activityType: string | null
  /** 단계별 미션. 비어 있으면 «구멍»이다 */
  cells: Record<MissionGateStage, GateMissionInput[]>
  /** 두 단계가 다 채워졌는가 */
  complete: boolean
}

/** 게이트 미션만 골라낸다 — `gate_axis`가 정본이다 */
export function isGateMission(mission: Pick<GateMissionInput, 'gate_axis'>): boolean {
  return mission.gate_axis != null && mission.gate_axis !== ''
}

/**
 * 「레거시 게이트 미션」 — v5 이전의 레벨업 미션 15종. 축이 없고 `gated_badge_id`로만
 * 게이팅한다. 티켓 판단 ②에 따라 **폐기 대상**이지만 폐기 시점은 티켓 20260905_0035
 * 시딩과 맞춰야 한다(먼저 지우면 그동안 게이트가 열린 채로 남는다). 이 티켓은 식별
 * 수단만 남긴다 — 마이그레이션 135 하단의 «폐기 절차» 주석이 같은 식을 쓴다.
 */
export function isLegacyGateMission(mission: Pick<GateMissionInput, 'gate_axis' | 'gated_badge_id'>): boolean {
  return !isGateMission(mission) && !!mission.gated_badge_id
}

/** 축 × 단계 격자. 축은 종목 → 이름 순으로 정렬한다 */
export function buildGateMatrix(missions: readonly GateMissionInput[]): GateMatrixRow[] {
  const byAxis = new Map<string, GateMissionInput[]>()
  for (const mission of missions) {
    if (!isGateMission(mission)) continue
    const axis = mission.gate_axis as string
    const list = byAxis.get(axis)
    if (list) list.push(mission)
    else byAxis.set(axis, [mission])
  }

  return [...byAxis.entries()]
    .map(([axis, list]) => {
      const cells = {
        rare_to_epic: list.filter((m) => m.gate_stage === 'rare_to_epic'),
        epic_to_mystic: list.filter((m) => m.gate_stage === 'epic_to_mystic'),
      } satisfies Record<MissionGateStage, GateMissionInput[]>
      return {
        axis,
        activityType: gateAxisActivityType(axis),
        cells,
        complete: MISSION_GATE_STAGES.every((stage) => cells[stage].length > 0),
      }
    })
    .sort((a, b) => a.axis.localeCompare(b.axis, 'ko'))
}

// ── 정합성 검사 ──────────────────────────────────────────────────────────────

export type GateIssueLevel = 'error' | 'warn' | 'info'

export interface GateMissionIssue {
  level: GateIssueLevel
  /** 검사 항목 식별자 — 테스트가 문구가 아니라 이 값으로 단언한다 */
  code:
    | 'axis_stage_gap'
    | 'axis_stage_duplicate'
    | 'invalid_axis_format'
    | 'invalid_visibility_rule'
    | 'unknown_family_key'
    | 'rarity_requirement_on_leveled_family'
    | 'reward_badge_missing'
    | 'reward_badge_deleted'
    | 'reward_badge_not_mission_reward'
    | 'reward_family_not_gated'
    | 'no_visibility_rule'
    | 'legacy_gate_mission'
  message: string
  axis?: string
  stage?: MissionGateStage
  missionIds?: string[]
}

export interface GateConsistencyInput {
  missions: readonly GateMissionInput[]
  /** 활동 배지 전량(소프트삭제 제외) — 계열 존재 여부·`gate_mission_badge` 참조 확인용 */
  activityBadges: readonly GateMissionBadge[]
  /** 미션이 참조하는 배지 id → 배지. **소프트삭제된 것도 포함**해야 «삭제됨»을 구분할 수 있다 */
  referencedBadges: ReadonlyMap<string, GateMissionBadge>
}

/**
 * 게이트 미션 설정의 정합성 검사.
 *
 * 티켓이 요구한 세 가지(축 구멍 / 축·단계 중복 / 보상 배지 비활성·삭제)에 더해, **게이트가
 * 조용히 꺼지거나 영원히 안 열리는 설정**을 함께 잡는다. 이 화면이 아니면 그 상태를 볼 수
 * 있는 곳이 없다 — 노출 규칙 형태 오류는 `visibility.ts`가 `console.warn` + `locked`로
 * 처리하고 끝이라 운영자에게 도달하지 않는다.
 */
export function checkGateMissionConsistency(input: GateConsistencyInput): GateMissionIssue[] {
  const { missions, activityBadges, referencedBadges } = input
  const issues: GateMissionIssue[] = []

  const gateMissions = missions.filter(isGateMission)

  // 존재하는 계열 키 — `familyKeyOf()` 기준(엔진·싱크·계열 화면과 같은 규칙)
  const existingFamilyKeys = new Set(activityBadges.map((b) => familyKeyOf(b)))
  // 계열이 «레벨형만으로 이뤄졌는가» — 등급 요구를 걸면 영원히 미충족이 된다
  const gradedFamilyKeys = new Set(
    activityBadges.filter((b) => !isLeveledBadge(b)).map((b) => familyKeyOf(b)),
  )
  // 어떤 배지든 `gate_mission_badge`로 가리키고 있는 계열
  const gatedByMysticFamilyKeys = new Set<string>()
  for (const badge of activityBadges) {
    const requirement = (badge.condition_json as BadgeCondition | null)?.gate_mission_badge
    if (requirement === undefined) continue
    // 형태가 깨진 게이트는 엔진이 fail-closed로 막는다 — 「가리키고 있다」로 세지 않는다
    const normalized = normalizeGateRequirement(requirement, familyKeyOf(badge))
    if (!normalized.ok) continue
    for (const key of normalized.value.familyKeys) gatedByMysticFamilyKeys.add(key)
  }

  // ── ① 축 × 단계 커버리지 ─────────────────────────────────────────────────
  for (const row of buildGateMatrix(gateMissions)) {
    for (const stage of MISSION_GATE_STAGES) {
      const cell = row.cells[stage]
      if (cell.length === 0) {
        issues.push({
          level: 'error',
          code: 'axis_stage_gap',
          axis: row.axis,
          stage,
          message: `${row.axis} 축의 ${GATE_STAGE_LABEL[stage]} 단계에 미션이 없어요. 이 단계는 아무도 열 수 없어요.`,
        })
      } else if (cell.length > 1) {
        issues.push({
          level: 'error',
          code: 'axis_stage_duplicate',
          axis: row.axis,
          stage,
          missionIds: cell.map((m) => m.id),
          message: `${row.axis} 축의 ${GATE_STAGE_LABEL[stage]} 단계에 미션이 ${cell.length}개예요. 한 칸에는 미션 1개만 두세요.`,
        })
      }
    }
  }

  // ── ② 미션별 검사 ────────────────────────────────────────────────────────
  for (const mission of gateMissions) {
    const axis = mission.gate_axis as string
    const base = { axis, stage: mission.gate_stage ?? undefined, missionIds: [mission.id] }

    if (!isValidGateAxis(axis)) {
      issues.push({
        ...base,
        level: 'error',
        code: 'invalid_axis_format',
        message: `"${mission.title}"의 축 형태가 올바르지 않아요(${axis}). "종목:축이름" 형태로, 쉼표 없이 입력해주세요.`,
      })
    }

    const parsed = parseVisibilityRule(mission.visibility_rule_json)
    if (!parsed.ok) {
      issues.push({
        ...base,
        level: 'error',
        code: 'invalid_visibility_rule',
        message: `"${mission.title}"의 노출 조건 형태가 올바르지 않아요(${parsed.error}). 이 미션은 아무에게도 열리지 않아요.`,
      })
    } else if (!parsed.value || parsed.value.requirements.length === 0) {
      issues.push({
        ...base,
        level: 'warn',
        code: 'no_visibility_rule',
        message: `"${mission.title}"에 노출 조건이 없어요. 모든 유저에게 처음부터 보여요.`,
      })
    } else {
      for (const req of parsed.value.requirements) {
        for (const familyKey of req.value.familyKeys) {
          if (!existingFamilyKeys.has(familyKey)) {
            issues.push({
              ...base,
              level: 'error',
              code: 'unknown_family_key',
              message: `"${mission.title}"의 ${VISIBILITY_RULE_REQUIREMENT_LABEL[req.key]}가 없는 계열(${familyKey})을 가리켜요.`,
            })
            continue
          }
          if (req.value.minRarityTier > 0 && !gradedFamilyKeys.has(familyKey)) {
            issues.push({
              ...base,
              level: 'error',
              code: 'rarity_requirement_on_leveled_family',
              message: `"${mission.title}"의 ${VISIBILITY_RULE_REQUIREMENT_LABEL[req.key]}가 레벨형 계열(${familyKey})에 등급 조건을 걸었어요. 등급이 없는 계열이라 영원히 충족되지 않아요.`,
            })
          }
        }
      }
    }

    // 보상 배지 — 게이트 미션의 보상 배지가 곧 Mystic을 여는 열쇠다
    const rewardIds = (mission.reward_badge_ids ?? []).filter(Boolean)
    if (rewardIds.length === 0) {
      issues.push({
        ...base,
        level: 'error',
        code: 'reward_badge_missing',
        message: `"${mission.title}"에 보상 배지가 없어요. 게이트 미션은 보상 배지가 Mystic을 여는 열쇠예요.`,
      })
    }
    for (const rewardId of rewardIds) {
      const badge = referencedBadges.get(rewardId)
      if (!badge || badge.deleted_at) {
        issues.push({
          ...base,
          level: 'error',
          code: 'reward_badge_deleted',
          message: `"${mission.title}"의 보상 배지(${badge?.name ?? rewardId})가 삭제됐어요. 이 미션을 완료해도 배지가 지급되지 않아요.`,
        })
        continue
      }
      if ((badge.condition_json as BadgeCondition | null)?.mission_reward !== true) {
        issues.push({
          ...base,
          level: 'warn',
          code: 'reward_badge_not_mission_reward',
          message: `"${mission.title}"의 보상 배지 "${badge.name}"에 미션 보상 표시(mission_reward)가 없어요. Mystic의 미션 게이트가 이 배지를 인정하지 않아요.`,
        })
      }
      const rewardFamilyKey = familyKeyOf(badge)
      if (!gatedByMysticFamilyKeys.has(rewardFamilyKey)) {
        issues.push({
          ...base,
          level: 'warn',
          code: 'reward_family_not_gated',
          message: `"${mission.title}"의 보상 배지 계열(${rewardFamilyKey})을 미션 게이트(gate_mission_badge)로 가리키는 배지가 없어요. 이 미션을 완료해도 열리는 배지가 없어요.`,
        })
      }
    }
  }

  // ── ③ 폐기 대상(레거시 게이트 미션) ──────────────────────────────────────
  const legacy = missions.filter(isLegacyGateMission)
  if (legacy.length > 0) {
    issues.push({
      level: 'info',
      code: 'legacy_gate_mission',
      missionIds: legacy.map((m) => m.id),
      message: `v5 이전 방식(게이트 배지)으로 게이팅하는 미션이 ${legacy.length}개 있어요. 티켓 20260905_0035 카탈로그 시딩과 함께 폐기할 대상이에요.`,
    })
  }

  return issues
}

// ── 저장 검증 ────────────────────────────────────────────────────────────────

/**
 * 게이트 필드(`gate_axis`·`gate_stage`·`visibility_rule_json`)의 저장 검증.
 * 막아야 할 이유가 있으면 사람이 읽는 문구를, 없으면 null을 돌려준다.
 *
 * **어드민 폼과 API가 같은 함수를 부른다.** 폼에만 두면 API 직접 호출로 새어 들어오고,
 * API에만 두면 저장 버튼을 눌러야 오류를 알 수 있다.
 *
 * 여기서 막는 것은 「저장하면 아무에게도 안 보이거나, 매트릭스에서 자리를 못 잡는」 형태다.
 * «축은 있는데 미션이 없는 구멍» 같은 **전체 배치**의 문제는 저장을 막을 수 없으므로
 * `checkGateMissionConsistency`가 화면에서 알린다.
 *
 * ⚠️ 마이그레이션 135의 CHECK 제약과 **같은 것을 막는다.** DB 제약은 마지막 방어선이고
 * (거기서 걸리면 운영자는 Postgres 에러 문자열을 본다), 이 함수는 그 앞에서 한국어로 막는다.
 */
export function findGateMissionSaveError(body: {
  gate_axis?: unknown
  gate_stage?: unknown
  visibility_rule_json?: unknown
  gated_badge_id?: unknown
}): string | null {
  const axis = body.gate_axis
  const stage = body.gate_stage
  const hasAxis = typeof axis === 'string' && axis.length > 0
  const hasStage = typeof stage === 'string' && stage.length > 0

  if (axis != null && typeof axis !== 'string') return '저장할 수 없어요. 여는 축 값이 올바르지 않아요.'
  if (hasAxis && !isValidGateAxis(axis as string)) {
    return `저장할 수 없어요. 여는 축 형태(${axis})가 올바르지 않아요. "종목:축이름" 형태로, 쉼표 없이 입력해주세요.`
  }
  if (hasStage && !MISSION_GATE_STAGES.includes(stage as MissionGateStage)) {
    return `저장할 수 없어요. 게이트 단계 값이 올바르지 않아요(${String(stage)}).`
  }
  if (hasAxis !== hasStage) {
    return '저장할 수 없어요. 여는 축과 게이트 단계는 둘 다 지정하거나 둘 다 비워야 해요.'
  }
  if (hasAxis && typeof body.gated_badge_id === 'string' && body.gated_badge_id.length > 0) {
    return '저장할 수 없어요. 게이트 미션은 예전 방식의 게이트 배지를 함께 쓸 수 없어요. 게이트 배지를 비워주세요.'
  }

  const rule = body.visibility_rule_json
  if (rule !== undefined && rule !== null) {
    if (!hasAxis) return '저장할 수 없어요. 노출 조건은 게이트 미션(여는 축이 있는 미션)에만 설정할 수 있어요.'
    const parsed = parseVisibilityRule(rule)
    if (!parsed.ok) {
      return `저장할 수 없어요. 노출 조건 형태가 올바르지 않아요(${parsed.error}). 대상 계열 키(family_key)를 하나 이상 골라주세요.`
    }
  }
  return null
}
