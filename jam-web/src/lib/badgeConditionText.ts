/**
 * 배지 상세(`/badges/[id]`)의 「획득 조건」 문구 — 티켓 20260905_0038 A묶음
 *
 * ## 왜 레지스트리에서 만드는가
 *
 * 이전 구현은 `badges/[id]/page.tsx` 안의 `if (condition.X)` **18개 나열**이었다. 조건 키가
 * 하나도 걸리지 않으면 「관리자가 직접 발급하는 배지예요」로 떨어졌는데, v5 카탈로그가
 * `single_distance_km`·`personal_record_break`·`interval_days` 등 신규 키를 쓰면서
 * **비미션 590종 중 209종 46계열(35%)이 그 문구로 오표시**됐다(2026-09-06 프로덕션 실측).
 *
 * 그래서 이 파일은 **키를 나열하지 않는다.** `conditionRegistry.ts`(조건 필드의 단일 출처)의
 * `label`·`unit`·`direction`으로 문구를 조립하고, 그 조립으로 어색해지는 필드만
 * `USER_PHRASE`에서 덮어쓴다. 레지스트리에 필드가 추가되면 override가 없어도
 * 「{라벨} {값}{단위} 이상」이 자동으로 나오므로 **다시는 「관리자 발급」으로 떨어지지 않는다.**
 * (같은 원칙의 선례: `badgeProgressText.ts`가 레지스트리 라벨을 폴백으로 쓴다 — 티켓 0031)
 *
 * ## 표기 규칙 (`Specs/Content/v5_catalog_writing.json` `_meta.조건문_표기_규칙`)
 *
 * - 요소 순서 ①기간 ②맥락 ③지표 ④달성 횟수 → `SECTION_ORDER`
 * - 「이상·이하」만 쓴다 (초과·미만 금지) → `direction`이 그대로 부등호가 된다
 * - 「주」가 들어가면 예외 없이 `(월~일)`
 * - 페이스는 부등호 없이 「5:30/km보다 빠르게」
 * - 종목 동작은 조건문에서 뺀다 — 배지가 이미 종목에 속한다 → `activity_type`은 문구를 만들지 않는다
 *   (이전 구현의 「자전거 타기**으로** 누적 30km」 조사 오류도 여기서 사라진다)
 */
import type { BadgeCondition } from '@/types/database'
import { formatPaceSecPerKm } from '@/types/strava'
import {
  CONDITION_FIELDS,
  type AnyConditionFieldMeta,
  type ConditionFormSection,
  type ConditionKey,
} from '@/lib/badge-engine/conditionRegistry'

/** 조건이 아예 없는 배지 — 어드민이 수동으로 지급한다. **미션 보상 배지는 여기가 아니다** */
const MANUAL_TEXT = '관리자가 직접 발급하는 배지예요.'

/**
 * 레지스트리에 없는 키만 들어 있어 한 줄도 만들지 못한 경우.
 * 「관리자가 직접 발급」이라고 말하면 **틀린 정보**다(조건은 있는데 코드가 모를 뿐이다) —
 * `badgeProgressText.ts`의 「진행 표시 준비 중」과 같은 정직한 폴백을 쓴다.
 */
const UNKNOWN_TEXT = '획득 조건 안내를 준비하고 있어요.'

const MONTH_LABELS: Record<number, string> = {
  1: '1월', 2: '2월', 3: '3월', 4: '4월', 5: '5월', 6: '6월',
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
}

const DAY_OF_WEEK_LABELS: Record<string, string> = {
  sunday: '일요일',
  monday: '월요일',
  tuesday: '화요일',
  wednesday: '수요일',
  thursday: '목요일',
  friday: '금요일',
  saturday: '토요일',
}

const SEASON_RANGE: Record<string, string> = {
  spring: '봄(3~5월)',
  summer: '여름(6~8월)',
  fall: '가을(9~11월)',
  winter: '겨울(12~2월)',
  all: '전 계절',
}

/** 배열이 정확히 월~금(순서 무관)이면 「월~금」으로 요약 */
function dayOfWeekArrayLabel(days: string[]): string {
  const weekdaySet = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  if (days.length === 5 && days.every((day) => weekdaySet.has(day))) return '월~금'
  return days.map((day) => DAY_OF_WEEK_LABELS[day] ?? day).join('·')
}

