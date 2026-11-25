/**
 * DB 값 칩 규칙표와 값 → 칩 문구 변환 (티켓 20261121_0012, 상위 20261120_2026 4회차-1).
 *
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격」의 «칩 → DB 값 칩의 규칙표(초안)»다. 자원마다 어떤 값을 칩으로 낼지와
 * 구분 칩 문구를 한 표(`FEED_VALUE_CHIP_RULES`)로 두고, 값 하나를 칩 문구로 바꾸는 함수를 함께 둔다.
 *
 * - 값만 받는 순수 함수다(DB 조회·사전·훅 없음). 시각은 인자(`now`)로 받는다 — 시험이 날짜를 고정할 수 있다.
 * - 값이 없거나 0 이하이면 칩을 만들지 않는다. 칩 후보는 규칙표의 우선순위 순서로 낸다.
 *   카드당 칩 최대 2개 상한은 배정 쪽(`feedChipSlots.ts`의 `MAX_CARD_CHIPS`, `feedAssign.ts`)이 지킨다.
 * - 배지 달성 기준 문구는 어드민과 배지 화면이 쓰는 조건 문구 레지스트리(`badge-engine/conditionRegistry.ts`의 `chip`)를 그대로 쓴다. 문구를 새로 만들지 않는다.
 * - 칩 라벨은 해요체가 아닌 짧은 명사구다. 고정 용어(획득·드랍·픽업·체크인·포인트)는 UX 라이팅 가이드라인을 따른다.
 */
import { formatConditionChipEntries, getConditionField } from '@/lib/badge-engine/conditionRegistry'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import type { BadgeCondition, MissionCondition } from '@/types/database'

// ── 규칙표 ────────────────────────────────────────────────────

/** 값 칩을 내는 자원. 홈피드 카드가 소개하는 자원 중 칩이 있는 다섯 가지다. */
export type ValueChipResource = 'mission' | 'activity_badge' | 'collection' | 'checkin' | 'drop_pickup'

/** 값 칩의 종류. 규칙표의 `values`가 이 종류를 우선순위 순서로 나열한다. */
export type ValueChipKind =
  | 'remaining'
  | 'reward-points'
  | 'condition'
  | 'criteria'
  | 'level'
  | 'item-count'
  | 'required-badges'
  | 'place-name'

export interface ValueChipRule {
  /** 구분 칩(검정 바탕) 문구. «무엇인지 알린다». */
  readonly divider: string
  /** 값 칩 종류. 앞이 우선이다. 비어 있으면 값 칩이 없다. */
  readonly values: readonly ValueChipKind[]
}

/**
 * 자원별 DB 값 칩 규칙표(PRD 표 그대로).
 *
 * 값을 읽는 칸(코드 대조 결과, 4-2의 화면 연결이 이 칸을 `buildValueChips` 입력으로 넘긴다):
 * | 종류            | 읽는 칸                                                                                   |
 * |-----------------|--------------------------------------------------------------------------------------------|
 * | remaining       | `ResolvedMission.ends_at` (`cards.ts`, 카드 `resolved_mission`)                             |
 * | reward-points   | `ResolvedMission.reward_points`                                                             |
 * | condition       | `MissionRow.condition_json` (`MissionCondition`) — 지금 `ResolvedMission`에는 없는 칸이다   |
 * | criteria        | `BadgeRow.condition_json` (`BadgeCondition`) — 지금 `ResolvedBadge`에는 없는 칸이다         |
 * | level           | `BadgeRow.level` (무한레벨형 배지만. 등급형은 NULL) — 지금 `ResolvedBadge`에는 없는 칸이다  |
 * | item-count      | `ResolvedCollection.item_count`                                                             |
 * | required-badges | 카드에 걸린 체크인 배지 수(`resolved_badges.length`)                                        |
 * | place-name      | 카드의 `region_label` 또는 `PoiRow.name`                                                    |
 */
export const FEED_VALUE_CHIP_RULES: Readonly<Record<ValueChipResource, ValueChipRule>> = {
  mission: { divider: 'MISSION', values: ['remaining', 'reward-points', 'condition'] },
  activity_badge: { divider: 'ACTIVITY', values: ['criteria', 'level'] },
  collection: { divider: 'COLLECTION', values: ['item-count'] },
  checkin: { divider: 'CHECK IN', values: ['required-badges', 'place-name'] },
  drop_pickup: { divider: 'ITEM', values: [] },
}

/** 드랍·픽업 카드의 분류 칩 문구(영어 대문자, 티켓 20261122_2228 R1). 둘 다 분류 칩(`label`)이다. 규칙표의 «없음(문구 칩 드랍·픽업)». */
export const FEED_DROP_PICKUP_PHRASES = ['DROP', 'PICKUP'] as const

