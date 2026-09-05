/**
 * 배지 진행 계산 엔진 — computeBadgeProgress() (티켓 20260904_0631)
 *
 * 배지 트리 리뉴얼 2차(진행 수치 표시)의 첫 단계. 발급 판정(`evaluateConditionDetailed`/
 * `checkCondition`, `./index.ts`)은 통과/탈락만 알고, "몇 % 남았는지"·"어느 축이 부족한지"는
 * 계산하지 않는다 — 이 파일이 그 옆에 추가하는 **완전히 새로운, 발급에 영향을 주지 않는
 * 순수 계산 계층**이다. 판정 결과(pass/fail)는 절대 건드리지 않는다.
 *
 * ## 순수 함수 원칙
 * 이 파일은 Supabase/DB를 직접 호출하지 않는다 — `computeUserPeriodMetrics`/
 * `computeBadgeProgress`/`classifyBadgeProgressKind` 모두 활동 데이터(+ 라벨 맵 +
 * 선행조건 락)만으로 동작하는 동기 순수 함수다. 라벨 조회(`getMetricLabels()`)는 호출부
 * (비동기 wrapper, 2c 몫)가 계열당 1회 수행해 `labelMap`으로 넘긴다.
 *
 * ## activityFilters.ts 헬퍼 재사용 (티켓 지시 — 같은 필터 규칙 복제 금지)
 * `calcMaxStreak`·`passesWalkingGate`·`matchesDayOfWeek`·`inTimeRange`·`dedupeOnePerDay`·
 * `getMondayKey`를 그대로 import해 재사용한다 — 요일 판정·시간대 판정·걷기 하루 1회 상한·
 * 주(월요일) 키 규칙이 발급 판정과 단 한 글자도 다르면 "3일 남음"이라고 표시해놓고 실제로는
 * 다른 날짜가 되는 사고로 이어지기 때문이다.
 *
 * **`./index`가 아니라 `./activityFilters`에서 직접 import한다.** `index.ts`는 파일
 * 최상단에서 `@/lib/supabase/server`(→ `next/headers`)를 무조건 import하므로, 이 파일이
 * `./index`를 거치면 그 전이 의존까지 함께 물려 'use client' 컴포넌트에서 이 함수들을 쓸 때
 * `npm run build`가 실패한다(1차 시도 게이트 리뷰에서 실제 재현·확인된 실패). `activityFilters.ts`는
 * NormalizedActivity/DayOfWeek 타입 외 어떤 것도 import하지 않는 완전히 독립적인 순수
 * 함수 파일이라 이 문제가 없다.
 *
 * ## 2c 추가분 (티켓 20260904_0921) — `computeRecordRegretLine()`
 * 화면(2c)이 이 계산 계층을 처음 호출하며 함께 필요해진 "기록형 아쉬움 줄" 계산을 파일
 * 끝(§2c 절)에 추가했다. `computeBadgeProgress`와 마찬가지로 순수 함수이고, 발급 판정에는
 * 전혀 관여하지 않는다 — 최종 한국어 문장 조립은 이 파일이 아니라 클라이언트 쪽
 * `src/lib/badgeProgressText.ts`가 담당한다(서버는 숫자만, 텍스트 조립은 소비처).
 *
 * ## 2d 추가분 (티켓 20260904_1058) — `BadgeProgressAxis.fraction` 노출
 * 2축형(dual) 게이지(`DualAxisGauge`, DS)가 축마다 독립된 진행 바를 그리려면 축 하나의
 * 진행 비율(0~1)이 필요한데, "클수록 좋음"/"작을수록 좋음"/한파(temperature_max_c) 축마다
 * 계산 공식이 다르다(`makeHigherBetterAxis`/`makeLowerBetterRatioAxis`/`makeColdRecordAxis`).
 * 이 비율은 `progress`(축 전체 최솟값)·`bottleneck` 계산에 이미 쓰이던 내부 값이라 —
 * 새 계산을 추가한 게 아니라 버리던 값을 axis 객체에 그대로 얹어 노출한 것뿐이다.
 *
 * ## v5 확장 (티켓 20260905_0031) — kind 3종 · 마지막 활동값 · remaining
 *
 * 티켓 0030이 만든 네 구조가 전부 `unsupported`로 떨어져 있었다(발급은 판정되는데 화면에는
 * 아무것도 그리지 않는 상태 — 「발급은 막히는데 100%가 뜨는 거짓말」을 막으려는 의도적 처리).
 * 이 확장이 각각에 축을 만든다:
 *
 * - **`leveled` / `repeat` / `rest`** — 무한레벨형 · 반복 카운터 · 휴식(활동 공백)
 * - **표시 값의 성격 분리** — 누적형은 「지금까지 쌓인 값」, **기록형은 「마지막 활동의 값」**
 *   (`buildRecordAxis` 주석 참고. 판정(`met`)은 여전히 역대 최고 = 발급 판정과 동일 기준)
 * - **`BadgeProgressAxis.remaining`** — 방향이 보정된 「남은 양」(페이스는 부호가 반대다)
 * - **`crossGated`** — 교차 게이트가 걸린 배지라 축을 다 채워도 발급되지 않을 수 있다
 *
 * ## 재선언 금지 — 진행률과 발급 판정은 같은 출처를 본다
 * 축 키 목록(`conditionAxes.ts`) · 회차 계산(`repeatOccurrences.ts`) · 휴식 판정
 * (`activityFilters.ts`) · 배지 종류(`badgeKind.ts`) · 교차 게이트(`crossGate.ts`)를 전부
 * 발급 엔진과 **같은 파일**에서 import한다. 예전에는 이 파일이 `index.ts`의
 * `PER_ACTIVITY_KEYS`를 재선언했고(주석이 스스로 인정하고 있었다), 두 목록이 어긋나는 순간
 * 화면과 발급이 갈라진다.
 */
import { kmhToPaceSecPerKm, type NormalizedActivity } from '@/types/strava'
import type { ActivityType, BadgeCondition, DayOfWeek } from '@/types/database'
import type { BadgeTreeLock } from '@/lib/badgeTree'
import { findBlockingConditionKeys, hasBlockingConditionKeys } from './conditionRegistry'
import {
  calcMaxStreak,
  passesWalkingGate,
  matchesDayOfWeek,
  inTimeRange,
  dedupeOnePerDay,
  getMondayKey,
  // 「무엇이 휴식 조건인가」는 `activityFilters.ts`에 한 번만 적혀 있다 — 발급 판정(index.ts)과
  // 이 파일이 **같은 함수**를 본다(v5 B3, 티켓 20260905_0030 §4).
  restConditionKeysIn,
  // 휴식 축(kind: 'rest')의 실측값도 발급 판정과 **같은 함수**에서 얻는다 — fail 결과에
  // 구조로 실린 bestDays/shortfallKey/requiredDays를 그대로 쓴다(문자열 파싱 없음).
  evaluateRestConditions,
  // 휴식 술어가 짝 필드로 흡수하는 키(streak_days·single_distance_km) — 「휴식 축이 조건을
  // 통째로 대표할 수 있는가」 판단의 예외 목록이다.
  restConsumedPairKeys,
} from './activityFilters'
// 축 키 목록은 `index.ts`(발급 판정)와 **같은 파일**에서 온다 — 예전에는 이 파일이
// `PER_ACTIVITY_KEYS`를 재선언했고, 두 목록이 어긋나면 진행률과 발급이 갈라졌다
// (티켓 20260905_0031).
import {
  SCALAR_AXIS_KEYS,
  LOWER_IS_BETTER_AXIS_KEYS,
  PERIODIC_AXIS_KEYS,
  COUNTER_AXIS_KEYS,
  MEASURED_AXIS_KEYS,
  type ScalarAxisKey,
} from './conditionAxes'
// 회차 계산도 발급 판정과 같은 함수다 — 두 곳이 각자 세면 「화면은 4/5인데 발급은 5회차」가 된다.
import {
  collectRepeatOccurrences,
  unconsumedRepeatConditionKeys,
  repeatConsumedAxisKeys,
} from './repeatOccurrences'
// 교차 게이트는 `evaluation: 'external'`이라 fail-closed가 잡지 않는다 — 이 파일이 직접 표시한다.
import { crossGateKeysIn } from './crossGate'
// 휴식·반복 축의 라벨/단위는 `badge_metric_labels`에 아직 시드가 없을 수 있다. 그때
// **조건 필드 메타(레지스트리)**를 폴백으로 쓴다 — 화면에 `rest_after_streak` 같은 내부 키가
// 그대로 나가지 않게. 라벨의 단일 출처는 여전히 레지스트리다(activityFilters의 restKeyLabel과 동일).
import { getConditionField } from './conditionRegistry'
import type { BadgeKind } from './badgeKind'