/** 단일 월 또는 월 배열(예: 장마철 6~7월) */
function monthLabel(month: number | number[]): string {
  if (Array.isArray(month)) return month.map((m) => MONTH_LABELS[m] ?? `${m}월`).join('·')
  return MONTH_LABELS[month] ?? `${month}월`
}

/** "HH:MM" 시작 시각을 사람이 읽는 시간대 이름으로 */
function timeSlotLabel(start: string): string {
  const [h] = start.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  if (h >= 4 && h < 8) return '새벽'
  if (h >= 8 && h < 11) return '아침'
  if (h >= 11 && h < 14) return '점심'
  if (h >= 14 && h < 18) return '오후'
  if (h >= 18 && h < 22) return '저녁'
  return '심야'
}

/**
 * `day_of_week`가 배열이고 `total_count`가 함께 있으면 **요일별 독립 카운터** 모드다
 * (각 요일이 각각 total_count를 채워야 한다 — `BadgeCondition.day_of_week` 주석).
 * 이 경우 두 필드가 한 문구로 합쳐지고 `total_count`는 따로 말하지 않는다.
 */
function isPerDayOfWeekCounter(c: BadgeCondition): boolean {
  return Array.isArray(c.day_of_week) && c.total_count !== undefined
}

/**
 * 일반 조립(「{라벨} {값}{단위} 이상」)으로는 어색하거나 뜻이 어긋나는 필드만 덮어쓴다.
 * **여기 없는 필드도 문구가 나온다** — 이 맵은 «완성도»를 위한 것이지 «필수 목록»이 아니다.
 * `null`을 돌려주면 그 필드는 문구를 만들지 않는다(다른 필드가 이미 말했거나, 화면의 다른
 * 영역이 담당하는 경우).
 */