/**
 * 저장된 한글 구분 문구 → 화면에 보이는 영어 대문자 분류 문구(티켓 20261122_2228 R1, 2026-11-22 사용자 확정: 분류 칩은 «배지»를 빼고 영어 대문자).
 * 어드민이 옛 문구(`미션` 등)를 저장해 둔 카드도 영어로 보인다. 표에 없는 문구는 그대로 둔다(`toEnglishDivider`).
 */
export const FEED_DIVIDER_ENGLISH: Readonly<Record<string, string>> = {
  미션: 'MISSION',
  '액티비티 배지': 'ACTIVITY',
  '아이템 배지': 'ITEM',
  컬렉션: 'COLLECTION',
  체크인: 'CHECK IN',
  드랍: 'DROP',
  픽업: 'PICKUP',
}

/** 한글 구분 문구를 영어 대문자 분류 문구로 바꾼다. 표에 없으면(이미 영어이거나 다른 문구) 그대로 돌려준다. */
export function toEnglishDivider(text: string): string {
  return Object.prototype.hasOwnProperty.call(FEED_DIVIDER_ENGLISH, text) ? FEED_DIVIDER_ENGLISH[text] : text
}

/** 문구 칩 글자 수 상한(12자 제안, PRD «문구 칩», 확정은 1회차 후속 결정). 어겨도 막지 않고 경고만 한다. */
export const FEED_CHIP_TEXT_MAX_LENGTH = 12

// ── 값 → 문구 ────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
/** 종료까지 이 기간 이내일 때만 남은 기간 칩을 만든다(PRD: «종료 7일 이내»). */
const REMAINING_CHIP_WINDOW_MS = 7 * DAY_MS

function isPositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** 소수 첫째 자리까지만 쓰고 끝의 0을 뗀다(8 → «8», 8.5 → «8.5», 8.04 → «8»). 1,000 이상은 천 단위 쉼표. */
function formatNumber(value: number): string {
  return Number(value.toFixed(1)).toLocaleString('ko-KR', { maximumFractionDigits: 1 })
}

/**
 * 미션 남은 기간 칩. 종료가 지금부터 7일 이내일 때만 만든다 — 24시간 이내는 «N시간 남음»(올림, 최소 1시간), 그보다 길면 «N일 남음»(내림, 최소 1일).
 * 이미 끝났거나 7일보다 멀거나 종료가 없는(상시) 미션은 null이다. 필수 정보 줄의 남은 시간(`cardView.ts`)과 같은 규칙이다.
 */
export function formatRemainingChip(endsAt: string | null | undefined, now: Date): string | null {
  if (!endsAt) return null
  const end = new Date(endsAt).getTime()
  if (Number.isNaN(end)) return null
  const remaining = end - now.getTime()
  if (remaining <= 0 || remaining > REMAINING_CHIP_WINDOW_MS) return null
  if (remaining <= DAY_MS) return `${Math.ceil(remaining / HOUR_MS)}시간 남음`
  return `${Math.floor(remaining / DAY_MS)}일 남음`
}

/** 보상 포인트 칩(«500 포인트»). 값이 없거나 0이면 null. */
export function formatRewardPointsChip(points: number | null | undefined): string | null {
  return isPositive(points) ? `${points.toLocaleString('ko-KR')} 포인트` : null
}

/** 미션 조건 값 칩에 쓰는 `MissionCondition`의 칸들. */
export type MissionConditionValues = Pick<
  MissionCondition,
  'distance_km' | 'activity_type' | 'count' | 'streak_days' | 'duration_minutes' | 'elevation_gain_m'
>

/**
 * 미션 조건 값 칩 하나. 앞의 칸이 있으면 그것이 이긴다:
 * 거리(«걷기 8km», 종목이 없으면 «8km») → 상승고도(«상승고도 400m») → 횟수(«달리기 5회») → 연속 일수(«7일 연속») → 이동 시간(«60분»).
 * 값이 없거나 0이면 null이다(체크인 미션의 `poi_id`처럼 값이 없는 조건은 칩이 없다).
 */
export function formatMissionConditionChip(condition: MissionConditionValues | null | undefined): string | null {
  if (!condition) return null
  const activity = condition.activity_type ? ACTIVITY_TYPE_LABELS[condition.activity_type] : undefined
  const withActivity = (text: string) => (activity ? `${activity} ${text}` : text)
  if (isPositive(condition.distance_km)) return withActivity(`${formatNumber(condition.distance_km)}km`)
  if (isPositive(condition.elevation_gain_m)) return `상승고도 ${formatNumber(condition.elevation_gain_m)}m`
  if (isPositive(condition.count)) return withActivity(`${formatNumber(condition.count)}회`)
  if (isPositive(condition.streak_days)) return `${formatNumber(condition.streak_days)}일 연속`
  if (isPositive(condition.duration_minutes)) return `${formatNumber(condition.duration_minutes)}분`
  return null
}

