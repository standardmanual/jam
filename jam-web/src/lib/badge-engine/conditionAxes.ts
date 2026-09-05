/**
 * 조건 «축» 키 목록 — 발급 판정과 진행 계산이 공유하는 단일 출처 (티켓 20260905_0031)
 *
 * ## 왜 이 파일이 생겼나
 *
 * `index.ts`의 `PER_ACTIVITY_KEYS`와 `badgeProgress.ts`의 `SCALAR_AXIS_KEYS`는 **같은 목록을
 * 두 번 적은 것**이었다. `badgeProgress.ts`의 주석이 「재사용이 아니라 재선언」이라고 스스로
 * 인정하고 있었고, 두 목록이 어긋나는 순간 **진행률과 발급 판정이 갈라진다** — 화면은
 * 「78% 진행」을 그리는데 엔진은 그 축을 아예 보지 않는 상태가 된다.
 *
 * 이 저장소는 이미 그 사고를 냈다: `RARITY_LABEL`이 5곳에 복제돼 누락 사고를 냈고
 * (티켓 20260813_003 · 20260905_0027), `sync.ts`의 `FAMILY_RARITY_ORDER`도 같은 형태로
 * 남아 있었다. `badgeKind.ts`(배지 종류 판정)·`activityFilters.ts`(휴식 조건 키)와 같은
 * 태도로 **축 키도 한 곳에만 둔다.**
 *
 * ## 순수 모듈이다
 * 타입 외에는 아무것도 import하지 않는다 — `badgeProgress.ts`가 클라이언트 세이프해야
 * 하므로(`index.ts`는 `next/headers`를 전이 의존한다) 이 파일도 같은 제약을 지킨다.
 */
import type { BadgeCondition } from '@/types/database'

/**
 * 한 활동 안에서 동시에 충족해야 하는(또는 이력 전반에서 각각 독립 평가되는) 필드.
 *
 * `distance_km`/`elevation_gain_m`은 여기 없다 — 기본은 "전체 이력 누적 합계"이며,
 * `condition_json.same_activity === true`인 배지만 예외적으로 이 목록에 합류해 "한 활동에서
 * 동시 충족"으로 평가된다(2026-08-31 복원, 티켓 20260831_2100).
 *
 * 이 목록에 남은 필드가 2개 이상이고 `time_range`가 섞여 있지 않으면(= "그 시간대에 일어난
 * 활동"이라는 본질적 결합이 없으면) 기본적으로 "이력 전반 독립 평가"로 처리한다
 * (카테고리 2: R7/C7/H7/T7). `time_range`가 포함된 조합(W5 야간 등)은 원래부터 "그 활동
 * 자체가" 그 시간대에 일어나야 하므로 계속 단일 활동 동시 충족을 요구한다.
 */
export const PER_ACTIVITY_KEYS = [
  'duration_minutes', 'min_speed_kmh', 'max_pace_sec_per_km',
  'temperature_min_c', 'temperature_max_c', 'weekend_duration_hours',
] as const satisfies readonly (keyof BadgeCondition)[]

/** same_activity:true일 때만 PER_ACTIVITY_KEYS에 합류하는 누적 필드 (T1 전용) */
export const CUMULATIVE_SAME_ACTIVITY_KEYS = ['distance_km', 'elevation_gain_m'] as const satisfies readonly (keyof BadgeCondition)[]

/**
 * 진행 계산이 «수치 축»으로 그릴 수 있는 8개 필드 — 위 두 목록의 합집합이다.
 *
 * **손으로 다시 나열하지 않는다.** 스프레드로 파생시키면 `PER_ACTIVITY_KEYS`에 축이
 * 추가될 때 진행 계산이 자동으로 따라온다(반대로 어긋날 방법이 없다).
 */
export const SCALAR_AXIS_KEYS = [
  ...CUMULATIVE_SAME_ACTIVITY_KEYS,
  ...PER_ACTIVITY_KEYS,
] as const

export type PerActivityKey = (typeof PER_ACTIVITY_KEYS)[number]
export type CumulativeSameActivityKey = (typeof CUMULATIVE_SAME_ACTIVITY_KEYS)[number]
export type ScalarAxisKey = (typeof SCALAR_AXIS_KEYS)[number]

/** 주기(리셋 경계)를 갖는 축 키 — 진행 계산의 `kind: 'periodic'` 판정 근거 */
export const PERIODIC_AXIS_KEYS = ['weekly_count', 'monthly_km'] as const satisfies readonly (keyof BadgeCondition)[]

/**
 * 「몇 번/며칠」을 세는 카운터 축 키 — 진행 계산의 `kind: 'cumulative'`(단독일 때) 판정 근거.
 * `season_count_all`은 계절 4개를 각각 세는 다중 축이라 여기 없다(`MULTI_AXIS_KEYS`).
 */
export const COUNTER_AXIS_KEYS = [
  'total_count', 'streak_days', 'active_days_count', 'season_count',
] as const satisfies readonly (keyof BadgeCondition)[]

/** 축이 여러 개로 펼쳐지는 키 — `kind: 'multi'` */
export const MULTI_AXIS_KEYS = ['season_count_all'] as const satisfies readonly (keyof BadgeCondition)[]

/**
 * 진행 계산이 «독립 측정 축»으로 세는 조건 키 전체 (티켓 20260905_0031 재시도).
 *
 * ## 왜 필요한가 — 「축 하나만 그리고 나머지를 숨기는」 거짓말을 막는다
 *
 * `kind: 'rest'`·`kind: 'repeat'`는 자기 술어(`evaluateRestConditions`·
 * `collectRepeatOccurrences`)가 흡수하는 필드만 축으로 그린다. 그런데 조건에 그 술어가
 * 소비하지 않는 측정 축이 남아 있으면 — 예: `{ return_gap_days: 5, distance_km: 1000 }` —
 * 휴식 축 하나만 「5/5일 = 100%」로 그려지고 **1,000km 축은 화면에서 통째로 사라진다.**
 * 발급은 당연히 막힌 상태다. 기존 5종이 `axisCount` 가드로 지켜 온 규칙과 같은 규칙을
 * 신규 kind에도 적용하기 위해, 「무엇이 측정 축인가」를 한 곳에 모아 둔다.
 *
 * 손으로 다시 나열하지 않는다 — 위 네 목록의 합집합이다.
 */
export const MEASURED_AXIS_KEYS = [
  ...SCALAR_AXIS_KEYS,
  ...PERIODIC_AXIS_KEYS,
  ...COUNTER_AXIS_KEYS,
  ...MULTI_AXIS_KEYS,
] as const

export type PeriodicAxisKey = (typeof PERIODIC_AXIS_KEYS)[number]
export type CounterAxisKey = (typeof COUNTER_AXIS_KEYS)[number]
export type MeasuredAxisKey = (typeof MEASURED_AXIS_KEYS)[number]

/**
 * "작을수록 좋음" 축 — 나머지는 전부 "클수록 좋음".
 *
 * 진행 비율(`fraction`)·남은 양(`remaining`)의 부호가 이 판정으로 뒤집힌다. 표시 레이어
 * (`badgeProgressText.ts`)도 같은 집합을 봐야 「30초 모자랐어요」의 방향이 맞는다.
 */
export const LOWER_IS_BETTER_AXIS_KEYS: ReadonlySet<ScalarAxisKey> = new Set([
  'max_pace_sec_per_km',
  'temperature_max_c',
])