const USER_PHRASE: Partial<Record<ConditionKey, (c: BadgeCondition) => string | null>> = {
  // ── 종목은 조건문에 넣지 않는다 (표기 규칙) ─────────────────────────────
  activity_type: () => null,
  // 미션 보상은 문장 전체가 달라진다 — `formatBadgeConditionText` 앞단에서 처리한다
  mission_reward: () => null,
  /**
   * 선행 배지는 상세 화면이 **카드 그리드로 따로** 보여준다(`page.tsx`의 「선행 배지」 절).
   * 문구로 한 번 더 말하면 같은 정보가 두 번 나온다 — 이전 구현도 말하지 않았다.
   */
  prerequisite_badge_names: () => null,
  /**
   * 2단 교차 게이트 3종은 「축」이라는 **내부 정책 용어** 없이는 정확히 옮길 수 없다.
   * 유저 노출 어휘를 이 티켓에서 새로 만들지 않고 침묵한다(이전 구현과 동일).
   * v5 카탈로그 630종 중 이 필드를 쓰는 배지는 **0건**이라 지금은 화면에 영향이 없다.
   */
  cross_in_axis: () => null,
  cross_between_axis: () => null,
  gate_mission_badge: () => null,

  // ── 기간 ────────────────────────────────────────────────────────────────
  month: (c) => (c.monthly_km !== undefined ? null : `${monthLabel(c.month!)}에 활동`),
  monthly_km: (c) =>
    `${c.month !== undefined ? `${monthLabel(c.month)} ` : ''}한 달 동안 ${c.monthly_km}km 이상`,
  season: (c) => (c.season_count !== undefined ? null : (SEASON_RANGE[c.season!] ?? c.season!)),
  season_count: (c) =>
    `${c.season ? (SEASON_RANGE[c.season] ?? c.season) : '한 계절'}에 ${c.season_count}회 이상`,
  season_count_all: (c) => `봄·여름·가을·겨울 각 ${c.season_count_all}회 이상`,
  // 「주」가 들어가면 예외 없이 (월~일)
  weekly_count: (c) => `한 주(월~일)에 ${c.weekly_count}회 이상`,
  weekly_streak: (c) => `${c.weekly_streak}주(월~일) 연속`,
  day_of_month: (c) => `매달 ${c.day_of_month}일`,

  // ── 맥락 ────────────────────────────────────────────────────────────────
  day_of_week: (c) => {
    if (Array.isArray(c.day_of_week)) {
      const days = dayOfWeekArrayLabel(c.day_of_week)
      return isPerDayOfWeekCounter(c) ? `${days} 각 요일마다 ${c.total_count}회 이상` : `${days}에 활동`
    }
    return `매주 ${DAY_OF_WEEK_LABELS[c.day_of_week!] ?? c.day_of_week}에 활동`
  },
  time_range: (c) => {
    const { start, end } = c.time_range!
    const slot = timeSlotLabel(start)
    return slot ? `${slot} 시간대(${start}~${end})` : `${start}~${end} 시간대`
  },
  temperature_min_c: (c) => `기온 ${c.temperature_min_c}°C 이상일 때`,
  temperature_max_c: (c) => `기온 ${c.temperature_max_c}°C 이하일 때`,

  // ── 지표 ────────────────────────────────────────────────────────────────
  total_count: (c) => (isPerDayOfWeekCounter(c) ? null : `총 ${c.total_count}회 이상`),
  streak_days: (c) => `${c.streak_days}일 연속 활동`,
  // 페이스는 부등호 없이 「보다 빠르게」 (표기 규칙)
  max_pace_sec_per_km: (c) => `페이스 ${formatPaceSecPerKm(c.max_pace_sec_per_km!)}보다 빠르게`,
  activities_within_hours: (c) =>
    `${c.activities_within_hours!.hours}시간 안에 ${c.activities_within_hours!.count}회 이상`,
  negative_split: (c) => (c.negative_split === true ? '후반이 전반보다 빠른 활동' : null),
  same_activity: (c) => (c.same_activity === true ? '한 번의 활동에서 모두 충족' : null),
  poi_id: () => '지정된 지점에서 체크인',

  // 레지스트리 라벨이 「전월 대비 **배수**」라 일반 조립이 「배수 1.2배」로 겹친다
  month_over_month_ratio: (c) => `전월 대비 ${c.month_over_month_ratio}배 이상`,
  vs_personal_average: (c) => `평소 평균 대비 ${c.vs_personal_average}배 이상`,

  // ── 달성 횟수 ───────────────────────────────────────────────────────────
  /**
   * 「스탬프」를 쓰지 않는다 — 반복 카운터는 「N회」로만 (표기 규칙).
   * 정책 용어(반복형)도 노출하지 않는다.
   *
   * **1회면 말하지 않는다.** 「위 조건을 1회 달성」은 조건을 한 번 채우면 획득한다는
   * 기본 동작을 자기 참조로 되풀이하는 문장이다(v5 카탈로그 139종 중 39종이 1이다).
   */
  repeat_count: (c) => ((c.repeat_count ?? 0) >= 2 ? `위 조건을 ${c.repeat_count}회 달성` : null),
}

/**
 * 표기 규칙 「①기간 ②맥락 ③지표 ④달성 횟수」의 정렬 키.
 * 어드민 조건 폼의 섹션을 그대로 재사용한다 — 그 분류가 이미 같은 축이고,
 * 여기서 따로 목록을 만들면 필드가 늘 때 두 곳이 어긋난다.
 */
const SECTION_ORDER: Record<ConditionFormSection, number> = {
  period: 0,
  environment: 1,
  basic: 2,
  single: 2,
  pattern: 3,
  gate: 4,
  meta: 5,
  repeat: 6,
}

/** 섹션만으로는 자리가 어긋나는 예외. `same_activity`는 지표가 아니라 «충족 방식»이라 뒤로 뺀다 */
const ORDER_OVERRIDE: Partial<Record<ConditionKey, number>> = {
  same_activity: 5,
}

function orderOf(meta: AnyConditionFieldMeta): number {
  const override = ORDER_OVERRIDE[meta.key]
  if (override !== undefined) return override
  const section = meta.form?.section
  if (section) return SECTION_ORDER[section]
  // 폼이 없는 필드(day_of_week·route·poi_id) — 역할로 자리를 정한다
  return meta.role === 'filter' ? SECTION_ORDER.environment : SECTION_ORDER.basic
}

/**
 * 필드 하나의 문구. override가 없으면 **레지스트리 메타만으로** 조립한다:
 * `higher` → 「… 이상」 / `lower` → 「… 이하」 / 방향이 없으면 값만 붙인다.
 */
