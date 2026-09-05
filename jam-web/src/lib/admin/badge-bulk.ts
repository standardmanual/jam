/**
 * 배지 카탈로그 일괄 작업의 «판정과 조립» (티켓 20260905_0034)
 *
 * React·Supabase에 의존하지 않는다 — 화면(`app/admin/badges/bulk/**`)과
 * API(`app/api/admin/badges/bulk/**`)가 **같은 함수**를 부른다. 조회는
 * `badge-bulk-query.ts`(서버 전용)가, 참조 카운트는 `badge-references.ts`가 맡는다.
 *
 * ## 폐기는 소프트삭제다 (2026-09-05 사용자 확정, 티켓 판단 ①)
 * `badges`에 `is_active` 컬럼은 **없다.** 어드민이 말하는 「비활성화」는 `deleted_at = now()`의
 * 표시 이름이고, 엔진이 이미 `.is('deleted_at', null)`로 거르므로 소프트삭제만으로 발급
 * 후보에서 즉시 빠진다. 이 도구에 **하드삭제 경로는 두지 않는다** — 되돌릴 수 없기 때문이다.
 * 그 대신 되살리기(`deleted_at = null`)도 **일괄로** 제공한다.
 */
import type { BadgeRarity, BadgeType } from '@/types/database'
import type { BadgeReferenceReport } from './badge-references'

export const BULK_ACTIONS = ['deactivate', 'restore', 'purge_earns'] as const
export type BulkAction = (typeof BULK_ACTIONS)[number]

export const BULK_ACTION_LABEL: Record<BulkAction, string> = {
  deactivate: '일괄 폐기(비활성화)',
  restore: '일괄 되살리기',
  purge_earns: '획득 이력 삭제',
}

/** 확인 문구에 들어가는 짧은 낱말 — 어드민이 손으로 타이핑한다 */
export const BULK_ACTION_WORD: Record<BulkAction, string> = {
  deactivate: '폐기',
  restore: '되살리기',
  purge_earns: '이력삭제',
}

export const BULK_ACTION_DESCRIPTION: Record<BulkAction, string> = {
  deactivate:
    '대상 배지를 발급 후보에서 빼요. 되돌릴 수 있어요(되살리기). 아직 안 주워진 월드 드랍도 함께 무효화돼요.',
  restore: '폐기한 배지를 다시 발급 후보에 넣어요. 무효화된 드랍은 되살아나지 않아요.',
  purge_earns:
    '대상 배지의 활동·체크인 획득 이력을 지워요. 포인트 원장(불변 기록)과 아이템 개체는 건드리지 않아요.',
}

/** 일괄 도구가 대상을 좁히는 축 */
export interface BulkTargetFilter {
  type: BadgeType | null
  activityType: string | null
  rarity: BadgeRarity | null
  /** 폐기분만/살아 있는 것만/전부 */
  status: 'active' | 'inactive' | 'all'
  q: string | null
  /** 계열 키 정확 일치 — 계열 관리 화면(20260905_0032)에서 계열 단위로 넘어오는 자리 */
  familyKey: string | null
}

export const EMPTY_BULK_FILTER: BulkTargetFilter = {
  type: null,
  activityType: null,
  rarity: null,
  status: 'active',
  q: null,
  familyKey: null,
}

/** 대상 목록에 보여주는 배지 한 건 */
export interface BulkTargetBadge {
  id: string
  name: string
  type: BadgeType
  rarity: BadgeRarity | null
  level: number | null
  family_key: string | null
  deleted_at: string | null
}

export interface BulkSkip {
  badgeId: string
  name: string
  reason: string
}

export interface BulkPlan {
  action: BulkAction
  /** 필터·선택으로 확정된 대상 전체 */
  badgeIds: string[]
  /** 실제로 바뀌는 대상 — 이미 그 상태인 배지는 빠진다 */
  actionableIds: string[]
  skipped: BulkSkip[]
  /** 화면에 보여줄 앞부분 (전량을 그리지 않는다) */
  preview: BulkTargetBadge[]
  references: BadgeReferenceReport
  /** 이 작업이 건드리는 «영향 건수» — 확인 문구에 들어가는 두 번째 숫자 */
  impactCount: number
  /** 어드민이 손으로 타이핑해야 하는 문구 */
  requiredPhrase: string
  /**
   * 이 계획을 **눈으로 본 사람만** 실행할 수 있게 하는 확인 토큰.
   * 계획 내용에서 계산하므로, 계획을 본 뒤 DB가 바뀌면 토큰이 달라져 실행이 거부된다.
   * (계열 일괄 재계산 `badge-families.ts`와 같은 방식이다)
   */
  token: string
}

/** 획득 이력 삭제가 실제로 지우는 자리 — 여기 없는 참조는 남는다 */
export const PURGE_EARN_SOURCE_KEYS = ['user_activity_badges', 'user_checkin_badge_earns'] as const

