/**
 * 밸런스 서브 대시보드의 타입 (티켓 20261022_1136 1회 a, 운영 로직 19.2절)
 *
 * 이 파일은 타입만 있다. 읽기(`load.ts`)와 계산(`compute.ts`)과 화면(1회 b)이 같은 모양을 쓴다.
 *
 * ## 「부족」은 숫자가 아니라 상태다
 *
 * 표본이 모자라거나 관찰 기간이 모자라면 측정값(`Measurement`)은 `insufficient` 상태를 돌려주고 `value`라는 칸 자체를 갖지 않는다.
 * 0이나 100%를 넣어 돌려주면 화면이 «0개 받았다», «전원 가득 찼다»로 읽히기 때문이다. 관찰이 충분한데 실제로 0건인 것은 `ready`의 `value: 0`이다.
 */

/** 지표 6개의 키. 순서가 운영 로직 19.2절 표의 순서다. */
export const BALANCE_METRIC_KEYS = [
  'capsule_open',
  'chapter_reach',
  'monthly_items',
  'rarity_feel',
  'collection_complete',
  'inventory_full',
] as const

export type BalanceMetricKey = (typeof BALANCE_METRIC_KEYS)[number]

/** 표본을 세는 단위. 등급 체감(지표 4)만 유저-주, 유저-월로 센다. */
export type SampleUnit = 'user' | 'user_week' | 'user_month'

/** 측정값의 단위. */
export type ValueUnit =
  /** 유저 한 명이 한 주에 한 횟수 */
  | 'per_week'
  /** 유저 한 명이 한 달(30일)에 한 횟수 */
  | 'per_month'
  /** 유저 한 명이 최근 30일에 받은 개수 */
  | 'count_30d'
  /** 0~1 비율 */
  | 'ratio'

/**
 * 「부족」의 이유.
 * - `sample`: 대상 유저가 모자란다.
 * - `period`: 대상 유저는 있지만 관찰 기간이 모자라 표본으로 세지 못한다.
 */
export type InsufficientReason = 'sample' | 'period'

export interface ReadyMeasurement {
  status: 'ready'
  value: number
  sample: number
  sampleUnit: SampleUnit
}

export interface InsufficientMeasurement {
  status: 'insufficient'
  reason: InsufficientReason
  /** 지금 센 표본 */
  sample: number
  /** 값을 내려면 필요한 표본 */
  minSample: number
  sampleUnit: SampleUnit
}

export type Measurement = ReadyMeasurement | InsufficientMeasurement

/** 지표 안의 측정 하나(챕터 1의 열기 속도, Rare 등급 체감 등). `id`는 `targets.ts`의 칸 정의 `id`와 같다. */
export interface MetricPart {
  id: string
  measurement: Measurement
}

export type MetricResult =
  | { key: BalanceMetricKey; status: 'ok'; parts: readonly MetricPart[] }
  /** 읽기에 실패한 지표. 부족과 다르게 «읽지 못함»을 알려야 하므로 따로 둔다. 문장은 고정 문장이고 DB 오류 원문을 싣지 않는다. */
  | { key: BalanceMetricKey; status: 'error'; message: string }

export interface BalanceDashboardData {
  /** 계산 기준 시각(ISO) */
  generatedAt: string
  /** `BALANCE_METRIC_KEYS` 순서의 지표 6개 */
  metrics: readonly MetricResult[]
}

/** 목표. 한 점이면 `low`와 `high`가 같다. `text`는 화면에 그대로 보이는 문장이다. */
export interface PartTarget {
  low: number
  high: number
  text: string
}

export interface MetricPartSpec {
  id: string
  label: string
  unit: ValueUnit
  sampleUnit: SampleUnit
  /** 값을 내는 데 필요한 최소 표본(`sampleUnit` 단위) */
  minSample: number
  /** 목표가 없는 칸(챕터 2~9의 열기 속도)은 `null` */
  target: PartTarget | null
}

/**
 * 문제가 되는 수치를 바로 고치러 가는 곳 하나. `BALANCE_SECTIONS`의 구역 키와 그 구역의 칸 키다.
 * 화면 링크는 구역 단위(`/admin/balance#<구역 키>`)이고 칸 키는 어느 칸을 고치라는 안내와 시험 대조에 쓴다.
 */
export interface AdjustTarget {
  sectionId: string
  fieldKeys: readonly string[]
}

export interface MetricSpec {
  key: BalanceMetricKey
  title: string
  parts: readonly MetricPartSpec[]
  /** 지표를 움직이는 수치가 여러 구역에 나뉘면 구역마다 하나씩 둔다(월 아이템 배지는 동기화와 캡슐의 합이다). 비어 있지 않다 */
  adjust: readonly AdjustTarget[]
}

/** 읽어 온 행. 계산이 쓰는 칸만 담는다. 관리자 ID(`*_by`)와 이메일은 읽지 않는다. */
export interface UserRow {
  id: string
  is_admin: boolean
  tribe_id: string | null
}

export interface ChapterUpRow {
  user_id: string
  chapter_no: number
  reached_at: string
}

export interface SuspensionRow {
  user_id: string
  suspended_at: string
  lifted_at: string | null
}

export interface CapsuleOpenRow {
  user_id: string
  opened_at: string
}

export interface ItemIssueRow {
  user_id: string
  rarity: string | null
  created_at: string
}

export interface TierCompletionRow {
  user_id: string
  item_book_id: string
  completed_at: string
}

export interface ItemBookRow {
  id: string
  tribe_id: string | null
}

export interface InventoryRow {
  user_id: string
  max_slots: number
  used_slots: number
}
