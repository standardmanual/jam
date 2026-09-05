/**
 * 배지 조건 필드 메타 레지스트리 — `condition_json` 필드의 단일 출처 (티켓 20260905_0028)
 *
 * 배경: 같은 키 목록이 6곳에 복제돼 있었다 — DB CHECK 제약 / `condition-schema.ts`의
 * MEASURABLE·FILTER 분류 / `BadgeCondition` 타입 / 계열 정합성 트리거의 `measurable_keys` /
 * `badge_metric_labels` 시드 / 어드민 폼의 `FORM_COVERED_CONDITION_KEYS`. 조건 필드 1개를
 * 추가하려면 6곳을 손대야 하고 그중 4곳은 누락돼도 조용히 통과한다.
 * 이 파일이 그 6곳 중 코드 쪽 전부의 단일 출처다(DB 쪽 2곳은 마이그레이션 131이 이 선언을
 * 그대로 옮겨 적는다).
 *
 * ## `evaluation` 플래그 — fail-closed 안전장치의 근거
 *
 * `index.ts`의 `matchesPerActivityCondition()`은 아는 키만 검사하고 **마지막에 `return true`**
 * 한다. 그래서 레지스트리에 선언됐지만 그 함수가 모르는 키는 조용히 무시되고 조건이 통과된다 —
 * 미구현 필드가 «발급 안 됨»이 아니라 «무조건 발급»이 되는 구조다. 오탈자로 잘못 들어간 키에도
 * 같은 일이 벌어진다.
 *
 * 그래서 필드마다 «누가 평가하는가»(`evaluation`)를 명시하고, `evaluateConditionDetailed`가
 * 조건에 `pending`/미지의 키가 하나라도 있으면 **명시적 사유와 함께 fail**한다
 * (`findBlockingConditionKeys`). v5 신규 20종은 평가 구현(티켓 20260905_0030) 전까지
 * `pending`이므로 «발급되지 않는 것»이 기본값이다.
 *
 * ## 새 조건 필드를 추가할 때
 * 1. `src/types/database.ts`의 `BadgeCondition`에 필드 추가 (컴파일러가 아래 목록 누락을 잡는다)
 * 2. 이 파일의 `CONDITION_FIELDS`에 항목 추가 — 라벨·단위·역할·입력 타입·평가 주체.
 *    활동 1건의 값을 **같은 단위로 그대로 비교**하는 필드라면 `activityField`도 함께 적는다
 *    (조건 키는 snake_case, 정규화 필드는 camelCase라 규칙적으로 대응하지 않는다)
 * 3. 마이그레이션으로 DB CHECK 배열 + `check_family_condition_consistency()`의
 *    `measurable_keys` + `badge_metric_labels` 행을 갱신 (131 파일이 그 패턴이다)
 */
import type { ActivityType, BadgeCondition, BadgeGateRequirement, BadgeRarity, DayOfWeek } from '@/types/database'
import type { NormalizedActivity } from '@/types/strava'
import { formatPaceSecPerKm } from '@/types/strava'

// ── 메타 타입 ────────────────────────────────────────────────────────────

/**
 * 필드의 역할.
 * - `measurable`: 그 자체로 pass/fail을 만든다. 하나도 없으면 «평가 가능한 조건 없음»으로 fail
 * - `filter`: 후보 활동군을 좁히기만 한다. 단독으로는 판정에 관여하지 않는다
 * - `meta`: 발급 판정에 관여하지 않는 표시·안내용 메타데이터
 */
export type ConditionRole = 'measurable' | 'filter' | 'meta'

/**
 * 이 필드를 **누가 평가하는가**. 셋을 구분하는 이유는 `boolean` 하나가 세 가지 뜻을
 * 겸하고 있었기 때문이다(티켓 20260905_0028 개선 리뷰) — 「엔진이 수치 검사한다」와
 * 「엔진 밖 파이프라인이 처리한다」와 「아무도 평가하지 않지만 관습상 통과시킨다」가
 * 전부 `true`였다. 그 과적재가 `route`를 «평가됨»으로 남기는 오분류를 낳았다.
 *
 * - `engine`   — `evaluateConditionDetailed`가 직접 수치·필터 검사를 한다
 * - `external` — **`evaluateConditionDetailed` 밖에서 처리한다.** 「엔진 바깥」이 아니라
 *   「이 함수 바깥」이 정확한 경계다: `poi_id`(체크인 파이프라인) ·
 *   `mission_reward`(미션 보상 경로)는 엔진 밖이지만, `prerequisite_badge_names`와
 *   2단 교차 게이트 3종(`cross_in_axis`·`cross_between_axis`·`gate_mission_badge`)은
 *   **엔진 안**의 후보 선별 단계(`index.ts`의 `evaluateBadgeGates()`)가 판정한다.
 *   조건 평가 함수가 «수치»로 볼 수 없는(유저 보유 배지가 필요한) 필드라 여기 속한다 —
 *   같은 자리에서 같은 방식으로 판정되는 네 필드가 서로 다른 값을 갖는 편이 더 위험하다.
 *   조건 평가 자체는 통과시켜야 한다(막으면 게이트가 붙은 배지가 전부 미발급이 된다)
 * - `pending`  — 아직 아무도 평가하지 않는다. **fail-closed로 막는다.**
 *   v5 신규 20종이 여기 속하며 평가 구현(티켓 20260905_0030)에서 하나씩 `engine`으로 뒤집는다.
 *   `route`도 여기다 — 타입·스키마·DB CHECK에만 있고 엔진에 참조가 0건이다(실측 2026-09-05).
 *   쓰는 배지가 0건이라 회귀 없이 정직하게 표기할 수 있다
 */
export type ConditionEvaluation = 'engine' | 'external' | 'pending'

/** 어드민 입력 UI의 컨트롤 종류 */
export type ConditionInputType =
  | 'number' // 소수 허용 수치
  | 'integer' // 정수 수치
  | 'boolean' // 체크박스
  | 'select' // 고정 목록 선택
  | 'text' // 자유 문자열
  | 'text_list' // 쉼표 구분 문자열 목록
  | 'pace' // "5:30" 형식 페이스
  | 'time_range' // { start, end } 시각 범위
  | 'object' // 위 어느 것도 아닌 복합 객체 (전용 UI 필요)

/**
 * 값이 클수록 좋은 축인지, 작을수록 좋은 축인지.
 * 진행률·«아쉬움 줄» 표시가 부등호 방향을 뒤집는 근거다(`badgeProgress.ts`의 LOWER_IS_BETTER).
 * 임계값 비교가 아닌 필터·패턴 필드는 `null`.
 */
export type ConditionDirection = 'higher' | 'lower' | null

/** 어드민 조건 빌더 폼의 원시 입력값 묶음(문자열/체크박스) */
export type ConditionFormValues = Record<string, string | boolean>

export interface ConditionFieldMeta<K extends keyof BadgeCondition = keyof BadgeCondition> {
  /** `condition_json`의 키 */
  key: K
  /** 한국어 라벨 (어드민·지표 라벨 시드의 출처) */
  label: string
  /** 단위. 없으면 null (페이스처럼 포맷터가 단위를 이미 포함하는 경우 포함) */
  unit: string | null
  role: ConditionRole
  input: ConditionInputType
  /** 수치 입력의 허용 범위·증분 (어드민 input 속성으로 그대로 내려간다) */
  min?: number
  max?: number
  step?: number
  /** 이 필드만으로는 의미가 완성되지 않아 함께 있어야 하는 짝 필드 */
  pairedWith?: readonly (keyof BadgeCondition)[]
  direction: ConditionDirection
  /**
   * 이 필드를 **누가 평가하는가**. `'pending'`이면 이 필드가 든 조건은
   * `evaluateConditionDetailed`가 fail-closed로 막는다. 나머지 둘은 통과시킨다.
   */
  evaluation: ConditionEvaluation
  /**
   * 이 조건 값과 **같은 단위로 직접 비교되는** `NormalizedActivity` 필드명 (티켓 20260905_0029).
   *
   * 조건 키는 snake_case(`avg_heartrate_bpm`)이고 정규화 필드는 camelCase(`avgHeartrateBpm`)라
   * 이름이 규칙적으로 대응하지 않는다 — `max_elevation_m`↔`maxElevationM`,
   * `single_distance_km`↔`distanceKm`처럼 어긋나는 쌍도 있다. 평가 구현(티켓 20260905_0030)이
   * 이 대응을 다시 손으로 적으면 오타가 조용히 «조건 통과»로 흘러가므로 여기서 한 번만 적는다.
   *
   * **단위 변환이 필요한 필드에는 달지 않는다.** `duration_minutes`는 `movingTimeSec`(초)와
   * 단위가 다르고, `max_pace_sec_per_km`는 `averageSpeedKmh`를 뒤집어야 하며,
   * `distance_km`·`elevation_gain_m`은 기본이 «누적 합계»라 단일 활동 값과 의미가 다르다.
   * 그런 필드까지 담으면 «이 이름을 그대로 읽어 비교하면 된다»는 이 선언의 뜻이 흐려진다.
   *
   * 값이 `undefined`(키 없음)일 수 있다 — 심박계 없는 유저의 활동에는 애초에 키가 없다.
   * 「데이터 없음 = 카운트 안 함」이 기본 동작이다.
   */
  activityField?: keyof NormalizedActivity
  /** 어드민 목록의 압축 칩. null을 돌려주면 그 배지에서는 칩을 만들지 않는다 */
  chip?: (c: BadgeCondition) => string | null
  /** 어드민 상세의 한 줄. null을 돌려주면 그 배지에서는 줄을 만들지 않는다 */
  detail?: (c: BadgeCondition) => string | null
  /**
   * 어드민 조건 빌더 폼과의 연결. 없으면 «폼 미지원 필드»로 분류돼
   * `buildConditionJsonFromFields`가 원본 값을 그대로 보존한다.
   */
  form?: ConditionFormBinding<NonNullable<BadgeCondition[K]>>
}

