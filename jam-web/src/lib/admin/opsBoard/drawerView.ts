/**
 * 항목 서랍(상세 열)이 읽는 순수 함수 (티켓 20261026_2024 2회차, 어드민 상황판 PRD §6.3 서랍 구조). 서버 전용 모듈을 가져오지 않는다.
 *
 * - `keyValuesOf`: 「핵심 값」 줄(공개 기간·대상·모양·조건·보상). 없는 칸은 줄을 만들지 않는다.
 * - `reviewResultsOf`: 「검수 결과」 두 줄(윈터 세계관 검수, 혜린 밸런스 점검). 통과·확인 필요·기록 없음.
 * - `nextDecidableItemId`: 「빼기」·「이대로 두기」 다음에 보여 줄 결정할 항목.
 *
 * 제출 값은 자기 신고 JSON이라 모양을 믿지 않는다. 틀리거나 없으면 그 줄을 빼고, 화면은 죽지 않는다.
 */
import {
  asRecord,
  entriesOf,
  describeValue,
  itemField,
  truncateText,
  worldReviewOf,
  type ViewableItem,
} from '@/lib/admin/opsInbox/itemView'
import { formatKstClock, formatKstDayTime, kstDateKey } from '@/lib/admin/opsInbox/labels'
import { isDecidable } from '@/lib/admin/opsInbox/selection'
import type { BalanceLine } from '@/lib/admin/opsInbox/balance/view'
import type { OpsRoutineStageRecord } from '@/lib/admin/opsInbox/query'
import { isCardShape } from '@/lib/today/shape'

// ── 핵심 값 ──────────────────────────────────────────────────────────────

export interface KeyValueRow {
  /** 줄 이름: 공개 기간 · 대상 · 모양 · 조건 · 보상. */
  label: string
  value: string
}

interface KeyValueItem extends ViewableItem {
  kind: string | null
  startsAt: string | null
  endsAt: string | null
}

const CONDITION_MAX_CHARS = 80

/** 「12/30(목) 09:00 ~ 10:00」. 끝이 다른 날이면 날짜까지 쓴다. 한쪽만 있으면 「~부터」·「~까지」, 둘 다 없으면 null이다. */
export function periodText(startsAt: string | null, endsAt: string | null): string | null {
  const start = formatKstDayTime(startsAt)
  const end = formatKstDayTime(endsAt)
  if (start && end) {
    const sameDay = kstDateKey(startsAt) === kstDateKey(endsAt)
    return `${start} ~ ${sameDay ? formatKstClock(endsAt) : end}`
  }
  if (start) return `${start}부터`
  if (end) return `${end}까지`
  return null
}