/**
 * 작업별 «영향 건수». 확인 문구에 대상 건수와 함께 들어간다(티켓 안전장치).
 *
 * - 폐기/되살리기: 대상 배지에 이미 걸려 있는 **모든 참조 합계**. 「몇 종을 끄는가」만으로는
 *   파급을 알 수 없다 — 획득 이력 3천 건짜리 배지와 0건짜리 배지가 같은 숫자로 보인다.
 * - 이력 삭제: **지워질 행 수**. 되돌릴 수 없는 값이라 이 숫자가 곧 위험도다.
 */
export function bulkImpactCount(action: BulkAction, references: BadgeReferenceReport): number {
  if (action === 'purge_earns') {
    return PURGE_EARN_SOURCE_KEYS.reduce((sum, key) => sum + (references.counts[key] ?? 0), 0)
  }
  return references.total
}

/** 「폐기 207/1043」 — 대상 건수와 영향 건수를 눈으로 읽고 손으로 옮겨 적게 한다 */
export function bulkConfirmPhrase(action: BulkAction, targetCount: number, impactCount: number): string {
  return `${BULK_ACTION_WORD[action]} ${targetCount}/${impactCount}`
}

const PREVIEW_LIMIT = 50

/**
 * 일괄 작업 «계획»을 만든다 — **여기서는 아무것도 쓰지 않는다.**
 * 쓰기는 이 계획의 토큰과 확인 문구를 되돌려받은 실행 단계에서만 일어난다.
 */
export function buildBulkPlan(
  action: BulkAction,
  targets: BulkTargetBadge[],
  references: BadgeReferenceReport
): BulkPlan {
  const badgeIds = targets.map((t) => t.id)
  const actionableIds: string[] = []
  const skipped: BulkSkip[] = []

  for (const target of targets) {
    if (action === 'deactivate' && target.deleted_at) {
      skipped.push({ badgeId: target.id, name: target.name, reason: '이미 폐기된 배지예요.' })
      continue
    }
    if (action === 'restore' && !target.deleted_at) {
      skipped.push({ badgeId: target.id, name: target.name, reason: '이미 살아 있는 배지예요.' })
      continue
    }
    actionableIds.push(target.id)
  }

  const impactCount = bulkImpactCount(action, references)
  const plan: Omit<BulkPlan, 'token'> = {
    action,
    badgeIds,
    actionableIds,
    skipped,
    preview: targets.slice(0, PREVIEW_LIMIT),
    references,
    impactCount,
    requiredPhrase: bulkConfirmPhrase(action, actionableIds.length, impactCount),
  }
  return { ...plan, token: bulkPlanToken(plan) }
}

/**
 * 계획 → 확인 토큰. 「무엇을·몇 건·어떤 영향으로」만으로 계산한다.
 *
 * `node:crypto`를 쓰지 않는 이유: 이 파일을 어드민 화면(클라이언트 컴포넌트)도 import한다.
 * 토큰은 비밀이 아니라 **「이 계획을 봤다」는 표식**이라 충돌 저항성만 있으면 된다.
 */
export function bulkPlanToken(plan: Omit<BulkPlan, 'token'>): string {
  const canonical = JSON.stringify([
    plan.action,
    [...plan.actionableIds].sort(),
    plan.impactCount,
    plan.references.counts,
  ])
  return `${fnv1a(canonical, 0x811c9dc5)}${fnv1a(canonical, 0x01000193)}`
}

function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * 실행을 막아야 하는 이유를 돌려준다. 없으면 null.
 *
 * **확인 없이는 쓰지 않는다.** 토큰이 없으면 영향 분석을 보지 않은 것이고, 토큰이 다르면
 * 분석을 본 뒤 대상이나 참조가 바뀐 것이다 — 둘 다 그대로 실행하면 안 된다.
 * 참조 조회가 한 자리라도 실패했으면(`references.error`) 건수 자체가 부분값이므로 막는다.
 */
export function findBulkConfirmError(plan: BulkPlan, token: unknown, phrase: unknown): string | null {
  if (plan.references.error) {
    return '실행할 수 없습니다. 영향 건수를 다 세지 못했어요. 잠시 뒤 다시 분석해주세요.'
  }
  if (plan.actionableIds.length === 0) {
    return '실행할 것이 없습니다. 대상 배지가 모두 이미 그 상태예요.'
  }
  if (typeof token !== 'string' || token.length === 0) {
    return '실행할 수 없습니다. 영향 분석을 먼저 확인해주세요.'
  }
  if (token !== plan.token) {
    return '실행할 수 없습니다. 확인한 뒤 대상이나 참조 건수가 바뀌었습니다. 영향 분석을 다시 확인해주세요.'
  }
  if (typeof phrase !== 'string' || phrase.trim() !== plan.requiredPhrase) {
    return `실행할 수 없습니다. 확인 문구가 달라요. "${plan.requiredPhrase}"를 그대로 입력해주세요.`
  }
  return null
}