// ── 어드민 조건 폼 연결 ──────────────────────────────────────────────────
//
// 티켓 20260905_0032 A-2: 어드민 폼이 조건 필드마다 JSX를 하드코딩하던 것을 이 선언에서
// **생성**하도록 뒤집었다. 필드를 추가할 때 손대는 곳이 이 파일 하나가 되도록,
// 「무엇을 읽는가(read)」뿐 아니라 「어떻게 그리는가(controls)」·「기존 값을 폼에 어떻게
// 되돌리는가(write)」까지 여기 둔다.

/** 조건 폼의 묶음(입력 그룹). 선언 순서가 곧 화면 순서다 */
export const CONDITION_FORM_SECTIONS = [
  'basic',
  'period',
  'environment',
  'single',
  'pattern',
  'repeat',
  'gate',
  'meta',
] as const
export type ConditionFormSection = (typeof CONDITION_FORM_SECTIONS)[number]

export const CONDITION_FORM_SECTION_LABEL: Record<ConditionFormSection, string> = {
  basic: '기본 조건',
  period: '기간·주기',
  environment: '환경·시간대',
  single: '단일 활동 지표',
  pattern: '이력 패턴',
  repeat: '반복 획득',
  gate: '2단 게이트',
  meta: '메타데이터',
}

/**
 * 입력 컨트롤 1개. `form.fields`의 state 키와 1:1 대응한다.
 *
 * 수치 범위(min·max·step)와 단위는 **여기 다시 적지 않는다** — 필드 메타가 이미 갖고 있고
 * 어드민 폼이 렌더 시점에 그 값을 그대로 읽는다(레지스트리 안에서도 값을 두 번 적지 않는다).
 */
export interface ConditionFormControl {
  /** `ConditionFormFields`의 state 키 */
  field: string
  kind: 'number' | 'text' | 'time' | 'checkbox' | 'select'
  /** 입력 라벨. 생략하면 필드 메타의 `label`(+단위) */
  label?: string
  placeholder?: string
  /** 입력 아래 보조 설명 */
  help?: string
  /** 2열 그리드에서 한 줄 전체를 차지한다 */
  wide?: boolean
  /** `kind: 'select'` 전용 선택지 */
  options?: readonly { value: string; label: string }[]
  /** `kind: 'select'`의 «선택 안 함» 항목 문구. 생략하면 「— 없음 —」 */
  noneLabel?: string
}

export interface ConditionFormBinding<V> {
  /** 대응하는 폼 state 키(들) */
  fields: readonly string[]
  /** 폼 입력값 → `condition_json` 값. `undefined`면 그 필드를 넣지 않는다 */
  read: (f: ConditionFormValues) => V | undefined
  /**
   * `condition_json` 값 → 폼 초기값(`read`의 역방향).
   *
   * 이게 없으면 어드민이 배지를 열 때 기존 값을 폼에 되돌릴 수 없어 **저장만 해도 값이
   * 사라진다.** 왕복이 성립하지 않는 값(예: 쉼표가 든 배지 이름)은
   * `findUnrepresentableConditionKeys`가 저장 전에 경고로 드러낸다.
   *
   * ⚠️ **메서드 축약 문법이다**(화살표 프로퍼티가 아니다). `V`가 매개변수 자리에 오면
   * 화살표 프로퍼티는 반공변이라 `ConditionFieldMeta<'distance_km'>`를
   * `AnyConditionFieldMeta`(= 키 유니온)으로 넓히는 순간 대입이 깨진다 — 순회·Map 구성이
   * 전부 그 넓히기에 의존한다. 메서드 문법은 양변(bivariant) 검사라 이 넓히기를 허용한다.
   */
  write(value: V): Record<string, string | boolean>
  /**
   * 입력 UI 명세. **생략하면 폼이 이 필드를 그리지 않는다** — 전용 UI를 쓰는 필드
   * (미션 보상 체크박스·2단 교차 게이트)가 여기 해당한다. 값 조립·복원은 그대로 동작한다.
   */
  controls?: readonly ConditionFormControl[]
  section: ConditionFormSection
}

/** 폼 연결 헬퍼가 공통으로 받는 UI 명세 */
type FormUi = {
  section: ConditionFormSection
  label?: string
  placeholder?: string
  help?: string
  wide?: boolean
}

function controlOf(field: string, kind: ConditionFormControl['kind'], ui: FormUi): ConditionFormControl {
  return { field, kind, label: ui.label, placeholder: ui.placeholder, help: ui.help, wide: ui.wide }
}

/** 소수 허용 수치 1개짜리 폼 연결 */
function numberForm(field: string, ui: FormUi): ConditionFormBinding<number> {
  return {
    fields: [field],
    read: (f) => num(f[field]),
    write: (v) => ({ [field]: String(v) }),
    controls: [controlOf(field, 'number', ui)],
    section: ui.section,
  }
}

/** 정수 수치 1개짜리 폼 연결 */
function integerForm(field: string, ui: FormUi): ConditionFormBinding<number> {
  return {
    fields: [field],
    read: (f) => int(f[field]),
    write: (v) => ({ [field]: String(v) }),
    controls: [controlOf(field, 'number', ui)],
    section: ui.section,
  }
}

/**
 * 체크박스 1개짜리 폼 연결. **체크 해제는 «키 없음»이다** — `false`를 저장하지 않는다.
 * `same_activity: false`는 `same_activity` 없음과 같은 뜻인데 조건 JSON에 남으면
 * 어드민 칩·상세에 잔여물로 보이고 짝 필드 검사만 복잡해진다(기존 `mission_reward` 동작 유지).
 */
function booleanForm(field: string, ui: FormUi): ConditionFormBinding<boolean> {
  return {
    fields: [field],
    read: (f) => (f[field] === true ? true : undefined),
    write: () => ({ [field]: true }),
    controls: [controlOf(field, 'checkbox', ui)],
    section: ui.section,
  }
}