/**
 * 액티비티 배지 달성 기준 칩 하나. 조건 문구 레지스트리의 칩 중 «판정을 만드는 조건(measurable)»의 첫 번째를 쓴다
 * («10회»·«고도 700m»·«7일 연속» 등 — 문구는 레지스트리가 단일 원천이라 PRD 표의 예시와 글자가 다를 수 있다).
 * 조건이 없거나 읽을 칩이 없으면 null.
 */
export function formatBadgeCriteriaChip(condition: BadgeCondition | null | undefined): string | null {
  for (const entry of formatConditionChipEntries(condition)) {
    if (getConditionField(entry.key)?.role === 'measurable') return entry.text
  }
  return null
}

/** 무한레벨형 배지의 레벨 칩(«Lv.1»). 등급형(레벨 NULL)이거나 1 미만이면 null. */
export function formatBadgeLevelChip(level: number | null | undefined): string | null {
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 ? `Lv.${level}` : null
}

/** 컬렉션에 속한 아이템 수 칩(«아이템 12개»). 값이 없거나 0이면 null. */
export function formatItemCountChip(count: number | null | undefined): string | null {
  return isPositive(count) ? `아이템 ${Math.floor(count)}개` : null
}

/** 체크인에 필요한 배지 수 칩(«배지 3종류»). 값이 없거나 0이면 null. */
export function formatRequiredBadgesChip(count: number | null | undefined): string | null {
  return isPositive(count) ? `배지 ${Math.floor(count)}종류` : null
}

/** 장소 이름 칩. 공백만 있으면 null, 앞뒤 공백은 뗀다. */
export function formatPlaceNameChip(name: string | null | undefined): string | null {
  const trimmed = name?.trim()
  return trimmed ? trimmed : null
}

// ── 자원별 후보 모으기 ───────────────────────────────────────

/** 자원마다 읽는 값. `FEED_VALUE_CHIP_RULES` 위의 표가 각 칸의 출처다. 생략·null은 «값 없음»이다. */
export type FeedValueChipSource =
  | {
      resource: 'mission'
      endsAt?: string | null
      rewardPoints?: number | null
      condition?: MissionConditionValues | null
    }
  | { resource: 'activity_badge'; condition?: BadgeCondition | null; level?: number | null }
  | { resource: 'collection'; itemCount?: number | null }
  | { resource: 'checkin'; requiredBadgeCount?: number | null; placeName?: string | null }
  | { resource: 'drop_pickup' }

function chipOfKind(kind: ValueChipKind, source: FeedValueChipSource, now: Date): string | null {
  switch (source.resource) {
    case 'mission':
      if (kind === 'remaining') return formatRemainingChip(source.endsAt, now)
      if (kind === 'reward-points') return formatRewardPointsChip(source.rewardPoints)
      if (kind === 'condition') return formatMissionConditionChip(source.condition)
      return null
    case 'activity_badge':
      if (kind === 'criteria') return formatBadgeCriteriaChip(source.condition)
      if (kind === 'level') return formatBadgeLevelChip(source.level)
      return null
    case 'collection':
      return kind === 'item-count' ? formatItemCountChip(source.itemCount) : null
    case 'checkin':
      if (kind === 'required-badges') return formatRequiredBadgesChip(source.requiredBadgeCount)
      if (kind === 'place-name') return formatPlaceNameChip(source.placeName)
      return null
    case 'drop_pickup':
      return null
  }
}

/**
 * 자원의 값 칩 후보를 규칙표의 우선순위 순서로 낸다. 값이 없는 종류는 건너뛴다. 구분 칩은 후보에 넣지 않는다(`FEED_VALUE_CHIP_RULES[자원].divider`).
 * 카드당 칩은 최대 2개라서, 쓰는 쪽은 앞에서부터 남는 자리만큼 가져간다.
 */
export function buildValueChips(source: FeedValueChipSource, now: Date): string[] {
  const chips: string[] = []
  for (const kind of FEED_VALUE_CHIP_RULES[source.resource].values) {
    const chip = chipOfKind(kind, source, now)
    if (chip) chips.push(chip)
  }
  return chips
}

// ── 문구 칩 길이 경고 ────────────────────────────────────────

export interface ChipTextLengthCheck {
  /** 앞뒤 공백을 뗀 글자 수(이모지·한글 한 글자를 1로 센다) */
  length: number
  max: number
  exceeds: boolean
  /** 상한을 넘으면 경고 문장, 아니면 null. 막지 않고 알리기만 한다. */
  warning: string | null
}

/** 문구 칩 글자 수를 잰다. 상한(12자 제안)을 넘어도 막지 않고 경고 정보만 돌려준다. */
export function checkChipTextLength(text: string, max: number = FEED_CHIP_TEXT_MAX_LENGTH): ChipTextLengthCheck {
  const length = [...text.trim()].length
  const exceeds = length > max
  return {
    length,
    max,
    exceeds,
    warning: exceeds ? `칩 글자는 ${max}자 이내를 권해요. 지금 ${length}자예요.` : null,
  }
}