function phraseOf(meta: AnyConditionFieldMeta, condition: BadgeCondition): string | null {
  const override = USER_PHRASE[meta.key]
  if (override) return override(condition)

  const value = condition[meta.key]
  if (value === undefined || value === null) return null
  const unit = meta.unit ?? ''

  if (typeof value === 'boolean') return value ? meta.label : null
  if (typeof value === 'number') {
    if (meta.direction === 'higher') return `${meta.label} ${value}${unit} 이상`
    if (meta.direction === 'lower') return `${meta.label} ${value}${unit} 이하`
    return `${meta.label} ${value}${unit}`
  }
  if (typeof value === 'string') return `${meta.label} ${value}`
  if (Array.isArray(value)) return `${meta.label} ${value.join('·')}`
  // 객체형인데 override가 없다 — 내부 구조를 추측해 그리지 않는다(형태 보장이 없다)
  return meta.label
}

/**
 * 한 필드의 실패가 문구 전체를 죽이지 않게 격리한다.
 * `condition_json`은 jsonb라 형태 보장이 없다 — `c.activities_within_hours!.hours`처럼
 * 내부를 파는 override가 스칼라 값을 만나면 TypeError가 나고, 이 함수는 배지 상세를
 * 서버 렌더하는 경로라 **페이지 전체가 500**이 된다(레지스트리 `safeFormat`과 같은 방어).
 */
function safePhrase(meta: AnyConditionFieldMeta, condition: BadgeCondition): string | null {
  let text: string | null
  try {
    text = phraseOf(meta, condition)
  } catch {
    return null
  }
  if (text == null) return null
  // 던지지 않고 값만 깨지는 경우 — `(3).hours`는 undefined를 돌려준다
  if (text.includes('undefined') || text.includes('NaN')) return null
  return text
}

/**
 * 서로 다른 활동에서 각각 달성해도 인정되는 속성 조건이 2개 이상일 때 붙는 안내.
 * 이전 구현의 판단을 그대로 유지하되(대상 키 동일), **`same_activity`가 참이면 붙이지
 * 않는다** — 「한 번의 활동에서 모두 충족」과 정면으로 모순되기 때문이다.
 */
function crossAttrNote(condition: BadgeCondition): string {
  if (condition.same_activity === true) return ''
  const perActivityAttrs = [
    condition.min_speed_kmh,
    condition.max_pace_sec_per_km,
    condition.duration_minutes,
    condition.elevation_gain_m,
    condition.temperature_min_c,
    condition.temperature_max_c,
  ].filter((v) => v !== undefined).length
  return perActivityAttrs >= 2 ? ' (각 조건은 서로 다른 활동에서 달성해도 인정돼요)' : ''
}

/**
 * 배지 상세의 「획득 조건」 본문 한 문단.
 *
 * - 미션 보상 배지(`mission_reward`) → 미션 문구. **여기만 「직접 발급」 계열 문구가 맞다**
 * - 조건이 비어 있음 → 관리자 수동 발급
 * - 그 외 → 조건 나열 + 「조건을 채우면 획득할 수 있어요.」
 */
export function formatBadgeConditionText(condition: BadgeCondition | null | undefined, badgeName: string): string {
  if (condition?.mission_reward) {
    return `'${badgeName}' 미션을 완료하면 받을 수 있는 배지예요.`
  }
  if (!condition || Object.keys(condition).length === 0) {
    return MANUAL_TEXT
  }

  const parts: { order: number; text: string }[] = []
  for (const field of CONDITION_FIELDS) {
    const meta = field as AnyConditionFieldMeta
    if (condition[meta.key] === undefined) continue
    const text = safePhrase(meta, condition)
    if (!text) continue
    parts.push({ order: orderOf(meta), text })
  }
  if (parts.length === 0) return UNKNOWN_TEXT

  // 같은 자리(order)는 레지스트리 선언 순서를 유지한다 — Array.prototype.sort는 안정 정렬이다
  parts.sort((a, b) => a.order - b.order)

  return `${parts.map((p) => p.text).join(' · ')} 조건을 채우면 획득할 수 있어요.${crossAttrNote(condition)}`
}