/** 쉼표 구분 문자열 → 문자열 배열. 공백만 남는 항목은 버린다 */
function csv(raw: string | boolean | undefined): string[] {
  if (typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 2단 교차 게이트 3종의 폼 연결 (티켓 20260905_0032 A-4).
 *
 * 세 게이트가 값 스키마(`family_keys` + `min_rarity?` + `min_count?`)를 공유하므로 폼 연결도
 * 하나로 둔다. **입력 UI는 전용 블록이 그린다** — 게이트끼리의 결합 규칙(교차 둘은 OR,
 * 미션 게이트는 AND)을 화면에서 드러내야 해서 2열 그리드에 흩어 놓을 수 없다.
 */
function gateForm(prefix: string): ConditionFormBinding<BadgeGateRequirement> {
  const keysField = `${prefix}FamilyKeys`
  const rarityField = `${prefix}MinRarity`
  const countField = `${prefix}MinCount`
  return {
    fields: [keysField, rarityField, countField],
    read: (f) => {
      const familyKeys = csv(f[keysField])
      if (familyKeys.length === 0) return undefined
      const req: BadgeGateRequirement = { family_keys: familyKeys }
      const minRarity = f[rarityField]
      if (typeof minRarity === 'string' && minRarity) req.min_rarity = minRarity as BadgeRarity
      const minCount = int(f[countField])
      if (minCount !== undefined) req.min_count = minCount
      return req
    },
    // jsonb라 형태 보장이 없다 — 깨진 값은 빈 문자열로 떨어지고,
    // `findUnrepresentableConditionKeys`가 「폼이 그대로 재현할 수 없다」로 경고한다.
    write: (v) => ({
      [keysField]: Array.isArray(v?.family_keys) ? v.family_keys.filter((k) => typeof k === 'string').join(', ') : '',
      [rarityField]: typeof v?.min_rarity === 'string' ? v.min_rarity : '',
      [countField]: typeof v?.min_count === 'number' ? String(v.min_count) : '',
    }),
    section: 'gate',
  }
}

/** 키를 특정하지 않은 메타 (Map·순회용) */
export type AnyConditionFieldMeta = ConditionFieldMeta<keyof BadgeCondition>

function field<K extends keyof BadgeCondition>(meta: ConditionFieldMeta<K>): ConditionFieldMeta<K> {
  return meta
}

// ── 표시 헬퍼 ────────────────────────────────────────────────────────────

/** 계절 값의 압축 표기 — BadgeDetail·BadgesTable에 각각 복제돼 있던 것을 여기로 모았다 */
export const SEASON_SHORT: Record<string, string> = {
  spring: '봄',
  summer: '여름',
  fall: '가을',
  winter: '겨울',
  all: '전계절',
}

/** 요일 값의 1글자 표기 — 자리가 좁은 어드민 목록 전용 */
export const DAY_OF_WEEK_SHORT: Record<string, string> = {
  sunday: '일',
  monday: '월',
  tuesday: '화',
  wednesday: '수',
  thursday: '목',
  friday: '금',
  saturday: '토',
}

/** 계절 Select 선택지 — 어드민 조건 폼이 그대로 그린다 */
const SEASON_FORM_OPTIONS = [
  { value: 'spring', label: '봄 (3~5월)' },
  { value: 'summer', label: '여름 (6~8월)' },
  { value: 'fall', label: '가을 (9~11월)' },
  { value: 'winter', label: '겨울 (12~2월)' },
  { value: 'all', label: '전 계절' },
] as const

/** 종목 Select 선택지. 라벨은 기존 어드민 폼과 같은 원문 슬러그를 유지한다 */
const ACTIVITY_TYPE_FORM_OPTIONS = [
  { value: 'cycling', label: 'cycling' },
  { value: 'running', label: 'running' },
  { value: 'trail_running', label: 'trail_running' },
  { value: 'hiking', label: 'hiking' },
  { value: 'walking', label: 'walking' },
] as const

const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

function dayOfWeekChip(days: DayOfWeek | DayOfWeek[]): string {
  if (typeof days === 'string') return `매주 ${DAY_OF_WEEK_SHORT[days] ?? days}`
  if (days.length === WEEKDAY_ORDER.length && WEEKDAY_ORDER.every((d) => days.includes(d as DayOfWeek))) {
    return '월~금 각각'
  }
  return days.map((d) => DAY_OF_WEEK_SHORT[d] ?? d).join('·')
}

/** 월 값(단일/배열)을 "6·7" 형태로 */
function monthsText(month: number | number[]): string {
  return [month].flat().join('·')
}

/** 폼 문자열 → 수치. 빈 문자열이면 undefined */
function num(raw: string | boolean | undefined): number | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  const v = parseFloat(raw)
  return Number.isNaN(v) ? undefined : v
}

/** 폼 문자열 → 정수. 빈 문자열이면 undefined */
function int(raw: string | boolean | undefined): number | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  const v = parseInt(raw, 10)
  return Number.isNaN(v) ? undefined : v
}

/**
 * 2단 교차 게이트(`cross_in_axis` 등)의 어드민 표기 (티켓 20260905_0030 B2).
 *
 * 값이 jsonb라 형태 보장이 없다. 깨진 값에 `undefined`/`NaN`이 섞인 문자열을 만들면
 * `safeFormat`이 「형태 오류」로 대체하므로 여기서는 **정상 형태만** 그린다.
 */
function gateChip(prefix: string, req: BadgeGateRequirement | undefined): string | null {
  const count = req?.family_keys?.length
  if (typeof count !== 'number') return `${prefix}: 형태 오류`
  return `${prefix} ${count}계열`
}

function gateDetail(prefix: string, req: BadgeGateRequirement | undefined): string | null {
  const keys = req?.family_keys
  if (!Array.isArray(keys)) return `${prefix}: 형태 오류`
  const parts = [`${prefix}: ${keys.join(', ')}`]
  if (req?.min_count !== undefined) parts.push(`${req.min_count}개 이상`)
  if (req?.min_rarity !== undefined) parts.push(`${req.min_rarity} 이상`)
  return parts.join(' / ')
}

/** "5:30" 같은 mm:ss 페이스 입력을 초(sec/km)로 변환. 형식이 어긋나면 null */
export function parsePaceToSec(input: string): number | null {
  const match = input.trim().match(/^(\d+):([0-5]?\d)$/)
  if (!match) return null
  const min = parseInt(match[1], 10)
  const sec = parseInt(match[2], 10)
  return min * 60 + sec
}

// ── 필드 선언 ────────────────────────────────────────────────────────────
//
// **선언 순서가 곧 어드민 표시 순서다** (칩 목록·상세 목록 모두). 기존 두 표시 함수의
// 순서를 그대로 옮겨왔다 — BadgesTable이 더 많은 필드를 다루고 있었으므로 그쪽을 기준으로
// 삼고, BadgeDetail에만 있던 prerequisite_badge_names를 뒤에 붙였다.