// ── 공개 타입 (티켓 §A 그대로) ──────────────────────────────────────────────

export type BadgeProgressAxis = {
  /** 'distance_km' | 'friday' | 'winter' … (badge_metric_labels.metric_key와 동일 네임스페이스) */
  key: string
  /** getMetricLabels() 결과로 채움 — 없으면 key 원문 노출(2a 설계 그대로) */
  label: string
  unit: string | null
  current: number
  target: number
  met: boolean
  /**
   * 이 축 하나의 진행 비율(0~1) — 티켓 20260904_1058(2d, DualAxisGauge)에서 노출. "클수록
   * 좋음"/"작을수록 좋음"/한파(temperature_max_c) 축마다 계산 공식이 다르므로(아래
   * make*Axis 함수 참고), 표시 레이어가 current/target만으로 이 값을 재계산하면 lower-is-better·
   * 한파 축에서 틀린 진행 바가 그려진다. `progress`(축 전체 최솟값)·`bottleneck` 계산에 이미
   * 쓰이던 내부 `AxisResult.fraction`을 그대로 얹은 것 — 새 계산이 아니다.
   */
  fraction: number
  /**
   * 목표까지 남은 양 — **방향이 이미 보정된 값이다**(티켓 20260905_0031).
   *
   * 화면이 「N 남음」을 그릴 때 `target - current`로 재계산하면 「작을수록 좋음」 축(페이스·
   * 한파)에서 **부호가 뒤집힌다** — 페이스 480초/km에 목표 450초/km면 남은 양은 −30이 아니라
   * 30초다. `fraction`과 같은 태도로, 표시 레이어가 그대로 쓸 수 있게 계산 계층이 방향을
   * 흡수한다. 항상 0 이상이며 `met`이면 0이다.
   *
   * `null`은 **「남은 양을 말할 수 없다」**는 뜻이다 — 측정값 자체가 없는 경우(페이스 축인데
   * 활동이 0건 등). 0으로 두면 「0 남음」이 되어 다 채운 것처럼 보인다.
   */
  remaining: number | null
}

export type BadgeProgressGate = { kind: 'badge' | 'mission'; name: string; href: string; met: boolean } | null

/**
 * 진행 유형. 5종에서 8종으로 늘었다(티켓 20260905_0031 — v5 구조 3개에 축을 만들었다).
 *
 * - `leveled` — 무한레벨형(`rarity IS NULL`). 축 자체는 아래 5종 중 하나로 계산하고, `target`이
 *   «다음 레벨 임계값»이라는 사실과 `level`을 함께 싣는다
 * - `repeat`  — 반복 카운터(`repeat_count`). 「현재 회차 / 임계 회차」
 * - `rest`    — 휴식(활동 공백). 「현재 최대 공백 / 요구 일수」
 */
export type BadgeProgressKind =
  | 'cumulative'
  | 'record'
  | 'periodic'
  | 'dual'
  | 'multi'
  | 'leveled'
  | 'repeat'
  | 'rest'

export type BadgeProgress =
  | {
      kind: BadgeProgressKind
      axes: BadgeProgressAxis[]
      /** 0~1 — 축이 여럿이면 평균이 아니라 최솟값 */
      progress: number
      /** 가장 뒤처진 축의 key */
      bottleneck: string
      /** 축들을 한 활동에서 동시에 채워야 하는가 */
      sameActivity: boolean
      /** 주기형만 — ISO 문자열, 리셋 시각 */
      periodEndsAt: string | null
      gate: BadgeProgressGate
      /**
       * 무한레벨형만 — 이 배지의 레벨(`badges.level`). 그 외에는 null.
       * 호출부가 `options.level`로 넘긴 값을 그대로 싣는다(이 계층은 레벨을 계산하지 않는다).
       */
      level: number | null
      /**
       * **축을 다 채워도 발급되지 않을 수 있다** — 2단 교차 게이트(`cross_in_axis` /
       * `cross_between_axis` / `gate_mission_badge`)가 걸린 배지인가.
       *
       * 이 계층은 게이트를 판정하지 않는다(유저 보유 배지 정의가 필요하고, 그건
       * `evaluateBadgeGates`의 몫이다). 그래서 **판정 결과가 아니라 「게이트가 있다」는 사실만**
       * 싣는다 — 이게 없으면 화면은 수치 100%를 「조건 충족」으로 그리는데 발급은 게이트가
       * 막는 상태가 된다(티켓 20260905_0031, 0030이 넘긴 «거짓말 중» 항목).
       */
      crossGated: boolean
    }
  | { kind: 'unsupported'; conditionKeys: string[] }

/**
 * `computeBadgeProgress`/`classifyBadgeProgressKind`가 **조건만으로는 알 수 없는** 배지
 * 속성. 무한레벨형 판정 기준은 `condition_json`이 아니라 `badges.rarity`이므로
 * (`badgeKind.ts`의 `isLeveledBadge`), 호출부가 배지 행에서 읽어 넘긴다.
 */
export type BadgeProgressOptions = {
  /** `badgeKindOf(badge)` 결과 — 넘기지 않으면 조건만으로 분류한다(기존 동작 그대로) */
  badgeKind?: BadgeKind
  /** `badges.level` — `badgeKind === 'leveled'`일 때만 의미가 있다 */
  level?: number | null
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter'

/**
 * (user, activity_type) 하나당 한 번만 계산하는 중간 집계값 — 배지 192개마다 활동 이력을
 * 재순회하지 않기 위한 캐시. `activities`는 이미 activity_type 필터 + (걷기라면) 축1
 * 게이트까지 적용된 작은 배열이므로, computeBadgeProgress가 필요시 이 배열을 추가로
 * filter(time_range·day_of_week 단일값 등)하는 것은 "192개마다 전체 이력 재순회"에
 * 해당하지 않는다.
 */
export interface UserPeriodMetrics {
  activityType: ActivityType
  /** activity_type 필터 + (걷기는) passesWalkingGate까지 적용된 활동 목록 */
  activities: NormalizedActivity[]
  totalCount: number
  totalDistanceKm: number
  totalElevationGainM: number
  streakDays: number
  activeDaysCount: number
  /**
   * 오늘이 포함된 주(월요일 시작)의 활동 횟수. `weekly_count` 조건의 실측값(역대 최고 주,
   * index.ts의 maxWeek)과 다르다 — 미획득 배지는 정의상 역대 최고 주도 미달이므로 이
   * 값은 그보다 같거나 작다(과대평가 없음). 걷기는 하루 1회 상한 적용(엔진과 동일 규칙).
   */
  weeklyCountCurrent: number
  /** 다음 리셋 시각(다음 월요일 00:00) ISO — weeklyCountCurrent와 반드시 같은 경계 기준 */
  weekEndsAt: string
  /** weeklyCountCurrent와 같은 경계를 다시 계산해야 하는 축(time_range 동반 등)을 위한 키 */
  currentWeekMondayKey: string
  /** 이번 달(달력 1일~말일) 누적 거리. `monthly_km` 조건의 실측값(역대 최고 달)과 다르다 */
  monthlyKmCurrent: number
  /** 다음 리셋 시각(다음 달 1일 00:00) ISO */
  monthEndsAt: string
  /** month 필터(단일/배열) 적격 여부를 재계산할 때 쓰는 현재 달(1~12)/연도 */
  currentMonthNumber: number
  currentYear: number
  /** 요일별 활동 횟수(걷기는 날짜 dedup 적용) — day_of_week 단일/배열 축 공용 */
  dayOfWeekCounts: Record<DayOfWeek, number>
  /** 계절별 활동 횟수 — season_count(단일)·season_count_all(다중) 축 공용 */
  seasonCounts: Record<Season, number>

  // ── 최댓값·마지막 활동 지표 (티켓 20260905_0031) ─────────────────────────
  //
  // 예전에는 축을 만들 때마다 `metrics.activities`를 다시 순회했다(`buildScalarAxis`).
  // 배지 550종 × 2패스면 같은 배열을 1,100번 훑는다 — 서버 컴포넌트 동기 계산이라 TTFB에
  // 직결된다. 여기서 한 번만 접어 둔다(집계는 (user, activity_type)당 1회다).

  /**
   * 축별 «역대 최고 실측값» — **방향이 이미 적용돼 있다.** 「클수록 좋음」 축은 최댓값,
   * 「작을수록 좋음」 축(페이스·한파)은 최솟값이다. 측정값이 하나도 없으면 축 종류에 따라
   * `0` / `±Infinity`가 들어간다(`bestScalarValue` 참고 — 기존 `buildScalarAxis`의 폴백과 동일).
   *
   * ⚠️ `duration_minutes`에 `time_range`가 붙은 조건처럼 **필터가 있는 축은 이 값을 쓸 수 없다** —
   * 그때는 좁힌 풀 위에서 같은 함수(`bestScalarValue`)를 다시 부른다.
   */
  maxScalarValues: Record<ScalarAxisKey, number>
  /**
   * **마지막 활동 하나**의 축별 실측값 — 기록형 표시의 근거다(티켓 20260905_0031 «표시 값의
   * 성격 분리»). 누적형이 「지금까지 쌓인 값」을 보여준다면 기록형은 「이번에 얼마나
   * 가까웠나」를 보여줘야 한다. 활동이 없으면 전부 `null`.
   */
  lastActivityValues: Record<ScalarAxisKey, number | null>
  /** 한 번의 활동에서 낸 최장 거리(km) — `maxScalarValues.distance_km`과 같은 값의 별칭 */
  maxSingleDistanceKm: number
  /** 한 번의 활동에서 낸 최장 이동시간(분) — `maxScalarValues.duration_minutes`의 별칭 */
  maxSingleDurationMin: number
  /**
   * 역대 최고 «순간 최고 속도»(km/h). v5 조건 `max_speed_kmh`용 — 평균 속도
   * (`maxScalarValues.min_speed_kmh`)와 다른 축이다. 값이 있는 활동이 없으면 0.
   */
  maxSpeedKmh: number
  /**
   * 역대 최고 «도달 고도»(m). v5 조건 `max_elevation_m`용 — 고도 «상승량»
   * (`totalElevationGainM`)이 아니다. 값이 있는 활동이 없으면 0.
   */
  maxElevationM: number
}

// ── 내부 유틸 ────────────────────────────────────────────────────────────

const ALL_DAYS: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const ALL_SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter']
const SEASON_MONTHS: Record<Season, number[]> = {
  spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11], winter: [12, 1, 2],
}