function pointsText(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}포인트` : null
}

function badgeCountOf(resource: Record<string, unknown>): number {
  const ids = resource.reward_badge_ids
  if (Array.isArray(ids)) return ids.length
  return typeof resource.reward_badge_id === 'string' && resource.reward_badge_id !== '' ? 1 : 0
}

/** 대상: 노출 태그(`exposure_tags`)가 있으면 그것, 없으면 옛 칸 `segment`의 「이름: 값」이다. */
function targetText(item: ViewableItem): string | null {
  const tags = itemField(item, 'exposure_tags')
  if (Array.isArray(tags)) {
    const names = tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
    if (names.length > 0) return names.join(' · ')
  }
  const segment = itemField(item, 'segment')
  const entries = entriesOf(segment)
  if (entries === null) return describeValue(segment) || null
  return entries.length > 0 ? entries.map((entry) => `${entry.key}: ${entry.text}`).join(', ') : null
}

/** 조건: 종류마다 읽는 칸이 다르다(PRD 운영툴 §3.1·§5.2). JAM! 배지의 `resource.condition_json`만 있다. */
function conditionText(item: KeyValueItem, resource: Record<string, unknown>): string | null {
  if (item.kind !== 'jam_badge') return null
  const text = describeValue(resource.condition_json)
  return text ? truncateText(text, CONDITION_MAX_CHARS) : null
}

/** 보상: 미션·레시피·컬렉션은 `resource.reward_points`와 보상 배지 수, JAM! 배지는 `resource.point_reward`다. */
function rewardText(item: KeyValueItem, resource: Record<string, unknown>): string | null {
  if (item.kind === 'jam_badge') return pointsText(resource.point_reward)
  if (item.kind !== 'mission' && item.kind !== 'recipe' && item.kind !== 'collection_launch') return null
  const parts = [pointsText(resource.reward_points)]
  const badges = badgeCountOf(resource)
  if (badges > 0) parts.push(`보상 배지 ${badges}개`)
  const text = parts.filter(Boolean).join(' · ')
  return text || null
}

/** 서랍 「핵심 값」 줄. 순서는 공개 기간 → 대상 → 모양 → 조건 → 보상이다. 읽을 수 없는 칸은 줄을 그리지 않는다. */
export function keyValuesOf(item: KeyValueItem): KeyValueRow[] {
  const resource = asRecord(itemField(item, 'resource')) ?? {}
  const shape = itemField(item, 'shape')
  const rows: Array<[string, string | null]> = [
    ['공개 기간', periodText(item.startsAt, item.endsAt)],
    ['대상', targetText(item)],
    ['모양', isCardShape(shape) ? shape : null],
    ['조건', conditionText(item, resource)],
    ['보상', rewardText(item, resource)],
  ]
  return rows.flatMap(([label, value]) => (value ? [{ label, value }] : []))
}

// ── 검수 결과 ────────────────────────────────────────────────────────────

export type ReviewState = 'pass' | 'check' | 'none'

export interface ReviewResult {
  agent: 'winter' | 'hyerin'
  /** 「윈터 · 세계관 검수」 */
  title: string
  state: ReviewState
  /** 점 옆 글자: 통과 · 확인 필요 · 검수 기록 없음 / 점검 기록 없음. */
  stateText: string
  /** 한 줄 근거. 없으면 null. */
  reason: string | null
  /** 「10/20(화) 09:40」. 단계 기록이 없으면 null이다. */
  at: string | null
}

function stageEndedAt(stages: readonly OpsRoutineStageRecord[], stage: OpsRoutineStageRecord['stage']): string | null {
  // 같은 단계가 여러 번 적혀 있으면 가장 늦게 끝난 기록을 쓴다.
  const times = stages
    .filter((record) => record.stage === stage && record.endedAt !== null)
    .map((record) => record.endedAt as string)
    .sort((a, b) => Date.parse(b) - Date.parse(a))
  return formatKstDayTime(times[0] ?? null)
}

function winterResult(item: ViewableItem, stages: readonly OpsRoutineStageRecord[]): ReviewResult {
  const title = '윈터 · 세계관 검수'
  const review = worldReviewOf(item)
  if (!review) return { agent: 'winter', title, state: 'none', stateText: '검수 기록 없음', reason: null, at: null }
  const passed = review.winterReviewed === true || review.worldRelated === false
  return {
    agent: 'winter',
    title,
    state: passed ? 'pass' : 'check',
    stateText: passed ? '통과' : '확인 필요',
    reason: review.reason || null,
    at: stageEndedAt(stages, 'world_review'),
  }
}

function hyerinResult(stages: readonly OpsRoutineStageRecord[], balanceLines: readonly BalanceLine[] | undefined): ReviewResult {
  const title = '혜린 · 밸런스 점검'
  if (balanceLines === undefined) return { agent: 'hyerin', title, state: 'none', stateText: '점검 기록 없음', reason: null, at: null }
  const warn = balanceLines.find((line) => line.kind === 'warn')
  return {
    agent: 'hyerin',
    title,
    state: warn ? 'check' : 'pass',
    stateText: warn ? '확인 필요' : '통과',
    reason: warn ? warn.warning.message : null,
    at: stageEndedAt(stages, 'balance_check'),
  }
}

/**
 * 「검수 결과」 두 줄. 윈터는 항목의 `world_review`(`winter_reviewed`가 참이거나 `world_related`가 거짓이면 통과)를,
 * 혜린은 이 항목의 밸런스 경고 줄을 본다. `balanceLines`가 `undefined`면 평가 결과가 없다는 뜻이다.
 */
export function reviewResultsOf({
  item,
  stages,
  balanceLines,
}: {
  item: ViewableItem
  stages: readonly OpsRoutineStageRecord[]
  balanceLines: readonly BalanceLine[] | undefined
}): ReviewResult[] {
  return [winterResult(item, stages), hyerinResult(stages, balanceLines)]
}

// ── 다음 항목 ────────────────────────────────────────────────────────────

/**
 * 「빼기」·「이대로 두기」 뒤에 보여 줄 항목: `position` 순으로 현재 다음의 결정할 항목(검토중)이다.
 * 끝에 닿으면 처음부터 찾고, 결정할 항목이 자기밖에 없으면 null이다.
 */
export function nextDecidableItemId(
  items: readonly { id: string; position: number; status: string }[],
  currentId: string
): string | null {
  const ordered = [...items].sort((a, b) => a.position - b.position)
  const at = ordered.findIndex((item) => item.id === currentId)
  const candidates = at < 0 ? ordered : [...ordered.slice(at + 1), ...ordered.slice(0, at)]
  return candidates.find((item) => item.id !== currentId && isDecidable(item))?.id ?? null
}