export const CONDITION_FIELDS = [
  // ── 기존 25종 (전부 평가 구현됨) ─────────────────────────────────────

  field({
    key: 'distance_km',
    label: '누적 거리',
    unit: 'km',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 100000,
    step: 0.1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `누적 ${c.distance_km}km`,
    detail: (c) => `거리 누적 ${c.distance_km}km`,
    form: numberForm('distanceKm', { section: 'basic', label: '최소 거리 (km)', placeholder: '예: 30' }),
  }),
  field({
    key: 'total_count',
    label: '횟수',
    unit: '회',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 100000,
    step: 1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `${c.total_count}회`,
    detail: (c) => `총 ${c.total_count}회`,
    form: integerForm('totalCount', { section: 'basic', label: '누적 활동 횟수', placeholder: '예: 10' }),
  }),
  field({
    key: 'streak_days',
    label: '연속 일수',
    unit: '일',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 3650,
    step: 1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `${c.streak_days}일 연속`,
    detail: (c) => `${c.streak_days}일 연속 활동`,
    form: integerForm('streakDays', { section: 'basic', label: '연속 활동 일수', placeholder: '예: 7' }),
  }),
  field({
    key: 'active_days_count',
    label: '누적 활동일수',
    unit: '일',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 3650,
    step: 1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `누적 ${c.active_days_count}일`,
    detail: (c) => `누적 활동일수 ${c.active_days_count}일`,
    form: integerForm('activeDaysCount', { section: 'basic', label: '누적 활동일수 (일)', placeholder: '예: 100' }),
  }),
  field({
    key: 'elevation_gain_m',
    label: '누적 고도',
    unit: 'm',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 1000000,
    step: 1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `고도 ${c.elevation_gain_m}m`,
    detail: (c) => `고도 ${c.elevation_gain_m}m 이상`,
    form: numberForm('elevationM', { section: 'basic', label: '고도 상승 누적 (m)', placeholder: '예: 500' }),
  }),
  field({
    key: 'min_speed_kmh',
    label: '속도',
    unit: 'km/h',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 120,
    step: 0.1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `${c.min_speed_kmh}km/h+`,
    detail: (c) => `최소 속력 ${c.min_speed_kmh}km/h`,
    form: numberForm('minSpeedKmh', { section: 'basic', label: '최소 속도 (km/h)', placeholder: '예: 25' }),
  }),
  field({
    key: 'max_pace_sec_per_km',
    // 포맷터(formatPaceSecPerKm)가 "5:30/km"처럼 단위를 이미 포함해 출력하므로 unit은 두지 않는다
    label: '페이스',
    unit: null,
    role: 'measurable',
    input: 'pace',
    direction: 'lower',
    evaluation: 'engine',
    chip: (c) => `${formatPaceSecPerKm(c.max_pace_sec_per_km!)} 이내`,
    detail: (c) => `최대 페이스 ${formatPaceSecPerKm(c.max_pace_sec_per_km!)} 이내`,
    form: {
      fields: ['maxPace'],
      read: (f) => {
        if (typeof f.maxPace !== 'string' || f.maxPace === '') return undefined
        return parsePaceToSec(f.maxPace) ?? undefined
      },
      // 포맷터가 단위를 붙여 주므로 입력 형식("5:30")에 맞게 떼어 낸다
      write: (v) => ({ maxPace: formatPaceSecPerKm(v).replace('/km', '') }),
      controls: [
        {
          field: 'maxPace',
          kind: 'text',
          label: '최대 페이스 (mm:ss/km, 러닝 계열용)',
          placeholder: '예: 5:30 (값이 작을수록 빠름)',
        },
      ],
      section: 'basic',
    },
  }),
  field({
    key: 'duration_minutes',
    // 「이동시간」은 누적인지 단일인지가 불명확해 v5에서 「한 번의 이동시간」으로 고쳤다
    // (마이그레이션 131의 badge_metric_labels 수정 2건 중 하나).
    label: '한 번의 이동시간',
    unit: '분',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 1440,
    step: 1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `${c.duration_minutes}분+`,
    detail: (c) => `최소 활동 시간 ${c.duration_minutes}분`,
    form: integerForm('durationMinutes', { section: 'basic', label: '한 번의 이동 시간 (분)', placeholder: '예: 60' }),
  }),
  field({
    key: 'weekend_duration_hours',
    label: '주말 활동시간',
    unit: '시간',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 24,
    step: 0.1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `주말 ${c.weekend_duration_hours}h`,
    detail: (c) => `주말 활동 시간 ${c.weekend_duration_hours}시간`,
    form: numberForm('weekendDurationHours', {
      section: 'period',
      label: '주말 활동 최소 이동 시간 (시간)',
      placeholder: '예: 2',
    }),
  }),
  field({
    key: 'weekly_count',
    label: '주간 횟수',
    unit: '회',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 50,
    step: 1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `주 ${c.weekly_count}회`,
    detail: (c) => `주 ${c.weekly_count}회 이상`,
    form: integerForm('weeklyCount', { section: 'period', label: '한 주(월~일) 내 최소 활동 횟수', placeholder: '예: 3' }),
  }),
  field({
    key: 'day_of_week',
    label: '요일',
    unit: null,
    role: 'filter',
    input: 'select',
    pairedWith: ['total_count'],
    direction: null,
    evaluation: 'engine',
    chip: (c) => dayOfWeekChip(c.day_of_week!),
    detail: (c) => dayOfWeekChip(c.day_of_week!),
  }),
  field({
    key: 'month',
    label: '해당 월',
    unit: null,
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 12,
    step: 1,
    pairedWith: ['monthly_km'],
    direction: null,
    evaluation: 'engine',
    // monthly_km가 함께 있으면 그쪽 문구에 월이 흡수된다 — 여기서는 만들지 않는다
    chip: (c) => (c.monthly_km !== undefined ? null : `${monthsText(c.month!)}월`),
    detail: (c) => (c.monthly_km !== undefined ? null : `${monthsText(c.month!)}월`),
    // 엔진은 `month`를 배열로도 읽는다(`index.ts`의 `Array.isArray(condition.month)`). 폼이
    // 단일 정수로만 읽으면 `[6, 7]`인 배지를 열어 저장하는 것만으로 6월로 접힌다 — 왕복
    // 가능한 쉼표 목록으로 다룬다(티켓 20260905_0032 A-2, 조용한 유실 방지).
    form: {
      fields: ['month'],
      read: (f) => {
        const months = csv(f.month)
          .map((s) => parseInt(s, 10))
          .filter((n) => Number.isFinite(n))
        if (months.length === 0) return undefined
        return months.length === 1 ? months[0] : months
      },
      write: (v) => ({ month: [v].flat().join(', ') }),
      controls: [
        { field: 'month', kind: 'text', label: '해당 월 (1~12)', placeholder: '예: 8 · 여러 달은 6, 7' },
      ],
      section: 'period',
    },
  }),
  field({
    key: 'monthly_km',
    label: '월 누적 거리',
    unit: 'km',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 10000,
    step: 0.1,
    pairedWith: ['month'],
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `${c.month !== undefined ? `${monthsText(c.month)}월 ` : '월간 '}${c.monthly_km}km`,
    detail: (c) => `${c.month !== undefined ? `${monthsText(c.month)}월 ` : '월간 '}${c.monthly_km}km 이상`,
    form: numberForm('monthlyKm', { section: 'period', label: '월 누적 거리 (km)', placeholder: '예: 100' }),
  }),
  field({
    key: 'season',
    label: '계절',
    unit: null,
    role: 'filter',
    input: 'select',
    pairedWith: ['season_count'],
    direction: null,
    evaluation: 'engine',
    // season_count가 함께 있으면 그쪽 문구에 계절이 흡수된다
    chip: (c) => (c.season_count !== undefined ? null : (SEASON_SHORT[c.season!] ?? c.season!)),
    detail: (c) => (c.season_count !== undefined ? null : (SEASON_SHORT[c.season!] ?? c.season!)),
    form: {
      fields: ['season'],
      read: (f) => (typeof f.season === 'string' && f.season ? (f.season as NonNullable<BadgeCondition['season']>) : undefined),
      write: (v) => ({ season: v }),
      controls: [{ field: 'season', kind: 'select', label: '계절', wide: true, options: SEASON_FORM_OPTIONS }],
      section: 'period',
    },
  }),
  field({
    key: 'season_count',
    label: '계절 활동 횟수',
    unit: '회',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 1000,
    step: 1,
    pairedWith: ['season'],
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => (c.season ? `${SEASON_SHORT[c.season] ?? c.season} ${c.season_count}회` : `계절 ${c.season_count}회`),
    detail: (c) => (c.season ? `${SEASON_SHORT[c.season] ?? c.season} ${c.season_count}회` : `계절 ${c.season_count}회`),
    form: integerForm('seasonCount', { section: 'period', label: '계절 활동 횟수', placeholder: '예: 5' }),
  }),
  field({
    key: 'season_count_all',
    label: '계절별 활동 횟수',
    unit: '회',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 1000,
    step: 1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `4계절 각 ${c.season_count_all}회`,
    detail: (c) => `4계절 각 ${c.season_count_all}회`,
    form: integerForm('seasonCountAll', {
      section: 'period',
      label: '계절별 활동 횟수 (회)',
      placeholder: '예: 3',
      wide: true,
      help: '네 계절 각각에서 이 횟수를 채워야 해요.',
    }),
  }),
  field({
    key: 'temperature_min_c',
    label: '기온',
    unit: '°C',
    role: 'measurable',
    input: 'number',
    min: -50,
    max: 60,
    step: 0.1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `≥${c.temperature_min_c}°C`,
    detail: (c) => `최저 기온 ${c.temperature_min_c}°C 이상`,
    form: numberForm('tempMinC', { section: 'environment', label: '최저 기온 조건 (°C 이상 · 폭염)', placeholder: '예: 30' }),
  }),
  field({
    key: 'temperature_max_c',
    label: '기온',
    unit: '°C',
    role: 'measurable',
    input: 'number',
    min: -50,
    max: 60,
    step: 0.1,
    direction: 'lower',
    evaluation: 'engine',
    chip: (c) => `≤${c.temperature_max_c}°C`,
    detail: (c) => `최고 기온 ${c.temperature_max_c}°C 이하`,
    form: numberForm('tempMaxC', { section: 'environment', label: '최고 기온 조건 (°C 이하 · 한파)', placeholder: '예: 0' }),
  }),
  field({
    key: 'time_range',
    label: '활동 시간대',
    unit: null,
    role: 'measurable',
    input: 'time_range',
    direction: null,
    evaluation: 'engine',
    chip: (c) => `${c.time_range!.start}~${c.time_range!.end}`,
    detail: (c) => `시간 ${c.time_range!.start}~${c.time_range!.end}`,
    form: {
      fields: ['timeStart', 'timeEnd'],
      read: (f) =>
        typeof f.timeStart === 'string' && f.timeStart && typeof f.timeEnd === 'string' && f.timeEnd
          ? { start: f.timeStart, end: f.timeEnd }
          : undefined,
      write: (v) => ({ timeStart: v?.start ?? '', timeEnd: v?.end ?? '' }),
      controls: [
        { field: 'timeStart', kind: 'time', label: '활동 시작 시간대 — 시작 (HH:MM)' },
        {
          field: 'timeEnd',
          kind: 'time',
          label: '활동 시작 시간대 — 종료 (HH:MM)',
          help: '자정을 넘겨 설정할 수 있어요(예: 22:00~05:00 심야). 종료 시각이 시작보다 이르면 익일로 봐요.',
        },
      ],
      section: 'environment',
    },
  }),
  field({
    key: 'activity_type',
    label: '종목',
    unit: null,
    role: 'filter',
    input: 'select',
    direction: null,
    evaluation: 'engine',
    // 칩·상세 모두 만들지 않는다 — 종목은 배지의 activity_types 필드로 이미 표시된다.
    // (조건 칩에까지 넣으면 활동 배지 대부분에 중복 칩이 하나씩 더 붙는다)
    form: {
      fields: ['activityType'],
      read: (f) => (typeof f.activityType === 'string' && f.activityType ? (f.activityType as ActivityType) : undefined),
      write: (v) => ({ activityType: v }),
      controls: [
        {
          field: 'activityType',
          kind: 'select',
          label: '활동 종류 (조건)',
          options: ACTIVITY_TYPE_FORM_OPTIONS,
          noneLabel: '— 전체 —',
        },
      ],
      section: 'basic',
    },
  }),
  field({
    key: 'route',
    label: '루트',
    unit: null,
    role: 'filter',
    input: 'text',
    direction: null,
    // ⚠️ 스키마에는 있으나 badge-engine에 필터 구현이 없다(CONDITION_JSON_SPEC §2.1).
    //    그럼에도 통과시킨다 — 이 티켓(20260905_0028)은 «기존 25개 필드의 현행 동작을
    //    한 톨도 바꾸지 않는다»가 전제이고, 현재 카탈로그에 route를 쓰는 배지가 0건이라
    //    당장 오발급은 없다. 사용 시작 전에 평가 구현 또는 `false` 전환이 필요하다.
    evaluation: 'pending',
    chip: (c) => `루트 ${c.route}`,
    detail: (c) => `루트 ${c.route}`,
  }),
  field({
    key: 'poi_id',
    label: '지점',
    unit: null,
    role: 'filter',
    input: 'text',
    direction: null,
    // 엔진 내 평가 불가지만 «모르는 필드»가 아니다 — evaluateConditionDetailed가 전용
    // 분기로 항상 fail 처리하고, GPS 경로 매칭 파이프라인이 별도로 발급한다.
    evaluation: 'external',
    chip: () => '지점 지정',
    detail: () => '지점 지정 (체크인으로 발급)',
  }),
  field({
    key: 'prerequisite_badge_names',
    label: '선행 배지',
    unit: null,
    role: 'filter',
    input: 'text_list',
    direction: null,
    evaluation: 'external',
    chip: (c) => `선행 배지 ${c.prerequisite_badge_names!.length}개`,
    detail: (c) => `선행 배지: ${c.prerequisite_badge_names!.join(', ')}`,
    form: {
      fields: ['prerequisiteNames'],
      read: (f) => {
        const names = csv(f.prerequisiteNames)
        return names.length > 0 ? names : undefined
      },
      write: (v) => ({ prerequisiteNames: Array.isArray(v) ? v.join(', ') : '' }),
      controls: [
        {
          field: 'prerequisiteNames',
          kind: 'text',
          label: '선행 배지 이름 (쉼표 구분)',
          placeholder: '예: 첫 페달, 아스팔트 입문',
          wide: true,
          help: '나열된 배지 중 하나만 보유하면 통과해요(OR). 여러 개를 모두 요구하려면 아래 교차 게이트를 쓰세요.',
        },
      ],
      section: 'gate',
    },
  }),
  field({
    key: 'same_activity',
    label: '단일 활동 충족',
    unit: null,
    role: 'filter',
    input: 'boolean',
    pairedWith: ['distance_km', 'elevation_gain_m'],
    direction: null,
    evaluation: 'engine',
    chip: (c) => (c.same_activity === true ? '단일 활동' : null),
    detail: (c) => (c.same_activity === true ? '한 번의 활동에서 충족' : null),
    form: booleanForm('sameActivity', {
      section: 'basic',
      label: '한 번의 활동에서 충족',
      wide: true,
      help: '거리·고도 조건을 누적이 아니라 활동 1건 안에서 채워야 해요.',
    }),
  }),
  field({
    key: 'mission_reward',
    label: '미션 보상',
    unit: null,
    role: 'meta',
    input: 'boolean',
    direction: null,
    evaluation: 'external',
    chip: (c) => (c.mission_reward === true ? '미션 보상' : null),
    detail: (c) => (c.mission_reward === true ? '미션 완료로만 지급' : null),
    // 전용 UI(별도 색상 박스)를 쓰므로 `controls`를 두지 않는다 — 값 조립·복원만 담당한다.
    form: {
      fields: ['missionReward'],
      read: (f) => (f.missionReward === true ? true : undefined),
      write: () => ({ missionReward: true }),
      section: 'meta',
    },
  }),

  // ── v5 신규 20종 — 선언만 하고 평가는 티켓 20260905_0030 ────────────────
  //
  // 전부 `evaluation: 'pending'`이다. 이 필드가 하나라도 든 조건은 fail-closed로 막히므로
  // «발급되지 않는 것»이 기본값이다. 어드민 조건 빌더 폼도 아직 입력 UI를 주지 않는다
  // (티켓 20260905_0032) — 값이 있으면 `buildConditionJsonFromFields`가 원본 그대로 보존한다.

  // ① 활동 1건의 스칼라 값 — PER_ACTIVITY_KEYS 경로 (7종)
  field({
    key: 'max_elevation_m',
    label: '최고 도달 고도',
    unit: 'm',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 9000,
    step: 10,
    direction: 'higher',
    evaluation: 'pending',
    activityField: 'maxElevationM',
    chip: (c) => `최고 고도 ${c.max_elevation_m}m`,
    detail: (c) => `최고 도달 고도 ${c.max_elevation_m}m 이상`,
    form: numberForm('maxElevationM', { section: 'single', label: '최고 도달 고도 (m)', placeholder: '예: 1200' }),
  }),
  field({
    key: 'max_speed_kmh',
    label: '최고 속도',
    unit: 'km/h',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 120,
    step: 0.1,
    direction: 'higher',
    evaluation: 'pending',
    activityField: 'maxSpeedKmh',
    chip: (c) => `최고 ${c.max_speed_kmh}km/h`,
    detail: (c) => `최고 속도 ${c.max_speed_kmh}km/h 이상`,
    form: numberForm('maxSpeedKmh', { section: 'single', label: '최고 속도 (km/h)', placeholder: '예: 60' }),
  }),
  field({
    key: 'single_distance_km',
    label: '한 번의 거리',
    unit: 'km',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 500,
    step: 0.1,
    direction: 'higher',
    evaluation: 'pending',
    activityField: 'distanceKm',
    chip: (c) => `한 번 ${c.single_distance_km}km`,
    detail: (c) => `한 번의 거리 ${c.single_distance_km}km 이상`,
    form: numberForm('singleDistanceKm', { section: 'single', label: '한 번의 거리 (km)', placeholder: '예: 100' }),
  }),
  field({
    key: 'single_elevation_m',
    label: '한 번의 고도',
    unit: 'm',
    role: 'measurable',
    input: 'number',
    min: 0,
    max: 10000,
    step: 10,
    direction: 'higher',
    evaluation: 'pending',
    activityField: 'elevationGainM',
    chip: (c) => `한 번 고도 ${c.single_elevation_m}m`,
    detail: (c) => `한 번의 고도 ${c.single_elevation_m}m 이상`,
    form: numberForm('singleElevationM', { section: 'single', label: '한 번의 고도 (m)', placeholder: '예: 1000' }),
  }),
  field({
    key: 'avg_heartrate_bpm',
    label: '평균 심박수',
    unit: 'bpm',
    role: 'measurable',
    input: 'integer',
    min: 30,
    max: 250,
    step: 1,
    direction: 'higher',
    evaluation: 'pending',
    activityField: 'avgHeartrateBpm',
    chip: (c) => `심박 ${c.avg_heartrate_bpm}bpm`,
    detail: (c) => `평균 심박수 ${c.avg_heartrate_bpm}bpm 이상`,
    form: integerForm('avgHeartrateBpm', {
      section: 'single',
      label: '평균 심박수 (bpm)',
      placeholder: '예: 150',
      help: '심박계 데이터가 없는 활동은 카운트되지 않아요.',
    }),
  }),
  field({
    key: 'avg_watts',
    label: '평균 파워',
    unit: 'W',
    role: 'measurable',
    input: 'integer',
    min: 0,
    max: 2000,
    step: 1,
    direction: 'higher',
    evaluation: 'pending',
    activityField: 'avgWatts',
    chip: (c) => `파워 ${c.avg_watts}W`,
    detail: (c) => `평균 파워 ${c.avg_watts}W 이상`,
    form: integerForm('avgWatts', {
      section: 'single',
      label: '평균 파워 (W)',
      placeholder: '예: 200',
      help: '파워미터 데이터가 없는 활동은 카운트되지 않아요.',
    }),
  }),
  field({
    key: 'avg_cadence',
    // 단위가 종목마다 다르다(러닝 spm · 자전거 rpm) — 잘못된 단위를 박지 않고 비워 둔다
    label: '평균 케이던스',
    unit: null,
    role: 'measurable',
    input: 'integer',
    min: 0,
    max: 250,
    step: 1,
    direction: 'higher',
    evaluation: 'pending',
    activityField: 'avgCadence',
    chip: (c) => `케이던스 ${c.avg_cadence}`,
    detail: (c) => `평균 케이던스 ${c.avg_cadence} 이상`,
    form: integerForm('avgCadence', {
      section: 'single',
      label: '평균 케이던스',
      placeholder: '예: 90',
      help: '단위가 종목마다 달라요 — 러닝은 spm, 자전거는 rpm.',
    }),
  }),

  // ② 이력 패턴 (13종)
  field({
    key: 'rest_after_streak',
    label: '연속 활동 후 휴식일',
    unit: '일',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 30,
    step: 1,
    // 「며칠 연속 뒤의 휴식인가」는 streak_days가 정한다.
    // v5 B3부터 짝 필드가 **강제된다** — 없으면 fail-closed가 막는다(PAIR_ENFORCED_CONDITION_KEYS)
    pairedWith: ['streak_days'],
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `연속 후 휴식 ${c.rest_after_streak}일`,
    detail: (c) => `연속 활동 후 휴식 ${c.rest_after_streak}일 이상`,
    form: integerForm('restAfterStreak', {
      section: 'pattern',
      label: '연속 활동 후 휴식일 (일)',
      placeholder: '예: 2',
      help: '연속 활동 일수를 함께 지정해야 해요 — 없으면 저장할 수 없어요.',
    }),
  }),
  field({
    key: 'rest_after_long',
    label: '장거리 활동 후 휴식일',
    unit: '일',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 30,
    step: 1,
    // 「무엇을 장거리로 볼 것인가」는 single_distance_km이 정한다(v5 B3부터 강제).
    // ⚠️ 그 짝 필드 자체가 아직 `pending`이라 이 조건은 지금도 fail-closed에 걸린다 —
    //    v5 스칼라 7종을 뒤집는 선행 작업이 끝나야 실제로 발급된다(티켓 20260905_0030 잔여 이슈).
    pairedWith: ['single_distance_km'],
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `장거리 후 휴식 ${c.rest_after_long}일`,
    detail: (c) => `장거리 활동 후 휴식 ${c.rest_after_long}일 이상`,
    form: integerForm('restAfterLong', {
      section: 'pattern',
      label: '장거리 활동 후 휴식일 (일)',
      placeholder: '예: 3',
      help: '한 번의 거리를 함께 지정해야 해요 — 없으면 저장할 수 없어요.',
    }),
  }),
  field({
    key: 'return_gap_days',
    label: '복귀 전 휴식일',
    unit: '일',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 365,
    step: 1,
    direction: 'higher',
    // 활동 선행 요구가 없는 «순수 공백» 조건이다. §4의 「쿨다운 90일」은 **카탈로그 설계
    // 지침**이지 엔진이 강제하는 값이 아니다(2026-09-05 확정) — 하한 준수는 티켓 0035의 몫.
    evaluation: 'engine',
    chip: (c) => `복귀 전 휴식 ${c.return_gap_days}일`,
    detail: (c) => `복귀 전 휴식 ${c.return_gap_days}일 이상`,
    form: integerForm('returnGapDays', { section: 'pattern', label: '복귀 전 휴식일 (일)', placeholder: '예: 90' }),
  }),
  field({
    key: 'interval_days',
    label: '활동 간격',
    unit: '일',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 365,
    step: 1,
    direction: 'higher',
    // return_gap_days와 같은 «순수 공백» 조건 — 90일 하한이 걸린다
    evaluation: 'engine',
    chip: (c) => `간격 ${c.interval_days}일`,
    detail: (c) => `활동 간격 ${c.interval_days}일 이상`,
    form: integerForm('intervalDays', { section: 'pattern', label: '활동 간격 (일)', placeholder: '예: 90' }),
  }),
  field({
    key: 'daily_once_count',
    label: '하루 1회 활동일',
    unit: '일',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 3650,
    step: 1,
    direction: 'higher',
    evaluation: 'pending',
    chip: (c) => `하루 1회 ${c.daily_once_count}일`,
    detail: (c) => `하루 1회만 활동한 날 ${c.daily_once_count}일 이상`,
    form: integerForm('dailyOnceCount', { section: 'pattern', label: '하루 1회 활동일 (일)', placeholder: '예: 30' }),
  }),
  field({
    key: 'negative_split',
    label: '후반 구간 페이스',
    unit: null,
    role: 'filter',
    input: 'boolean',
    pairedWith: ['total_count'],
    direction: null,
    evaluation: 'pending',
    chip: (c) => (c.negative_split === true ? '후반이 더 빠름' : null),
    detail: (c) => (c.negative_split === true ? '후반 구간이 전반보다 빠른 활동' : null),
    form: booleanForm('negativeSplit', {
      section: 'single',
      label: '후반 구간이 전반보다 빠른 활동만',
      wide: true,
      help: '누적 활동 횟수와 함께 써야 뜻이 완성돼요.',
    }),
  }),
  field({
    key: 'weekly_streak',
    // 「주」가 들어가면 예외 없이 (월~일)을 붙인다 (마스터 티켓 20260905_0026 라이팅 규칙)
    label: '연속 주(월~일)',
    unit: '주',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 520,
    step: 1,
    direction: 'higher',
    evaluation: 'pending',
    chip: (c) => `${c.weekly_streak}주 연속`,
    detail: (c) => `${c.weekly_streak}주(월~일) 연속 이상`,
    form: integerForm('weeklyStreak', { section: 'period', label: '연속 주(월~일) 수', placeholder: '예: 12' }),
  }),
  field({
    key: 'distinct_time_bands',
    label: '서로 다른 시간대',
    unit: '개',
    role: 'measurable',
    input: 'integer',
    min: 2,
    max: 6,
    step: 1,
    direction: 'higher',
    evaluation: 'pending',
    chip: (c) => `시간대 ${c.distinct_time_bands}개`,
    detail: (c) => `서로 다른 시간대 ${c.distinct_time_bands}개 이상`,
    form: integerForm('distinctTimeBands', { section: 'environment', label: '서로 다른 시간대 (개)', placeholder: '예: 3' }),
  }),
  field({
    key: 'day_of_month',
    label: '매달 지정일',
    unit: null,
    role: 'filter',
    input: 'integer',
    min: 1,
    max: 31,
    step: 1,
    pairedWith: ['total_count'],
    direction: null,
    evaluation: 'pending',
    chip: (c) => `매달 ${c.day_of_month}일`,
    detail: (c) => `매달 ${c.day_of_month}일`,
    form: integerForm('dayOfMonth', {
      section: 'period',
      label: '매달 지정일 (1~31)',
      placeholder: '예: 1',
      help: '누적 활동 횟수와 함께 써야 뜻이 완성돼요.',
    }),
  }),
  field({
    key: 'activities_within_hours',
    label: '지정 시간 내 활동 횟수',
    unit: '회',
    role: 'measurable',
    input: 'object',
    direction: 'higher',
    evaluation: 'pending',
    chip: (c) => `${c.activities_within_hours!.hours}시간 ${c.activities_within_hours!.count}회`,
    detail: (c) => `${c.activities_within_hours!.hours}시간 안에 ${c.activities_within_hours!.count}회 이상`,
    // 중첩 객체라 폼 state 2개가 한 필드를 이룬다 — 둘 다 있어야 값이 만들어진다
    form: {
      fields: ['activitiesWithinHoursHours', 'activitiesWithinHoursCount'],
      read: (f) => {
        const hours = int(f.activitiesWithinHoursHours)
        const count = int(f.activitiesWithinHoursCount)
        return hours !== undefined && count !== undefined ? { hours, count } : undefined
      },
      write: (v) => ({
        activitiesWithinHoursHours: typeof v?.hours === 'number' ? String(v.hours) : '',
        activitiesWithinHoursCount: typeof v?.count === 'number' ? String(v.count) : '',
      }),
      controls: [
        { field: 'activitiesWithinHoursHours', kind: 'number', label: '기준 시간 (시간)', placeholder: '예: 24' },
        { field: 'activitiesWithinHoursCount', kind: 'number', label: '그 안의 활동 횟수 (회)', placeholder: '예: 3' },
      ],
      section: 'pattern',
    },
  }),
  field({
    key: 'personal_record_break',
    label: '개인 기록 갱신',
    unit: '회',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 100,
    step: 1,
    direction: 'higher',
    evaluation: 'pending',
    chip: (c) => `기록 갱신 ${c.personal_record_break}회`,
    detail: (c) => `개인 기록 갱신 ${c.personal_record_break}회 이상`,
    form: integerForm('personalRecordBreak', { section: 'pattern', label: '개인 기록 갱신 (회)', placeholder: '예: 3' }),
  }),
  field({
    key: 'month_over_month_ratio',
    label: '전월 대비 배수',
    unit: '배',
    role: 'measurable',
    input: 'number',
    min: 1,
    max: 10,
    step: 0.1,
    direction: 'higher',
    evaluation: 'pending',
    chip: (c) => `전월 대비 ${c.month_over_month_ratio}배`,
    detail: (c) => `전월 대비 ${c.month_over_month_ratio}배 이상`,
    form: numberForm('monthOverMonthRatio', { section: 'pattern', label: '전월 대비 배수', placeholder: '예: 1.5' }),
  }),
  field({
    key: 'vs_personal_average',
    label: '평소 평균 대비 배수',
    unit: '배',
    role: 'measurable',
    input: 'number',
    min: 1,
    max: 10,
    step: 0.1,
    direction: 'higher',
    evaluation: 'pending',
    chip: (c) => `평소 대비 ${c.vs_personal_average}배`,
    detail: (c) => `평소 평균 대비 ${c.vs_personal_average}배 이상`,
    form: numberForm('vsPersonalAverage', { section: 'pattern', label: '평소 평균 대비 배수', placeholder: '예: 2' }),
  }),

  // ── ③ 반복 획득 1종 — 평가 구현됨 (티켓 20260905_0030 B1) ───────────────
  //
  // 위 20종과 달리 `evaluation: 'engine'`이다. `evaluateConditionDetailed`가 직접 회차를
  // 세고(`collectRepeatOccurrences`), `index.ts`의 후보 선정이 이 필드로 «반복형»을 가른다.
  field({
    key: 'repeat_count',
    label: '충족 횟수',
    unit: '회',
    role: 'measurable',
    input: 'integer',
    min: 1,
    max: 10000,
    step: 1,
    direction: 'higher',
    evaluation: 'engine',
    chip: (c) => `${c.repeat_count}회 충족`,
    detail: (c) => `기준 조건 ${c.repeat_count}회 충족`,
    form: integerForm('repeatCount', {
      section: 'repeat',
      label: '충족 횟수 (회)',
      placeholder: '예: 5',
      wide: true,
      help: '휴식 조건(연속·장거리 후 휴식, 복귀 전 휴식, 활동 간격)과는 함께 쓸 수 없어요.',
    }),
  }),

  // ── ④ 2단 교차 게이트 3종 — 평가 구현됨 (티켓 20260905_0030 B2, §3) ──────
  //
  // 셋 다 `evaluation: 'external'`이다 — `prerequisite_badge_names`와 **같은 자리**
  // (`index.ts`의 `evaluateBadgeGates()`)에서 같은 방식으로 판정된다. `engine`이
  // 「`evaluateConditionDetailed`가 직접 수치·필터 검사」를 뜻하는 값이므로, 유저 보유
  // 배지를 봐야 하는 이 넷을 그쪽에 넣으면 그 정의가 무너진다(위 ConditionEvaluation 주석).
  // 실질 효과는 동일하다 — fail-closed를 통과하고, 게이트는 엔진이 실제로 본다.
  //
  // `role`은 `filter`다. 게이트는 그 자체로 pass/fail을 만들지 않는다 — 수치 조건이 하나도
  // 없는 배지는 「평가 가능한 조건 없음」으로 여전히 막혀야 한다(084 사고 방어 유지).
  field({
    key: 'cross_in_axis',
    label: '축 내 교차',
    unit: null,
    role: 'filter',
    input: 'object',
    direction: null,
    evaluation: 'external',
    chip: (c) => gateChip('축 내 교차', c.cross_in_axis),
    detail: (c) => gateDetail('축 내 교차', c.cross_in_axis),
    form: gateForm('crossInAxis'),
  }),
  field({
    key: 'cross_between_axis',
    label: '축 간 교차',
    unit: null,
    role: 'filter',
    input: 'object',
    direction: null,
    evaluation: 'external',
    chip: (c) => gateChip('축 간 교차', c.cross_between_axis),
    detail: (c) => gateDetail('축 간 교차', c.cross_between_axis),
    form: gateForm('crossBetweenAxis'),
  }),
  field({
    key: 'gate_mission_badge',
    label: '미션 보상 배지 게이트',
    unit: null,
    role: 'filter',
    input: 'object',
    direction: null,
    evaluation: 'external',
    chip: (c) => gateChip('미션 보상 배지', c.gate_mission_badge),
    detail: (c) => gateDetail('미션 보상 배지', c.gate_mission_badge),
    form: gateForm('gateMissionBadge'),
  }),
] as const

