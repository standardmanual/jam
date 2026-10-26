/**
 * 밸런스 서브 대시보드의 목표, 최소 표본, 관찰 기간, 이동 칸 (티켓 20261022_1136 1회 a, 운영 로직 19.2절)
 *
 * **바꾸고 싶은 값은 이 파일 한 곳만 고친다.** 목표 수치는 시뮬레이터 실측이 없는 가정이고(가입자 8명), 정식 오픈 뒤 실제 데이터로 다시 맞춘다
 * ([게이미피케이션 밸런스] 9절). 걷기, 자전거, 등산은 실측이 거의 없어 기준 유저(러닝 보통)의 통념 값이다.
 *
 * ## 이 계획이 가정한 값 (티켓 «공통 규칙(제안)»)
 *
 * - 최소 표본은 5명이고, 비율을 내는 지표 2·5·6은 20명이다. 등급 체감(지표 4)은 대상 5명에 더해 «기대 건수 5건»을 기준으로 노출량(유저-주, 유저-월)을 요구한다.
 * - 비율형 지표의 목표 «과반이면 충족»(0.5 이상)은 티켓이 지표 2에만 적었고 지표 5에도 같은 틀을 쓴다.
 * - 지표 6의 «여유가 남아 있는 상태»는 가득 찬 유저 20% 미만으로 제안된 값이다. «가득 참»은 남은 칸 3 이하다(마이그레이션 237 알림 기준).
 * - 등급 체감의 관찰 기간(12주)과 한 달의 길이(30일)는 티켓에 없어 정한 값이다.
 *
 * 이동 칸(`ADJUST`)의 키는 밸런스 설정 구역 연결(`lib/admin/balance/*.ts`)의 칸 키와 같아야 한다. 서버 전용 모듈을 끌어오지 않으려고 문자열로 적고,
 * `__tests__/targets.test.ts`가 실제 칸 정의에 있는지 대조한다.
 *
 * 순수 모듈이다. 서버 모듈을 값으로 가져오지 않는다.
 */
import type { AdjustTarget, BalanceMetricKey, MetricPartSpec, MetricSpec } from './types'

/** 값을 내는 데 필요한 최소 표본(유저 수) */
export const MIN_SAMPLE_USERS = 5
/** 비율을 내는 지표(2·5·6)의 최소 표본(유저 수) */
export const MIN_RATIO_SAMPLE_USERS = 20
/** 등급 체감: 목표 속도대로면 관찰 기간 안에 이만큼은 나와야 값을 낸다(기대 건수) */
export const MIN_EXPECTED_COUNT = 5

/** 한 달의 길이(일). 유저-월과 지표 3의 관찰 구간이 같은 길이를 쓴다 */
export const MONTH_DAYS = 30

/** 지표 1: 완결 주 몇 개를 보나 */
export const CAPSULE_WINDOW_WEEKS = 4
/** 지표 1: 챕터 번호 범위(밸런스 설정 캡슐 구역의 `chapter:1`~`chapter:10`) */
export const CAPSULE_CHAPTER_NUMBERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/** 지표 2: 챕터 1에 오른 뒤 며칠 안에 해당 챕터에 올랐나 */
export const REACH_HORIZONS: readonly { chapterNo: number; days: number }[] = [
  { chapterNo: 5, days: 90 },
  { chapterNo: 10, days: 365 },
]

/** 지표 3: 최근 며칠을 세나, 유저가 최소 며칠은 관찰돼야 표본으로 세나 */
export const MONTHLY_WINDOW_DAYS = 30
export const MONTHLY_MIN_OBSERVED_DAYS = 28

/** 지표 4: 완결 주 몇 개를 보나 */
export const RARITY_WINDOW_WEEKS = 12
/** 지표 4: 센 등급 */
export const RARITY_KEYS = ['rare', 'epic', 'mystic'] as const
export type RarityKey = (typeof RARITY_KEYS)[number]