/** index.ts 전체가 이 "naive local" 규약을 쓴다 — startDateLocal은 Z 없는 로컬 벽시계 문자열 */
function dateOf(a: NormalizedActivity): Date {
  return new Date(a.startDateLocal ?? a.startDate)
}
function dateKey(a: NormalizedActivity): string {
  return (a.startDateLocal ?? a.startDate).slice(0, 10)
}
function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}
function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/** 걷기 하루 1회 상한(엔진 weekly_count 블록과 동일 규칙) 적용 후 지정 주(월요일 키) 카운트 */
function countInWeek(activities: NormalizedActivity[], mondayKey: string, activityType: ActivityType): number {
  const pool = activityType === 'walking' ? dedupeOnePerDay(activities) : activities
  return pool.filter((a) => getMondayKey(dateOf(a)) === mondayKey).length
}

function sumKmInMonth(activities: NormalizedActivity[], year: number, month0: number): number {
  return activities
    .filter((a) => { const d = dateOf(a); return d.getFullYear() === year && d.getMonth() === month0 })
    .reduce((s, a) => s + a.distanceKm, 0)
}

/** 다음 주 월요일 00:00 ISO 문자열 — getMondayKey와 동일한 "naive local" 규약(index.ts) */
function nextMondayIso(mondayKey: string): string {
  const monday = new Date(`${mondayKey}T00:00:00`)
  monday.setDate(monday.getDate() + 7)
  return monday.toISOString()
}

/** 다음 달 1일 00:00 ISO 문자열(달력 기준) */
function nextMonthStartIso(now: Date): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0).toISOString()
}

/**
 * 축 하나의 «역대 최고 실측값» — **방향이 적용된 값**(티켓 20260905_0031).
 *
 * 「클수록 좋음」은 최댓값, 「작을수록 좋음」(페이스·한파)은 최솟값이다. 측정값이 하나도
 * 없으면 방향에 맞는 «최악값»(`±Infinity`)을 돌려준다 — 0을 돌려주면 페이스 축에서
 * 「0초/km」라는 완벽한 기록이 되어 버린다. 축 빌더가 각자 폴백을 적용한다(기존 코드와 동일).
 *
 * 예전에는 이 계산이 `buildScalarAxis` 안에 축마다 인라인으로 흩어져 있었다. 한 곳으로 모아
 * `computeUserPeriodMetrics`가 미리 접어 두고(배지마다 재순회 제거), 필터가 붙은 축만 좁힌
 * 풀 위에서 **같은 함수**를 다시 부른다.
 */
function bestScalarValue(field: ScalarAxisKey, activities: NormalizedActivity[]): number {
  const lowerIsBetter = LOWER_IS_BETTER_AXIS_KEYS.has(field)
  const values = activities.map((a) => getFieldValue(field, a)).filter((v) => Number.isFinite(v))
  if (values.length === 0) return lowerIsBetter ? Infinity : -Infinity
  return lowerIsBetter ? Math.min(...values) : Math.max(...values)
}

/**
 * 축 하나의 «마지막 활동 값» — 측정 불가(주말 축인데 마지막 활동이 평일 등)면 null.
 *
 * 기록형 표시의 근거다. `computeRecordRegretLine`도 같은 함수를 쓴다 — 두 곳이 각자
 * 「마지막 활동」을 고르면 축에는 9.8km라고 써 놓고 아쉬움 줄은 다른 활동으로 계산된다.
 */
function latestScalarValue(field: ScalarAxisKey, activities: NormalizedActivity[]): number | null {
  if (activities.length === 0) return null
  const latest = activities.reduce((a, b) => (dateOf(a) > dateOf(b) ? a : b))
  const value = getFieldValue(field, latest)
  return Number.isFinite(value) ? value : null
}

/** 값이 있는 활동만 골라 최댓값 — v5 확장 필드(`maxSpeedKmh`·`maxElevationM`)용. 없으면 0 */
function maxOfOptionalField(activities: NormalizedActivity[], pick: (a: NormalizedActivity) => number | undefined): number {
  const values = activities.map(pick).filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return values.length > 0 ? Math.max(...values) : 0
}

// ── B. 유저 지표 집계 ────────────────────────────────────────────────────