// ── 파생 목록 ────────────────────────────────────────────────────────────

export type ConditionKey = (typeof CONDITION_FIELDS)[number]['key']

/** `condition_json`에 허용되는 전체 키 — DB CHECK 제약·어드민 API 검증이 공유하는 단일 출처 */
export const ALL_CONDITION_KEYS: readonly ConditionKey[] = CONDITION_FIELDS.map((f) => f.key)

/**
 * 엔진이 실제로 «수치 검사»를 수행하는 필드. 이 중 하나도 없는 조건은 어떤 검사 블록에도
 * 걸리지 않아 마지막 `pass: true`로 새어나간다 — `evaluateConditionDetailed`가 이 목록으로
 * 그 경로를 막는다(티켓 20260825_028).
 */
export const MEASURABLE_CONDITION_KEYS: readonly ConditionKey[] = CONDITION_FIELDS.filter(
  (f) => f.role === 'measurable'
).map((f) => f.key)

/** 후보 활동군을 좁히기만 하는 필터 전용 필드 — 단독으로는 pass/fail을 만들지 않는다 */
export const FILTER_ONLY_CONDITION_KEYS: readonly ConditionKey[] = CONDITION_FIELDS.filter(
  (f) => f.role === 'filter'
).map((f) => f.key)

/** 발급 판정에 관여하지 않는 메타데이터 필드 */
export const CONDITION_META_KEYS: readonly ConditionKey[] = CONDITION_FIELDS.filter((f) => f.role === 'meta').map(
  (f) => f.key
)