/** 지표 5: 챕터 1에 오른 뒤 며칠 안에 완성했나 */
export const COLLECTION_HORIZON_DAYS = { first: 60, tribe: 365 } as const

/** 지표 6: 남은 칸이 이 값 이하면 «거의 가득 참»이다(마이그레이션 237 알림 기준: 남은 칸 3 이하) */
export const INVENTORY_LOW_FREE_SLOTS = 3

/** 등급 체감 목표 속도(유저 한 명 기준). Mystic 「서너 달에 1번」은 0.25~0.333번/달이다. */
const RARE_PER_WEEK = { low: 1, high: 1 }
const EPIC_PER_MONTH = { low: 1, high: 1 }
const MYSTIC_PER_MONTH = { low: 1 / 4, high: 1 / 3 }

/**
 * 등급별로 값을 내는 데 필요한 노출량. 기대 건수 `MIN_EXPECTED_COUNT`를 목표 속도로 나눈 값을 올림한 것이다
 * (Rare 5유저-주, Epic 5유저-월, Mystic 18유저-월). 시험이 이 식과 맞는지 대조한다.
 */
export const RARITY_MIN_EXPOSURE = { rare: 5, epic: 5, mystic: 18 } as const

/** 목표 속도의 중간값(번/단위). 최소 노출량을 식으로 검산할 때 쓴다 */
export function targetRate(rarity: RarityKey): number {
  const target = rarity === 'rare' ? RARE_PER_WEEK : rarity === 'epic' ? EPIC_PER_MONTH : MYSTIC_PER_MONTH
  return (target.low + target.high) / 2
}

const RATIO_TARGET = { low: 0.5, high: 1 }

const CAPSULE_PARTS: readonly MetricPartSpec[] = CAPSULE_CHAPTER_NUMBERS.map((chapterNo) => ({
  id: `chapter:${chapterNo}`,
  label: `챕터 ${chapterNo}`,
  unit: 'per_week' as const,
  sampleUnit: 'user' as const,
  minSample: MIN_SAMPLE_USERS,
  target:
    chapterNo === 1
      ? { low: 2, high: 3, text: '주 2~3번' }
      : chapterNo === 10
        ? { low: 1, high: 1, text: '주 1번' }
        : null,
}))

const REACH_PARTS: readonly MetricPartSpec[] = REACH_HORIZONS.map(({ chapterNo }) => ({
  id: `chapter:${chapterNo}`,
  label: `챕터 ${chapterNo}까지`,
  unit: 'ratio' as const,
  sampleUnit: 'user' as const,
  minSample: MIN_RATIO_SAMPLE_USERS,
  target: { ...RATIO_TARGET, text: chapterNo === 5 ? '3개월쯤 (과반이 도달하면 충족)' : '1년쯤 (과반이 도달하면 충족)' },
}))

/** 지표 4의 칸 정의. 노출량 단위는 Rare가 유저-주, 나머지가 유저-월이다 */
const RARITY_PARTS: readonly MetricPartSpec[] = [
  {
    id: 'rare',
    label: 'Rare',
    unit: 'per_week',
    sampleUnit: 'user_week',
    minSample: RARITY_MIN_EXPOSURE.rare,
    target: { ...RARE_PER_WEEK, text: '주 1번' },
  },
  {
    id: 'epic',
    label: 'Epic',
    unit: 'per_month',
    sampleUnit: 'user_month',
    minSample: RARITY_MIN_EXPOSURE.epic,
    target: { ...EPIC_PER_MONTH, text: '한 달 1번' },
  },
  {
    id: 'mystic',
    label: 'Mystic',
    unit: 'per_month',
    sampleUnit: 'user_month',
    minSample: RARITY_MIN_EXPOSURE.mystic,
    target: { ...MYSTIC_PER_MONTH, text: '서너 달 1번' },
  },
]