export function computeUserPeriodMetrics(
  activityType: ActivityType,
  /** 유저의 전체 활동 이력(모든 종목 혼재) — 이 함수가 activity_type으로 좁힌다 */
  allActivities: NormalizedActivity[],
  now: Date = new Date()
): UserPeriodMetrics {
  const byType = allActivities.filter((a) => a.jamActivityType === activityType)
  const activities = activityType === 'walking' ? byType.filter(passesWalkingGate) : byType

  const totalCount = activities.length
  const totalDistanceKm = activities.reduce((s, a) => s + a.distanceKm, 0)
  const totalElevationGainM = activities.reduce((s, a) => s + a.elevationGainM, 0)
  const streakDays = calcMaxStreak(activities)
  const activeDaysCount = new Set(activities.map(dateKey)).size

  const currentWeekMondayKey = getMondayKey(now)
  const weeklyCountCurrent = countInWeek(activities, currentWeekMondayKey, activityType)
  const weekEndsAt = nextMondayIso(currentWeekMondayKey)

  const currentYear = now.getFullYear()
  const currentMonthNumber = now.getMonth() + 1
  const monthlyKmCurrent = sumKmInMonth(activities, currentYear, now.getMonth())
  const monthEndsAt = nextMonthStartIso(now)

  const dayOfWeekCounts = ALL_DAYS.reduce((acc, day) => {
    const pool = activities.filter((a) => matchesDayOfWeek(a, day))
    // 요일 단일값으로 이미 좁힌 뒤라 "하루 1회 상한"은 "그 요일의 고유 날짜 수"와 동치
    acc[day] = activityType === 'walking' ? new Set(pool.map(dateKey)).size : pool.length
    return acc
  }, {} as Record<DayOfWeek, number>)

  const seasonCounts = ALL_SEASONS.reduce((acc, season) => {
    acc[season] = activities.filter((a) => SEASON_MONTHS[season].includes(dateOf(a).getMonth() + 1)).length
    return acc
  }, {} as Record<Season, number>)

  // 축별 최댓값·마지막 활동 값 — 배지마다 재순회하지 않도록 여기서 한 번만 접는다
  // (티켓 20260905_0031). 두 맵 모두 SCALAR_AXIS_KEYS에서 파생되므로 축이 추가되면
  // 자동으로 따라온다 — 손으로 나열하지 않는다.
  const maxScalarValues = {} as Record<ScalarAxisKey, number>
  const lastActivityValues = {} as Record<ScalarAxisKey, number | null>
  for (const key of SCALAR_AXIS_KEYS) {
    maxScalarValues[key] = bestScalarValue(key, activities)
    lastActivityValues[key] = latestScalarValue(key, activities)
  }

  return {
    activityType,
    activities,
    totalCount,
    totalDistanceKm,
    totalElevationGainM,
    streakDays,
    activeDaysCount,
    weeklyCountCurrent,
    weekEndsAt,
    currentWeekMondayKey,
    monthlyKmCurrent,
    monthEndsAt,
    currentMonthNumber,
    currentYear,
    dayOfWeekCounts,
    seasonCounts,
    maxScalarValues,
    lastActivityValues,
    // 별칭 — 티켓이 이름으로 지목한 지표들. 파생값이라 따로 순회하지 않는다
    maxSingleDistanceKm: Number.isFinite(maxScalarValues.distance_km) ? maxScalarValues.distance_km : 0,
    maxSingleDurationMin: Number.isFinite(maxScalarValues.duration_minutes) ? maxScalarValues.duration_minutes : 0,
    maxSpeedKmh: maxOfOptionalField(activities, (a) => a.maxSpeedKmh),
    maxElevationM: maxOfOptionalField(activities, (a) => a.maxElevationM),
  }
}

// ── A. 분류 함수 (§H — 어드민 경고가 나중에 그대로 재사용) ───────────────────

/**
 * 표시 레이어(`badgeProgressText.ts`, 티켓 20260904_0921/2c)가 "아쉬움 줄" diff 방향을
 * 재사용하기 위한 노출. `conditionAxes.ts`의 목록을 그대로 넓힌 타입으로 다시 내보내는
 * 것뿐이다 — 값을 재정의하지 않는다(티켓 20260905_0031: 재선언 금지).
 */
export const LOWER_IS_BETTER_KEYS: ReadonlySet<string> = LOWER_IS_BETTER_AXIS_KEYS

function measurableScalarKeys(condition: BadgeCondition): ScalarAxisKey[] {
  // temperature_min_c/max_c + total_count는 엔진에서 "카운팅 대상 필터"로만 쓰인다 — 축 아님
  // (index.ts relevantPerActivityKeys 구성부의 동일 예외, T12~T14 어뷰징 방지 목적과 동일 이유)
  const tempIsFilterOnly = condition.total_count !== undefined
  return SCALAR_AXIS_KEYS.filter((k) => {
    if (condition[k] === undefined) return false
    if (tempIsFilterOnly && (k === 'temperature_min_c' || k === 'temperature_max_c')) return false
    return true
  })
}

/**
 * 술어가 흡수하지 못한 채 조건에 남은 «독립 측정 축» 키 (티켓 20260905_0031 재시도).
 *
 * 휴식·회차 축은 조건 전체가 아니라 **자기 술어가 보는 부분**만 그린다. 그래서 술어가
 * 소비하지 않는 측정 축이 하나라도 남아 있으면, 그 축을 화면에서 통째로 숨긴 채 진행률이
 * 100%까지 차오른다 — 정작 발급은 그 숨은 축이 미달이라 막혀 있다. 기존 5종은
 * `axisCount === 1` 가드가 이 상황을 이미 막고 있었고, 이 함수가 같은 규칙을 신규 kind로
 * 넓힌다(게이트 실측 재현: `{ streak_days: 6, return_gap_days: 5 }` → 진행률 100% · 발급 false).
 *
 * `consumed`는 술어별 예외 목록이다 — 휴식은 `restConsumedPairKeys`, 회차는
 * `repeatConsumedAxisKeys`가 각 술어 옆에서 답한다(이 파일이 다시 정의하지 않는다).
 */
function unabsorbedAxisKeys(condition: BadgeCondition, consumed: readonly string[]): string[] {
  const consumedSet = new Set<string>(consumed)
  return MEASURED_AXIS_KEYS.filter((k) => condition[k] !== undefined && !consumedSet.has(k))
}

/**
 * 조건 «자체»의 유형 — 무한레벨형 여부(배지 행 속성)는 보지 않는다.
 * `classifyBadgeProgressKind`가 `leveled`의 «기반 유형»을 구할 때도 이 함수를 쓴다.
 */
function classifyConditionKind(condition: BadgeCondition): BadgeProgressKind | 'unsupported' {
  if (!condition) return 'unsupported'

  // fail-closed와 보조를 맞춘다 (티켓 20260905_0028 개선 리뷰).
  // 아래 분류는 아는 축만 세므로, «기존 축 1개 + 평가 대기 필드 1개»인 조건은 대기 필드를
  // 무시한 채 cumulative/record 진행률을 그린다 — 조건은 fail-closed로 막혀 발급되지 않는데
  // 화면에는 「78% 달성」이 뜨는 상태가 된다. 이건 어드민이 아니라 유저 노출(배지 트리 진행
  // 레일)이라, 발급이 막히는 조건은 진행률도 그리지 않는 편이 정직하다.
  const blocking = findBlockingConditionKeys(condition)
  if (hasBlockingConditionKeys(blocking)) return 'unsupported'

  const restKeys = restConditionKeysIn(condition)
  const hasRepeat = condition.repeat_count !== undefined

  // 휴식 + 회차는 **발급 자체가 막히는 조합**이다(§2.16 「회차와 함께 쓸 수 없다」,
  // 티켓 20260905_0030 B-10). 어느 한쪽 축을 그리면 나머지 절반을 숨긴 채 진행률이 차오른다.
  if (restKeys.length > 0 && hasRepeat) return 'unsupported'

  // 휴식(활동 공백) — 「닫힌 공백」만 세므로 현재 시각(now)이 필요 없다(§2.16).
  // 실측값은 발급 판정과 **같은 함수**(`evaluateRestConditions`)에서 온다.
  //
  // 휴식 판정이 보지 않는 측정 축이 조건에 남아 있으면 그리지 않는다 — 아래 기존 5종의
  // `axisCount` 가드와 **같은 규칙**이다. 짝 필드(streak_days·single_distance_km)는 휴식
  // 술어가 실제로 읽으므로 독립 축이 아니다(`restConsumedPairKeys`).
  if (restKeys.length > 0) {
    return unabsorbedAxisKeys(condition, restConsumedPairKeys(condition)).length > 0 ? 'unsupported' : 'rest'
  }

  // 반복 카운터 — 회차 술어가 다루지 못하는 키가 섞이면 발급 쪽이 회차를 0으로 떨어뜨린다
  // (fail-closed). 그때 진행률을 그리면 「화면은 3/5회인데 발급은 0회차」가 된다.
  // **판정은 발급과 같은 함수**(`unconsumedRepeatConditionKeys`)로 한다 — 여기서 직접 부르는
  // 이유는 `collectRepeatOccurrences`가 그 경우 경고 로그를 찍기 때문이다(배지 × 유저마다 폭발).
  //
  // 회차를 «셀 수 있는가»(위)와 회차 축이 «조건을 대표할 수 있는가»(아래)는 다른 질문이다.
  // `{ repeat_count: 5, distance_km: 1000 }`은 회차가 정상적으로 세어지지만(그래서 발급도
  // 가능하다) 1,000km는 누적 합계로 따로 평가되는 독립 축이라 회차 축에 흡수되지 않는다 —
  // 그리면 「5/5회 = 100%」 옆에서 1,000km가 사라진다.
  if (hasRepeat) {
    if (unconsumedRepeatConditionKeys(condition).length > 0) return 'unsupported'
    const consumed = [...repeatConsumedAxisKeys(condition), 'repeat_count']
    return unabsorbedAxisKeys(condition, consumed).length > 0 ? 'unsupported' : 'repeat'
  }

  const isMulti =
    (Array.isArray(condition.day_of_week) && condition.total_count !== undefined) ||
    condition.season_count_all !== undefined
  if (isMulti) return 'multi'

  // month 단독(monthly_km 없이)은 현재 카탈로그에 0건 — "활동 1회 이상 있었는지"만 보는
  // 별개 메커니즘이라(진행률로 표현 가능한 수치 축이 아님) periodic으로 묶지 않는다.
  // 키 목록은 `conditionAxes.ts` 하나뿐이다 — 위 `unabsorbedAxisKeys`가 세는 축과 이 분류가
  // 갈라지면 「가드는 통과하는데 축은 없는」 조합이 생긴다(티켓 20260905_0031 재시도).
  const isPeriodic = PERIODIC_AXIS_KEYS.some((k) => condition[k] !== undefined)

  // total_count는 day_of_week 배열과 함께 오면 «요일별 독립 카운터»(multi)라 단독 축이 아니다.
  const isCounterAlone = COUNTER_AXIS_KEYS.some(
    (k) => condition[k] !== undefined && !(k === 'total_count' && Array.isArray(condition.day_of_week))
  )

  const scalarKeys = measurableScalarKeys(condition)

  const axisCount = scalarKeys.length + (isPeriodic ? 1 : 0) + (isCounterAlone ? 1 : 0)

  if (axisCount === 1) {
    if (isPeriodic) return 'periodic'
    if (isCounterAlone) return 'cumulative'
    const key = scalarKeys[0]
    if (key === 'distance_km' || key === 'elevation_gain_m') {
      // same_activity:true면 "그 활동 하나"의 값이 기준(record) — 기본은 누적 합계(cumulative)
      return condition.same_activity === true ? 'record' : 'cumulative'
    }
    return 'record'
  }

  if (axisCount === 2 && scalarKeys.length === 2) return 'dual'

  return 'unsupported'
}