/** 발급 판정에 실제로 관여하는 «조건 필드» 전체 — 수치 검사 필드 + 필터 전용 필드 */
export const CONDITION_FIELD_KEYS: readonly ConditionKey[] = CONDITION_FIELDS.filter(
  (f) => f.role !== 'meta'
).map((f) => f.key)

/** 평가 주체가 있는 필드 — 엔진이 직접 보거나(engine) 엔진 밖에서 처리하거나(external) */
export const EVALUATED_CONDITION_KEYS: readonly ConditionKey[] = CONDITION_FIELDS.filter(
  (f) => f.evaluation !== 'pending'
).map((f) => f.key)

/** 아직 아무도 평가하지 않는 필드 — 이 키가 든 조건은 fail-closed로 막힌다 */
export const PENDING_CONDITION_KEYS: readonly ConditionKey[] = CONDITION_FIELDS.filter(
  (f) => f.evaluation === 'pending'
).map((f) => f.key)

/**
 * 조건 키 → 같은 단위로 직접 비교되는 `NormalizedActivity` 필드명 (티켓 20260905_0029).
 *
 * 평가 구현(티켓 20260905_0030)이 `a[CONDITION_ACTIVITY_FIELD[key]!]`로 값을 꺼내 쓰면
 * 이름 대응을 다시 적을 필요가 없다. 여기 없는 키는 단위 변환·누적 집계가 필요하다는 뜻이다.
 */