/** 이동 칸. 구역 키와 칸 키는 밸런스 설정 구역 연결의 정의와 같다(시험이 대조한다) */
const ADJUST: Record<BalanceMetricKey, AdjustTarget> = {
  capsule_open: { sectionId: 'capsule', fieldKeys: CAPSULE_CHAPTER_NUMBERS.map((chapterNo) => `chapter:${chapterNo}`) },
  chapter_reach: {
    sectionId: 'chapter',
    fieldKeys: [2, 3, 4, 5, 6, 7, 8, 9, 10].map((chapterNo) => `required:${chapterNo}`),
  },
  monthly_items: { sectionId: 'sync', fieldKeys: ['sync_item_guaranteed'] },
  rarity_feel: {
    sectionId: 'sync',
    fieldKeys: ['sync_rarity_common', 'sync_rarity_rare', 'sync_rarity_epic', 'sync_rarity_mystic'],
  },
  collection_complete: { sectionId: 'collection', fieldKeys: ['tier_up_probability'] },
  inventory_full: { sectionId: 'inventory', fieldKeys: ['max_slots'] },
}

/** 지표 6개의 정의. 키 순서는 `BALANCE_METRIC_KEYS`와 같다 */
export const METRIC_SPECS: Readonly<Record<BalanceMetricKey, MetricSpec>> = {
  capsule_open: { key: 'capsule_open', title: '캡슐을 여는 속도', parts: CAPSULE_PARTS, adjust: ADJUST.capsule_open },
  chapter_reach: { key: 'chapter_reach', title: '챕터 도달 속도', parts: REACH_PARTS, adjust: ADJUST.chapter_reach },
  monthly_items: {
    key: 'monthly_items',
    title: '한 달에 받는 아이템 배지',
    parts: [
      {
        id: 'monthly',
        label: '최근 30일',
        unit: 'count_30d',
        sampleUnit: 'user',
        minSample: MIN_SAMPLE_USERS,
        target: { low: 20, high: 30, text: '20~30개' },
      },
    ],
    adjust: ADJUST.monthly_items,
  },
  rarity_feel: { key: 'rarity_feel', title: '등급 체감', parts: RARITY_PARTS, adjust: ADJUST.rarity_feel },
  collection_complete: {
    key: 'collection_complete',
    title: '컬렉션 완성 속도',
    parts: [
      {
        id: 'first',
        label: '첫 컬렉션',
        unit: 'ratio',
        sampleUnit: 'user',
        minSample: MIN_RATIO_SAMPLE_USERS,
        target: { ...RATIO_TARGET, text: '1~2달 (과반이 완성하면 충족)' },
      },
      {
        id: 'tribe',
        label: '소속 트라이브 전체',
        unit: 'ratio',
        sampleUnit: 'user',
        minSample: MIN_RATIO_SAMPLE_USERS,
        target: { ...RATIO_TARGET, text: '1년쯤 (과반이 완성하면 충족)' },
      },
    ],
    adjust: ADJUST.collection_complete,
  },
  inventory_full: {
    key: 'inventory_full',
    title: '인벤토리가 거의 가득 찬 유저의 비율',
    parts: [
      {
        id: 'full',
        label: '남은 칸 3 이하',
        unit: 'ratio',
        sampleUnit: 'user',
        minSample: MIN_RATIO_SAMPLE_USERS,
        target: { low: 0, high: 0.2, text: '여유가 남아 있는 상태 (20% 미만)' },
      },
    ],
    adjust: ADJUST.inventory_full,
  },
}

/** 칸 정의를 찾는다. 없으면 코드 오류라 던진다 */
export function partSpec(key: BalanceMetricKey, partId: string): MetricPartSpec {
  const spec = METRIC_SPECS[key].parts.find((part) => part.id === partId)
  if (!spec) throw new Error(`[balance-dashboard] 지표 ${key}에 칸 ${partId} 정의가 없어요`)
  return spec
}