/**
 * 진행 유형 분류. **무한레벨형은 조건만으로 알 수 없다** — 판정 기준이 `badges.rarity`라
 * (`badgeKind.ts`의 `isLeveledBadge`) 호출부가 `options.badgeKind`로 알려줘야 한다.
 * 넘기지 않으면 조건만으로 분류한다(기존 소비처는 그대로 동작한다).
 *
 * 레벨형이어도 **기반 유형이 unsupported면 unsupported다** — 「레벨형이니까 뭐라도 그리자」는
 * 곧 거짓 진행률이다.
 */
export function classifyBadgeProgressKind(
  condition: BadgeCondition,
  options?: BadgeProgressOptions
): BadgeProgressKind | 'unsupported' {
  const base = classifyConditionKind(condition)
  if (options?.badgeKind !== 'leveled') return base
  return base === 'unsupported' ? 'unsupported' : 'leveled'
}

// ── A. 축 계산 헬퍼 ──────────────────────────────────────────────────────

type LabelMap = Map<string, { label: string; unit: string | null }>
type AxisResult = { axis: BadgeProgressAxis; fraction: number }

function resolveLabel(labelMap: LabelMap, key: string): { label: string; unit: string | null } {
  const found = labelMap.get(key)
  return { label: found?.label ?? key, unit: found?.unit ?? null }
}

/**
 * 라벨맵에 **조건 필드 메타(레지스트리) 폴백을 얹은 사본**을 만든다 — 반복·휴식 축 전용
 * (티켓 20260905_0031).
 *
 * 기존 8개 축은 `badge_metric_labels`에 시드가 있고, 없을 때 key 원문이 그대로 보이는 것은
 * 「아직 안 채워졌음을 눈에 띄게」 하는 의도적 설계다(§08 G). 반면 `repeat_count`·휴식 4종은
 * 그 테이블에 아직 행이 없어서 그대로 두면 화면에 `rest_after_streak`가 나간다. 레지스트리는
 * `badge_metric_labels` 시드의 출처이기도 하므로 **같은 문자열**이며, 새 라벨을 만드는 것이
 * 아니다(`activityFilters.ts`의 `restKeyLabel`과 동일한 태도).
 */
function withRegistryLabel(labelMap: LabelMap, key: string): LabelMap {
  if (labelMap.has(key)) return labelMap
  const meta = getConditionField(key)
  if (!meta) return labelMap
  return new Map(labelMap).set(key, { label: meta.label, unit: meta.unit ?? null })
}

/** "클수록 좋음" 축 — target<=0인 축은 카탈로그에 없지만 방어적으로 처리 */
function makeHigherBetterAxis(key: string, current: number, target: number, labelMap: LabelMap): AxisResult {
  const { label, unit } = resolveLabel(labelMap, key)
  const met = current >= target
  const fraction = target > 0 ? clamp01(current / target) : (met ? 1 : 0)
  // 「클수록 좋음」 축의 남은 양은 target − current. met이면 0으로 눌러 음수가 나가지 않게 한다.
  const remaining = met ? 0 : Math.max(0, target - current)
  return { axis: { key, label, unit, current, target, met, fraction, remaining }, fraction }
}

/**
 * "작을수록 좋음" + 항상 양수인 축(페이스 전용). target/current 비율로 0~1을 만든다 —
 * current가 없으면(Infinity, 활동 없음) fraction 0. temperature_max_c는 음수가 가능해
 * 이 공식을 못 쓴다 — makeColdRecordAxis 별도 사용.
 */
function makeLowerBetterRatioAxis(key: string, current: number, target: number, labelMap: LabelMap): AxisResult {
  const { label, unit } = resolveLabel(labelMap, key)
  const hasData = Number.isFinite(current) && current > 0
  const met = hasData && current <= target
  const fraction = hasData ? clamp01(target / current) : 0
  // **부호가 반대다** — 페이스 480초/km에 목표 450초/km면 남은 양은 30초(target − current가 아니다).
  // 측정값이 없으면 「남은 양을 말할 수 없다」(null) — 0으로 두면 다 채운 것처럼 보인다.
  const remaining = hasData ? (met ? 0 : Math.max(0, current - target)) : null
  return { axis: { key, label, unit, current: hasData ? current : 0, target, met, fraction, remaining }, fraction }
}

/**
 * temperature_max_c(한파 기록형) 전용 — 값이 음수일 수 있어 비율 공식이 성립하지 않는다.
 * COLD_PROGRESS_BASELINE_C는 met/target 판정에는 전혀 관여하지 않는, fraction(진행률 바
 * 채움 비율) 계산에만 쓰는 임의 기준점이다 — met은 항상 `current <= target`로만 결정된다.
 */
const COLD_PROGRESS_BASELINE_C = 35

function makeColdRecordAxis(key: string, current: number, target: number, labelMap: LabelMap): AxisResult {
  const { label, unit } = resolveLabel(labelMap, key)
  const hasData = Number.isFinite(current)
  const met = hasData && current <= target
  const c = hasData ? current : COLD_PROGRESS_BASELINE_C
  const span = COLD_PROGRESS_BASELINE_C - target
  const fraction = span > 0 ? clamp01((COLD_PROGRESS_BASELINE_C - c) / span) : (met ? 1 : 0)
  // 한파 축도 「작을수록 좋음」이라 부호가 반대다 — 목표 −5℃에 실측 2℃면 7도 남았다.
  const remaining = hasData ? (met ? 0 : Math.max(0, current - target)) : null
  return { axis: { key, label, unit, current: hasData ? current : 0, target, met, fraction, remaining }, fraction }
}

function getFieldValue(field: ScalarAxisKey, a: NormalizedActivity): number {
  switch (field) {
    case 'distance_km': return a.distanceKm
    case 'elevation_gain_m': return a.elevationGainM
    case 'duration_minutes': return a.movingTimeSec / 60
    case 'min_speed_kmh': return a.averageSpeedKmh
    case 'max_pace_sec_per_km': return kmhToPaceSecPerKm(a.averageSpeedKmh)
    case 'temperature_min_c': return a.weatherTempC ?? -Infinity
    case 'temperature_max_c': return a.weatherTempC ?? Infinity
    case 'weekend_duration_hours': return isWeekend(dateOf(a)) ? a.movingTimeSec / 3600 : -Infinity
  }
}