/**
 * 배지 상세의 「획득 조건」 **둘째 줄 — 조건 표기**. 티켓 20260906_1305.
 *
 * ## 왜 문장과 따로 만드는가
 *
 * `formatBadgeConditionText`는 조건 조각을 이어 붙인 끝에 「조건을 채우면 획득할 수 있어요.」를
 * 붙여 **한 문단**으로 만든다. 그래서
 * 「한 주(월~일)에 3회 이상 · 새벽 시간대(05:00~07:00) · 한 번의 거리 5km 이상 ·
 *  위 조건을 10회 달성 조건을 채우면 획득할 수 있어요.」처럼 조건과 안내문이 한 줄에 섞이고,
 * 마지막 숫자가 무엇의 횟수인지 판단이 안 된다(라이팅 가이드 §03이 지적한 그대로다).
 *
 * 이 함수는 **같은 조건을 사실 표기로만** 낸다:
 * 「한 주(월~일)에 3회 이상 · 새벽 시간대(05:00~07:00) · 한 번의 거리 5km 이상 / 10회」
 * ①기간 ②맥락 ③지표를 ` · `로 잇고, **④달성 횟수만 ` / N회`로 맨 끝에 뗀다** —
 * 마지막 숫자가 항상 「몇 번 달성해야 하는가」로 고정되는 것이 이 분리의 핵심이다.
 * 표기 형태는 라이팅 정본(`v5_catalog_writing.json`의 「조건」 필드)과 같다.
 *
 * ## 어휘의 출처
 *
 * 조각 문구는 위 `safePhrase`(= 레지스트리의 `label`·`unit`·`direction` + `USER_PHRASE`)를
 * 그대로 재사용한다. **새 어휘 목록을 만들지 않는다.** 레지스트리의 `detail`을 직접 쓰지 않는
 * 이유는 그쪽이 «어드민 상세»용이라 유저에게 보일 수 없는 표현(「선행 배지: …」·
 * 「미션 완료로만 지급」·실패 시 「형태 오류」)을 내고, 「이상」 같은 부등호 표기도 빠져 있어
 * 이 화면의 표기 규칙과 어긋나기 때문이다.
 *
 * ## null을 돌려주는 세 경우 — 이 줄 자체를 그리지 않는다(문장만 남는다)
 *
 * 1. 미션 보상 배지 — 문장이 이미 「'X' 미션을 완료하면」이다. 표기할 조건이 없다
 * 2. 조건이 비어 있음(어드민 수동 발급)
 * 3. 레지스트리가 모르는 키만 있어 조각을 하나도 만들지 못함
 *
 * **명사구로 끝난다.** 마침표·「~해요」를 붙이지 않는다 — 문장이 아니라 표기다.
 */
export function formatBadgeConditionSpec(condition: BadgeCondition | null | undefined): string | null {
  if (!condition || Object.keys(condition).length === 0) return null
  if (condition.mission_reward) return null

  const parts: { order: number; text: string }[] = []
  for (const field of CONDITION_FIELDS) {
    const meta = field as AnyConditionFieldMeta
    // 달성 횟수는 ` · ` 나열에 섞지 않는다 — 아래에서 ` / N회`로 따로 붙인다
    if (meta.key === 'repeat_count') continue
    if (condition[meta.key] === undefined) continue
    const text = safePhrase(meta, condition)
    if (!text) continue
    parts.push({ order: orderOf(meta), text })
  }
  if (parts.length === 0) return null

  parts.sort((a, b) => a.order - b.order)
  const spec = parts.map((p) => p.text).join(' · ')

  /**
   * 1회도 적는다 — 문장 쪽(`USER_PHRASE.repeat_count`)이 「위 조건을 1회 달성」을 생략하는 것과
   * 다르다. 저기서는 기본 동작을 되풀이하는 «군더더기 문장»이지만, 여기서는 맨 끝 숫자가
   * 언제나 달성 횟수라는 **자리의 약속**이 읽는 법 자체라 비우면 그 약속이 깨진다.
   * 라이팅 정본의 조건 표기도 「자정을 넘긴 활동 / 1회」로 적는다.
   * 조건에 `repeat_count` 키가 아예 없으면(630종 중 491종) 이 꼬리도 없다.
   */
  const repeat = condition.repeat_count
  return typeof repeat === 'number' && repeat >= 1 ? `${spec} / ${repeat}회` : spec
}