export const CONDITION_ACTIVITY_FIELD: Readonly<
  Partial<Record<ConditionKey, keyof NormalizedActivity>>
> = Object.fromEntries(
  CONDITION_FIELDS.filter((f) => f.activityField !== undefined).map((f) => [f.key, f.activityField])
)

const FIELD_BY_KEY = new Map<string, AnyConditionFieldMeta>(
  CONDITION_FIELDS.map((f) => [f.key as string, f as AnyConditionFieldMeta])
)

export function getConditionField(key: string): AnyConditionFieldMeta | undefined {
  return FIELD_BY_KEY.get(key)
}

// ── 어드민 조건 폼 파생 목록 (티켓 20260905_0032 A-2) ────────────────────

/**
 * 폼 연결이 선언한 **모든** state 키. `ConditionFormFields`가 이 목록을 전부 갖고 있어야 한다 —
 * `form.read`가 받는 값이 `Record<string, string | boolean>`이라 키 오타를 컴파일이 잡지 못하고
 * 그 필드가 조용히 유실된다. 회귀 테스트가 「모든 form.fields 항목이 `emptyFields()`의 키에
 * 존재한다」로 이 대응을 고정한다.
 */
export const ALL_CONDITION_FORM_FIELDS: readonly string[] = CONDITION_FIELDS.flatMap(
  (f) => (f.form?.fields ?? []) as readonly string[]
)

/** 어드민 폼이 실제로 그리는 입력 1개 — 컨트롤과 그 소유 필드 메타를 함께 넘긴다 */
export type ConditionFormEntry = {
  meta: AnyConditionFieldMeta
  control: ConditionFormControl
  section: ConditionFormSection
}

/**
 * 조건 폼이 그릴 입력 목록. **선언 순서가 곧 화면 순서다**(칩·상세 목록과 같은 규칙).
 * `controls`가 없는 필드(미션 보상·교차 게이트 3종)는 전용 UI가 따로 그리므로 빠진다.
 */
export const CONDITION_FORM_ENTRIES: readonly ConditionFormEntry[] = CONDITION_FIELDS.flatMap((f) => {
  const meta = f as AnyConditionFieldMeta
  if (!meta.form?.controls) return []
  return meta.form.controls.map((control) => ({ meta, control, section: meta.form!.section }))
})

/** 입력이 하나라도 있는 섹션만, 선언 순서대로 */
export const CONDITION_FORM_SECTIONS_IN_USE: readonly ConditionFormSection[] = CONDITION_FORM_SECTIONS.filter(
  (s) => CONDITION_FORM_ENTRIES.some((e) => e.section === s)
)