/**
 * time_range 등 필터가 붙는 필드의 "관련 활동 풀" — `buildScalarAxis`(역대 최댓값)와
 * `computeRecordRegretLine`(직전 활동, 티켓 20260904_0921/2c)이 반드시 같은 풀을 봐야
 * "N분 남음"이라고 해놓고 아쉬움 줄은 다른 필터 결과로 계산되는 불일치를 막는다 — 필터
 * 로직 자체는 여기 한 곳에만 둔다.
 */
function poolForScalarField(field: ScalarAxisKey, condition: BadgeCondition, metrics: UserPeriodMetrics): NormalizedActivity[] {
  if (field === 'duration_minutes' && condition.time_range !== undefined) {
    return metrics.activities.filter((a) => inTimeRange(a, condition.time_range!))
  }
  if (field === 'weekend_duration_hours') {
    return metrics.activities.filter((a) => isWeekend(dateOf(a)))
  }
  return metrics.activities
}

/**
 * "그 활동 하나"의 값을 축으로 감싼다 — `makeHigherBetterAxis`/`makeLowerBetterRatioAxis`/
 * `makeColdRecordAxis`는 "current가 어떻게 나온 값인지"(역대 최댓값이든 직전 활동 하나든)
 * 신경 쓰지 않는 순수 매핑이라 그대로 재사용한다.
 *
 * **축 종류별 함수 선택이 여기 한 곳에만 있다** — `buildScalarAxis`·기록형 축·아쉬움 줄이
 * 전부 이 함수를 거친다. 다르게 고르면 met/fraction 기준이 어긋난다.
 */
function makeAxisForField(field: ScalarAxisKey, rawValue: number, target: number, labelMap: LabelMap): AxisResult {
  if (field === 'temperature_max_c') return makeColdRecordAxis(field, rawValue, target, labelMap)
  if (LOWER_IS_BETTER_AXIS_KEYS.has(field)) return makeLowerBetterRatioAxis(field, rawValue, target, labelMap)
  // 「클수록 좋음」 축은 측정값이 하나도 없으면 -Infinity가 온다 — 기존 폴백(0)을 그대로 유지한다
  return makeHigherBetterAxis(field, Number.isFinite(rawValue) ? rawValue : 0, target, labelMap)
}

/**
 * 축의 «역대 최고 실측값». 필터가 없으면 `computeUserPeriodMetrics`가 미리 접어 둔 값을 쓰고,
 * 필터가 붙으면(`duration_minutes` + `time_range` 등) 좁힌 풀 위에서 **같은 함수**를 다시
 * 부른다 — 배지마다 전체 이력을 재순회하던 것을 없앤 것뿐이고 값은 이전과 동일하다
 * (티켓 20260905_0031).
 */
function bestScalarValueFor(field: ScalarAxisKey, condition: BadgeCondition, metrics: UserPeriodMetrics): number {
  const pool = poolForScalarField(field, condition, metrics)
  return pool === metrics.activities ? metrics.maxScalarValues[field] : bestScalarValue(field, pool)
}

/**
 * 8개 축 필드 중 하나를 "단독 필드 규칙"으로 계산한다 — dual(독립 평가)의 각 축, 그리고
 * record 단독 축(distance_km/elevation_gain_m 제외 6개) 양쪽에서 공유한다.
 * distance_km/elevation_gain_m은 여기서는 항상 "누적 합계"(cumulative) 규칙을 쓴다 —
 * same_activity:true인 단일 필드(T23)는 이 함수를 거치지 않고 `buildRecordAxis`가
 * «한 활동 하나의 값»(maxScalarValues / lastActivityValues)으로 처리한다.
 */
function buildScalarAxis(field: ScalarAxisKey, condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult {
  const target = condition[field] as number
  if (field === 'distance_km') return makeHigherBetterAxis('distance_km', metrics.totalDistanceKm, target, labelMap)
  if (field === 'elevation_gain_m') return makeHigherBetterAxis('elevation_gain_m', metrics.totalElevationGainM, target, labelMap)
  return makeAxisForField(field, bestScalarValueFor(field, condition, metrics), target, labelMap)
}

// ── A. kind별 axes 계산 ──────────────────────────────────────────────────

function buildCumulativeAxis(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult {
  if (condition.distance_km !== undefined) {
    return makeHigherBetterAxis('distance_km', metrics.totalDistanceKm, condition.distance_km, labelMap)
  }
  if (condition.elevation_gain_m !== undefined) {
    return makeHigherBetterAxis('elevation_gain_m', metrics.totalElevationGainM, condition.elevation_gain_m, labelMap)
  }
  if (condition.streak_days !== undefined) {
    return makeHigherBetterAxis('streak_days', metrics.streakDays, condition.streak_days, labelMap)
  }
  if (condition.active_days_count !== undefined) {
    return makeHigherBetterAxis('active_days_count', metrics.activeDaysCount, condition.active_days_count, labelMap)
  }
  if (condition.season_count !== undefined) {
    const season = condition.season
    const current = season && season !== 'all' ? metrics.seasonCounts[season as Season] : metrics.totalCount
    const key = season && season !== 'all' ? season : 'total_count'
    return makeHigherBetterAxis(key, current, condition.season_count, labelMap)
  }
  // total_count — day_of_week(단일)/time_range/temperature 필터가 붙어 있을 수 있음
  let pool = metrics.activities
  let key = 'total_count'
  if (condition.day_of_week !== undefined && !Array.isArray(condition.day_of_week)) {
    key = condition.day_of_week
    pool = pool.filter((a) => matchesDayOfWeek(a, condition.day_of_week as DayOfWeek))
  }
  if (condition.time_range !== undefined) {
    pool = pool.filter((a) => inTimeRange(a, condition.time_range!))
  }
  if (condition.temperature_min_c !== undefined) {
    pool = pool.filter((a) => a.weatherTempC != null && a.weatherTempC >= condition.temperature_min_c!)
  }
  if (condition.temperature_max_c !== undefined) {
    pool = pool.filter((a) => a.weatherTempC != null && a.weatherTempC <= condition.temperature_max_c!)
  }
  // 걷기 + day_of_week(단일)+total_count 조합은 엔진이 dedupeOnePerDay를 적용한다(하루 1회 상한)
  if (metrics.activityType === 'walking' && condition.day_of_week !== undefined && !Array.isArray(condition.day_of_week)) {
    pool = dedupeOnePerDay(pool)
  }
  return makeHigherBetterAxis(key, pool.length, condition.total_count ?? 0, labelMap)
}

/**
 * 기록형 축 — **표시값은 «마지막 활동의 값», 판정(met)은 «역대 최고»**
 * (티켓 20260905_0031 «표시 값의 성격 분리»).
 *
 * ## 왜 두 값을 섞나
 *
 * 누적형은 「지금까지 쌓인 값」이 곧 판정값이라 하나면 된다. 기록형은 다르다:
 *
 * - **표시(`current`)에 누적이나 역대 최고를 쓰면** 「12.4 / 12.4km」처럼 목표에 붙어 버려
 *   진행률이 사실상 고정되고, 「이번에 얼마나 가까웠나」라는 정보가 사라진다. 유저가 지금
 *   행동을 정하는 데 쓰는 값은 **마지막 활동의 값**이다.
 * - **판정(`met`)에 마지막 활동 값을 쓰면 발급과 어긋난다.** 발급 판정
 *   (`evaluateConditionDetailed`)은 기록형 필드를 **이력 전반**에서 본다 — 역대 최고가
 *   목표를 넘었으면 그 조건은 충족이다. 마지막 활동이 짧았다고 「미달」로 그리면 발급은
 *   되는데 화면은 아니라고 말하는, 이 티켓이 없애려는 어긋남의 방향만 뒤집힌 형태가 된다.
 *
 * 그래서 `met`은 역대 최고로, `current`는 마지막 활동으로 잡는다.
 *
 * ## `fraction`은 «마지막 활동» 쪽이다 — 캡션과 바가 같은 숫자를 말한다 (2026-09-05 확정)
 *
 * 초안은 `met`이면 `fraction`을 1로 눌렀다. 그러자 실 카탈로그(「지구력의 전사」)에서
 * **「캡션은 40/45분인데 바는 가득 참」**이 재현됐다 — 한 줄 안에서 숫자와 그림이 서로 다른
 * 말을 한다. 그래서 `fraction`은 `current / target`(= 마지막 활동 기준)을 그대로 따른다.
 *
 * ⚠️ **`met`은 여전히 역대 최고다.** 「조건 충족」 표시는 `met`(과 그 원본인
 * `checkCondition`)이 만들고, 그게 발급 판정과 같은 기준이다. `met`까지 마지막 활동으로
 * 바꾸면 «발급은 되는데 화면은 조건 충족이 아닌» 반대 방향의 어긋남이 생긴다.
 * `remaining`도 `met`과 짝을 이룬다(충족이면 0 — 「남은 양」은 배지 상태를 말하는 값이다).
 *
 * 마지막 활동 값을 구할 수 없으면(활동 0건, 또는 주말 축인데 주말 활동이 없음) 역대 최고
 * 축을 그대로 돌려준다 — 이전 동작과 동일하다.
 */
function buildRecordAxis(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult {
  // SCALAR_AXIS_KEYS에서 파생 — 손으로 다시 나열하면 그 목록에 축이 추가될 때 여기가 누락돼
  // classifyBadgeProgressKind는 'record'로 분류하는데 여기서 throw하는 불일치가 생길 수 있다
  // (개선 리뷰 지적, 티켓 20260904_0631 재시도).
  const field = measurableScalarKeys(condition)[0]
  if (!field) throw new Error('[computeBadgeProgress] buildRecordAxis: 필드를 찾을 수 없음 — classifyBadgeProgressKind와 불일치')

  const target = condition[field] as number
  const pool = poolForScalarField(field, condition, metrics)
  const bestResult = makeAxisForField(field, bestScalarValueFor(field, condition, metrics), target, labelMap)

  const lastValue = latestScalarValue(field, pool)
  if (lastValue === null) return bestResult

  const lastResult = makeAxisForField(field, lastValue, target, labelMap)
  const met = bestResult.axis.met
  // fraction은 lastResult 그대로 — 캡션(current/target)과 진행 바가 같은 숫자를 말한다.
  const fraction = lastResult.fraction
  return {
    axis: { ...lastResult.axis, met, fraction, remaining: met ? 0 : lastResult.axis.remaining },
    fraction,
  }
}

/**
 * 반복 카운터 축 — 「현재 회차 / 임계 회차」(티켓 20260905_0031, v5 §2.14).
 *
 * 회차는 **발급 판정과 같은 함수**(`collectRepeatOccurrences`)로 센다. 두 곳이 각자 세면
 * 「화면은 4/5회인데 발급은 5회차를 인정」 같은 어긋남이 생긴다.
 *
 * ⚠️ 넘기는 배열이 `metrics.activities`(종목 + 걷기 게이트가 이미 적용된 목록)라는 점이
 * 발급 경로(원본 배열을 넘긴다)와 다르다. `collectRepeatOccurrences`가 같은 필터를 다시
 * 적용하므로 `condition.activity_type === metrics.activityType`인 한 결과는 같다 —
 * 진행 계산은 애초에 (user, activity_type) 단위로 도는 계층이라 그 전제가 성립한다.
 */
function buildRepeatAxis(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult {
  const target = condition.repeat_count as number
  const occurrences = collectRepeatOccurrences(condition, metrics.activities)
  return makeHigherBetterAxis('repeat_count', occurrences.length, target, withRegistryLabel(labelMap, 'repeat_count'))
}

/**
 * 휴식 축 — 「현재 최대 공백 / 요구 일수」(티켓 20260905_0031, v5 §2.16).
 *
 * 실측값은 **발급 판정과 같은 함수**(`evaluateRestConditions`)의 결과에서 구조 그대로 꺼낸다
 * (0030 B3가 `bestDays`를, 이 티켓이 `shortfallKey`/`requiredDays`를 실었다) — 문자열을
 * 파싱하거나 공백 계산을 다시 구현하지 않는다.
 *
 * - **`anchorDate`를 넘기지 않는다**: `metrics.activities`는 호출부가 이미 가입 앵커로 자른
 *   이력이다(`getActivityHistory(_, _, anchorDate)`). 그리고 이 축은 「닫힌 공백」만 보므로
 *   현재 시각(`now`)도 필요 없다(§2.16 — 「지금까지 며칠 쉬었나」 같은 열린 공백을 넣게 되면
 *   그때 `now`를 세 소비처에 함께 전파해야 한다).
 * - 조건 형태 오류·짝 필드 없음처럼 **값 자체를 믿을 수 없는** 경우엔 `null`을 돌려준다 —
 *   그 조건은 발급도 막히므로 진행률을 그리지 않는 편이 정직하다.
 */
function buildRestAxis(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult | null {
  const evaluation = evaluateRestConditions(condition, metrics.activities)

  if (evaluation.kind === 'pass') {
    // 조건을 이미 채웠다. 어느 키의 공백이 얼마였는지는 «미발급 사유» 문자열에만 있으므로
    // (구조로는 실리지 않는다) 첫 키를 대표로 「요구 일수를 다 채운」 축으로 그린다 — 화면에
    // 필요한 것은 「다 찼다」는 사실이고, 그 이상은 배지 상세가 답한다.
    const key = restConditionKeysIn(condition)[0]
    if (!key) return null
    const target = condition[key] as number
    return makeHigherBetterAxis(key, target, target, withRegistryLabel(labelMap, key))
  }

  if (
    evaluation.kind === 'fail' &&
    evaluation.shortfallKey !== undefined &&
    evaluation.bestDays !== undefined &&
    evaluation.requiredDays !== undefined
  ) {
    return makeHigherBetterAxis(
      evaluation.shortfallKey,
      evaluation.bestDays,
      evaluation.requiredDays,
      withRegistryLabel(labelMap, evaluation.shortfallKey)
    )
  }

  return null
}

function buildPeriodicAxis(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): { axisResult: AxisResult; periodEndsAt: string } {
  if (condition.weekly_count !== undefined) {
    let current = metrics.weeklyCountCurrent
    if (condition.time_range !== undefined) {
      // time_range가 있으면 그 시간대로 좁힌 뒤 이번 주만 다시 집계 — 일반값(무필터) 재사용 불가
      const pool = metrics.activities.filter((a) => inTimeRange(a, condition.time_range!))
      current = countInWeek(pool, metrics.currentWeekMondayKey, metrics.activityType)
    }
    return { axisResult: makeHigherBetterAxis('weekly_count', current, condition.weekly_count, labelMap), periodEndsAt: metrics.weekEndsAt }
  }
  // monthly_km — month 필터(단일/배열)가 있으면 "이번 달"이 그 목록에 속할 때만 값을 인정한다.
  // (예: '1월의 다짐'은 9월엔 진행이 0이다 — 리셋 경계 자체는 항상 "다음 달 1일"로 통일)
  let current = metrics.monthlyKmCurrent
  if (condition.month !== undefined) {
    const months = Array.isArray(condition.month) ? condition.month : [condition.month]
    if (!months.includes(metrics.currentMonthNumber)) current = 0
  }
  return { axisResult: makeHigherBetterAxis('monthly_km', current, condition.monthly_km ?? 0, labelMap), periodEndsAt: metrics.monthEndsAt }
}

function buildDualAxes(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): { axes: AxisResult[]; sameActivity: boolean } {
  const fields = measurableScalarKeys(condition)
  const sameActivity = condition.same_activity === true

  if (sameActivity) {
    return { axes: buildSameActivityDualAxes(fields, condition, metrics, labelMap), sameActivity: true }
  }
  return { axes: fields.map((f) => buildScalarAxis(f, condition, metrics, labelMap)), sameActivity: false }
}

/**
 * same_activity:true인 2축 — "그 활동 하나"가 두 값을 함께 만족해야 한다(T1 야생의 첫발).
 * 아직 미달인 유저에게는 "가장 근접한 시도"를 보여준다(프로토타입 §05: "가장 가까운 기록은
 * 9월 1일 12.4km · 260m") — 두 축의 (실측/목표) 비율 중 최솟값(병목)이 가장 큰 활동 하나를
 * 골라 그 활동의 두 값을 그대로 노출한다. 필드 조합은 이론상 임의의 2개를 지원하지만,
 * 현재 카탈로그에서 same_activity와 결합 가능한 필드는 index.ts의
 * CUMULATIVE_SAME_ACTIVITY_KEYS(distance_km/elevation_gain_m) 2개뿐이다.
 */
function buildSameActivityDualAxes(fields: ScalarAxisKey[], condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult[] {
  const activities = metrics.activities
  if (activities.length === 0) {
    return fields.map((f) => makeHigherBetterAxis(f, 0, condition[f] as number, labelMap))
  }

  let bestActivity = activities[0]
  let bestScore = -Infinity
  for (const a of activities) {
    const score = Math.min(
      ...fields.map((f) => {
        const value = getFieldValue(f, a)
        const target = condition[f] as number
        if (LOWER_IS_BETTER_AXIS_KEYS.has(f)) {
          return Number.isFinite(value) && value > 0 ? target / value : 0
        }
        return target > 0 ? value / target : (value >= target ? 1 : 0)
      })
    )
    if (score > bestScore) {
      bestScore = score
      bestActivity = a
    }
  }

  return fields.map((f) => {
    const value = getFieldValue(f, bestActivity)
    const target = condition[f] as number
    return LOWER_IS_BETTER_AXIS_KEYS.has(f)
      ? makeLowerBetterRatioAxis(f, value, target, labelMap)
      : makeHigherBetterAxis(f, value, target, labelMap)
  })
}

function buildMultiAxes(condition: BadgeCondition, metrics: UserPeriodMetrics, labelMap: LabelMap): AxisResult[] {
  if (Array.isArray(condition.day_of_week)) {
    return condition.day_of_week.map((day) => makeHigherBetterAxis(day, metrics.dayOfWeekCounts[day], condition.total_count as number, labelMap))
  }
  return ALL_SEASONS.map((s) => makeHigherBetterAxis(s, metrics.seasonCounts[s], condition.season_count_all as number, labelMap))
}

function buildGate(locks: BadgeTreeLock[]): BadgeProgressGate {
  if (locks.length === 0) return null
  // OR 조건 — 하나라도 충족했으면 그 락을 대표로, 전부 미충족이면 첫 번째를 대표로 노출
  const chosen = locks.find((l) => l.fulfilled) ?? locks[0]
  return { kind: chosen.kind, name: chosen.name, href: chosen.href, met: chosen.fulfilled }
}

// ── A. 진행 계산 (공개 함수) ─────────────────────────────────────────────

export function computeBadgeProgress(
  condition: BadgeCondition,
  metrics: UserPeriodMetrics,
  labelMap: LabelMap,
  locks: BadgeTreeLock[],
  options?: BadgeProgressOptions
): BadgeProgress {
  const kind = classifyBadgeProgressKind(condition, options)
  const unsupported = (): BadgeProgress => ({ kind: 'unsupported', conditionKeys: Object.keys(condition ?? {}) })
  if (kind === 'unsupported') return unsupported()

  const gate = buildGate(locks)
  // 무한레벨형은 축 자체를 «기반 유형»으로 계산한다 — 레벨은 결과에 함께 싣는 메타일 뿐,
  // 「거리 210km」라는 축의 계산 방법을 바꾸지 않는다.
  const axisKind = kind === 'leveled' ? classifyConditionKind(condition) : kind
  if (axisKind === 'unsupported' || axisKind === 'leveled') return unsupported()

  let results: AxisResult[]
  let sameActivity = false
  let periodEndsAt: string | null = null

  switch (axisKind) {
    case 'cumulative':
      results = [buildCumulativeAxis(condition, metrics, labelMap)]
      break
    case 'record':
      results = [buildRecordAxis(condition, metrics, labelMap)]
      sameActivity = condition.same_activity === true
      break
    case 'periodic': {
      const built = buildPeriodicAxis(condition, metrics, labelMap)
      results = [built.axisResult]
      periodEndsAt = built.periodEndsAt
      break
    }
    case 'dual': {
      const built = buildDualAxes(condition, metrics, labelMap)
      results = built.axes
      sameActivity = built.sameActivity
      break
    }
    case 'multi':
      results = buildMultiAxes(condition, metrics, labelMap)
      break
    case 'repeat':
      results = [buildRepeatAxis(condition, metrics, labelMap)]
      break
    case 'rest': {
      const built = buildRestAxis(condition, metrics, labelMap)
      // 휴식 조건의 값 자체를 믿을 수 없는 경우 — 발급도 막히므로 진행률을 그리지 않는다
      if (!built) return unsupported()
      results = [built]
      break
    }
  }

  const progress = clamp01(Math.min(...results.map((r) => r.fraction)))
  const bottleneck = results.reduce((min, cur) => (cur.fraction < min.fraction ? cur : min), results[0]).axis.key

  return {
    kind,
    axes: results.map((r) => r.axis),
    progress,
    bottleneck,
    sameActivity,
    periodEndsAt,
    gate,
    level: kind === 'leveled' ? options?.level ?? null : null,
    // 교차 게이트는 이 계층이 판정할 수 없다(유저 보유 배지 정의가 필요하다) — 「있다」는
    // 사실만 싣는다. 화면이 「조건 충족」을 그리기 전에 이 값을 봐야 «거짓말»이 되지 않는다.
    crossGated: crossGateKeysIn(condition).length > 0,
  }
}

// ── 2c. 기록형 "아쉬움 줄" (티켓 20260904_0921) ─────────────────────────────

export type RegretLineData = {
  /** BadgeProgressAxis.key와 동일 네임스페이스(예: 'duration_minutes') */
  key: string
  /** 직전 활동 하나의 실측값(pace는 초/km 원값 — 표시 레이어가 mm:ss로 포맷) */
  current: number
  target: number
  unit: string | null
  label: string
}

/** 아쉬움 줄 표시 임계값 — 직전 활동이 다음 임계값의 이 비율 이상일 때만 보여준다(§05). */
const REGRET_LINE_THRESHOLD = 0.85

/**
 * 기록형(record) 계열 프런티어 전용 — "직전 활동 하나"가 다음 등급 임계값의 85% 이상인데
 * 아직 못 채웠을 때만 데이터를 반환한다(§05 "기록형에는 아쉬움 줄", §07 문구 참고 — 최종
 * 문장 조립은 표시 레이어 `badgeProgressText.ts`가 담당한다. 이 함수는 순수 계산만 한다).
 *
 * 티켓 20260905_0031부터 `axis.current`도 «마지막 활동의 값»이라 **두 값이 같아졌다** —
 * 그래도 이 함수는 남는다. 축은 숫자 한 줄(`9.8/12.4km`)이고 이 함수는 「{등급}까지 {차이}
 * 모자랐어요」라는 문장의 근거이며, 85% 임계값(§05)을 넘겼을 때만 나가기 때문이다.
 * **같은 함수**(`latestScalarValue`·`poolForScalarField`)를 쓰므로 두 값이 갈라질 수 없다.
 *
 * distance_km/elevation_gain_m(same_activity:true인 record, 예: T23)은 대상에서 뺀다 —
 * 2c 범위(레일 표시)의 기록형 계열 8개(§05 프로토타입 표 근거) 중 이 조합이 없다.
 */
export function computeRecordRegretLine(
  condition: BadgeCondition,
  metrics: UserPeriodMetrics,
  labelMap: LabelMap
): RegretLineData | null {
  if (classifyBadgeProgressKind(condition) !== 'record') return null

  const key = SCALAR_AXIS_KEYS.filter((k) => k !== 'distance_km' && k !== 'elevation_gain_m').find(
    (k) => condition[k] !== undefined
  )
  if (!key) return null

  const pool = poolForScalarField(key, condition, metrics)
  const rawValue = latestScalarValue(key, pool)
  if (rawValue === null) return null

  const target = condition[key] as number
  const { axis, fraction } = makeAxisForField(key, rawValue, target, labelMap)
  if (axis.met || fraction < REGRET_LINE_THRESHOLD) return null

  return { key, current: axis.current, target: axis.target, unit: axis.unit, label: axis.label }
}