// ── fail-closed 판정 ─────────────────────────────────────────────────────

export type BlockingConditionKeys = {
  /** 레지스트리에 아예 없는 키 (오탈자·수기 편집 사고) */
  unknown: string[]
  /** 레지스트리에는 있으나 아직 엔진이 평가하지 않는 키 */
  pending: string[]
  /**
   * 짝 필드(`pairedWith`)가 하나도 없어 **뜻이 완성되지 않는** 키
   * (v5 B3, 티켓 20260905_0030 §4).
   *
   * `rest_after_streak`는 `streak_days`가 없으면 「며칠 연속 뒤인가」가, `rest_after_long`은
   * `single_distance_km`이 없으면 「무엇이 장거리인가」가 정의되지 않는다. 값 자체는 유효하고
   * CHECK 제약도 키 이름만 보므로 **짝 없이 저장돼도 통과하고, 평가 시점에 조용한 오판정이
   * 된다.** 그래서 fail-closed의 세 번째 종류로 넣었다.
   */
  unpaired: string[]
}

/**
 * 짝 필드를 **기계적으로 강제하는** 키 — v5 B3 신규 4종에 한정한다.
 *
 * 기존 필드(`same_activity`↔`distance_km` 등)는 카탈로그에 실적이 있어 즉시 강제하면
 * 이미 발급된 배지가 미발급으로 뒤집힐 수 있다(선행 티켓 20260905_0028이 못 박은 경계).
 * 새로 평가가 열리는 필드만 처음부터 강제한다 — 실적이 0건이라 회귀가 없다.
 */
export const PAIR_ENFORCED_CONDITION_KEYS: readonly ConditionKey[] = [
  'rest_after_streak',
  'rest_after_long',
  'return_gap_days',
  'interval_days',
]

/**
 * 조건에 «평가할 수 없는 키»가 있는지 찾는다.
 *
 * 하나라도 있으면 `evaluateConditionDetailed`는 조건 평가를 시작하지 않고 fail한다.
 * 이유: `matchesPerActivityCondition()`이 모르는 키를 조용히 건너뛰고 `return true` 하므로,
 * 막지 않으면 미구현 필드가 «무조건 발급»로 뒤집힌다(티켓 20260905_0028).
 */
export function findBlockingConditionKeys(
  condition: BadgeCondition | null | undefined,
  /**
   * 레지스트리에 없어도 허용할 키. **미션 평가 경로 전용이다** —
   * `missions/checker.ts`가 같은 함수에 `MissionCondition`을 캐스팅해 넘기는데 그 어휘에는
   * `count`·`badge_id`처럼 배지 조건에 없는 키가 있다. 이걸 열어 두지 않으면 fail-closed가
   * 「알 수 없는 필드」로 판정해 **미션이 영구 미달성**이 된다(게이트 리뷰 지적).
   * `pending` 판정에는 영향을 주지 않는다 — 평가 구현이 없는 건 미션에서도 마찬가지다.
   */
  extraAllowedKeys?: ReadonlySet<string>
): BlockingConditionKeys {
  const result: BlockingConditionKeys = { unknown: [], pending: [], unpaired: [] }
  if (!condition) return result
  for (const [key, value] of Object.entries(condition)) {
    if (value === undefined) continue
    const meta = FIELD_BY_KEY.get(key)
    if (!meta) {
      if (!extraAllowedKeys?.has(key)) result.unknown.push(key)
      continue
    }
    if (meta.evaluation === 'pending') {
      result.pending.push(key)
      continue
    }
    // 짝 필드 강제 — 대상 키에 한정한다(PAIR_ENFORCED_CONDITION_KEYS 주석 참조).
    // `pairedWith`가 여럿이면 **하나라도 있으면 통과**다(OR) — `same_activity`가
    // `distance_km`/`elevation_gain_m` 중 하나만 있어도 뜻이 완성되는 형태를 따른다.
    if (
      PAIR_ENFORCED_CONDITION_KEYS.includes(meta.key) &&
      meta.pairedWith &&
      meta.pairedWith.length > 0 &&
      !meta.pairedWith.some((p) => (condition as Record<string, unknown>)[p as string] !== undefined)
    ) {
      result.unpaired.push(key)
    }
  }
  return result
}

/** 조건 평가를 시작할 수 없는가 — 세 종류 중 하나라도 있으면 true */
export function hasBlockingConditionKeys(blocking: BlockingConditionKeys): boolean {
  return blocking.unknown.length > 0 || blocking.pending.length > 0 || blocking.unpaired.length > 0
}

/** fail-closed 사유 문자열. 어드민 시뮬레이터·엔진 로그에 그대로 노출된다 */
export function describeBlockingConditionKeys(blocking: BlockingConditionKeys): string {
  const segments: string[] = []
  if (blocking.unknown.length > 0) segments.push(`알 수 없는 필드: ${blocking.unknown.join(', ')}`)
  if (blocking.pending.length > 0) {
    const labeled = blocking.pending.map((k) => `${getConditionField(k)?.label ?? k}(${k})`)
    segments.push(`평가 구현 대기: ${labeled.join(', ')}`)
  }
  if (blocking.unpaired.length > 0) {
    const labeled = blocking.unpaired.map((k) => {
      const meta = getConditionField(k)
      return `${meta?.label ?? k}(${k}) ← ${(meta?.pairedWith ?? []).join(' 또는 ')}`
    })
    segments.push(`짝 필드 없음: ${labeled.join(', ')}`)
  }
  return `평가할 수 없는 조건 필드 — ${segments.join(' / ')}`
}

// ── 표시 함수 (어드민) ───────────────────────────────────────────────────

/**
 * 필드 하나의 표시 문구를 만든다. **한 필드의 실패가 목록 전체를 죽이지 않게 격리한다.**
 *
 * `condition_json`은 jsonb라 형태 보장이 없는데, 객체형 필드의 chip/detail은
 * `c.activities_within_hours!.hours`처럼 내부를 판다. 시딩(티켓 20260905_0035) 550종 중
 * 한 행이 스칼라로 들어오면 TypeError가 나고, 이 함수는 어드민 목록의 TanStack `cell` 안에서
 * 행마다 호출되므로 **목록 전체가 빈 화면**이 된다(개선 리뷰 지적).
 * 실패한 필드만 «형태 오류» 표시로 대체하고 나머지는 그대로 그린다.
 */
function safeFormat(
  meta: AnyConditionFieldMeta,
  render: ((c: BadgeCondition) => string | null) | undefined,
  condition: BadgeCondition
): string | null {
  if (!render) return null
  let text: string | null
  try {
    text = render(condition)
  } catch {
    // 형태가 아예 어긋나 접근 자체가 터진 경우 — 예: `null.hours`, 문자열에 `.join()`
    return `${meta.label}: 형태 오류`
  }
  if (text == null) return null
  // 예외가 나지 않아도 값은 깨질 수 있다. `(3).hours`는 던지지 않고 `undefined`를 돌려주므로
  // 그대로 두면 「undefined시간 undefined회」가 화면에 찍힌다 — 던지는 경우보다 흔하다.
  if (text.includes('undefined') || text.includes('NaN')) return `${meta.label}: 형태 오류`
  return text
}

/** 어드민 목록의 압축 칩 목록. 선언 순서를 그대로 따른다 */
export function formatConditionChips(condition: BadgeCondition | null | undefined): string[] {
  if (!condition) return []
  const chips: string[] = []
  for (const meta of CONDITION_FIELDS) {
    if (condition[meta.key] === undefined) continue
    const text = safeFormat(meta, meta.chip, condition)
    if (text) chips.push(text)
  }
  return chips
}

/** 어드민 상세의 조건 줄 목록. 선언 순서를 그대로 따른다 */
export function formatConditionDetail(condition: BadgeCondition | null | undefined): string[] {
  if (!condition) return []
  const parts: string[] = []
  for (const meta of CONDITION_FIELDS) {
    if (condition[meta.key] === undefined) continue
    const text = safeFormat(meta, meta.detail, condition)
    if (text) parts.push(text)
  }
  return parts
}

// ── 컴파일 타임 동기화 체크 ──────────────────────────────────────────────
// `BadgeCondition`(src/types/database.ts)에 필드가 추가/변경됐는데 위 선언 반영을 빠뜨리면
// 여기서 컴파일 에러로 즉시 드러난다 — 084 사고(«아무도 검증하지 않는 필드가 조용히 발급
// 판정을 뒤집는다»)의 재발을 구조적으로 막는 핵심 장치.
type AssertNever<T extends never> = T
type MissingFromRegistry = Exclude<keyof BadgeCondition, ConditionKey>
/** 레지스트리가 `BadgeCondition`의 모든 필드를 커버하지 못하면 이 타입에서 컴파일 에러가 난다 */
export type AssertAllConditionKeysCovered = AssertNever<MissingFromRegistry>
