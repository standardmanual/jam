/**
 * 생태계 상황판의 마디·이음선·목표 정책 연결과 상수 (티켓 20261026_2027 2회차, PRD admin-boards §7)
 *
 * **마디 정의와 아래 상수는 이 파일 한 곳이 단일 원천이다.** PRD에는 상수 이름과 의미만 적는다.
 *
 * 순수 모듈이다. 서버 모듈을 값으로 가져오지 않는다.
 */
import type { BalanceMetricKey } from '@/lib/admin/balanceDashboard/types'
import type { EcosystemLoop, EcosystemNodeId } from './types'

export interface EcosystemNodeDef {
  id: EcosystemNodeId
  label: string
  loop: EcosystemLoop
  /** 순환 안의 순서(0부터). 필드 순환은 시스템 드랍·유저 드랍이 같은 줄(0)에 선다 */
  order: number
}

/** 마디 10개. 배열 순서가 `EcosystemSnapshot.nodes`의 순서다 */
export const ECOSYSTEM_NODES: readonly EcosystemNodeDef[] = [
  { id: 'sync', label: '활동 동기화', loop: 'growth', order: 0 },
  { id: 'jam', label: '잼', loop: 'growth', order: 1 },
  { id: 'capsule', label: '캡슐', loop: 'growth', order: 2 },
  { id: 'item_badge', label: '아이템 배지', loop: 'growth', order: 3 },
  { id: 'inventory', label: '인벤토리', loop: 'growth', order: 4 },
  { id: 'collection', label: '컬렉션', loop: 'growth', order: 5 },
  { id: 'system_drop', label: '시스템 드랍', loop: 'field', order: 0 },
  { id: 'user_drop', label: '유저 드랍', loop: 'field', order: 0 },
  { id: 'checkin_point', label: '지점', loop: 'field', order: 1 },
  { id: 'pickup', label: '픽업', loop: 'field', order: 2 },
]

/**
 * 이음선(from → to). 성장 순환은 한 줄로 이어지고, 필드 순환은 두 드랍이 지점으로 모였다가 픽업을 거쳐 인벤토리로 들어간다.
 * `pickup → inventory`가 두 순환이 만나는 곳이다.
 */
export const ECOSYSTEM_EDGES: readonly { from: EcosystemNodeId; to: EcosystemNodeId }[] = [
  { from: 'sync', to: 'jam' },
  { from: 'jam', to: 'capsule' },
  { from: 'capsule', to: 'item_badge' },
  { from: 'item_badge', to: 'inventory' },
  { from: 'inventory', to: 'collection' },
  { from: 'system_drop', to: 'checkin_point' },
  { from: 'user_drop', to: 'checkin_point' },
  { from: 'checkin_point', to: 'pickup' },
  { from: 'pickup', to: 'inventory' },
]

/** 밸런스 목표 정책 하나와 그 정책이 가리키는 밸런스 지표 키. 챕터 도달 속도는 마디가 없어 목표 대비 칸에만 보인다 */
export const GOAL_POLICY_LINKS: readonly { policyId: string; metricKeys: readonly BalanceMetricKey[] }[] = [
  { policyId: 'ch19-kpi-capsule-speed', metricKeys: ['capsule_open'] },
  { policyId: 'ch19-kpi-chapter-reach', metricKeys: ['chapter_reach'] },
  { policyId: 'ch19-kpi-item-badges-monthly', metricKeys: ['monthly_items', 'rarity_feel'] },
  { policyId: 'ch19-kpi-collection-speed', metricKeys: ['collection_complete'] },
  { policyId: 'ch19-kpi-inventory-full', metricKeys: ['inventory_full'] },
]

/** 밸런스 지표를 대표 지표로 쓰는 마디와 그 지표 키(순서가 대표 칸을 고르는 동순위 순서다) */
export const BALANCE_NODE_METRICS: Readonly<Partial<Record<EcosystemNodeId, readonly BalanceMetricKey[]>>> = {
  capsule: ['capsule_open'],
  item_badge: ['monthly_items', 'rarity_feel'],
  inventory: ['inventory_full'],
  collection: ['collection_complete'],
}

/**
 * 필드 지표(활동 동기화·잼·드랍·픽업)를 세는 기간(일). 지금부터 `FIELD_WINDOW_DAYS × 24시간` 전까지의 롤링 구간이다
 * (`kpiWeekly.ts`의 `resolveKpiWeeklyRange` 기본값 7일과 같은 정의라 주간 핵심 지표와 값이 맞는다).
 */
export const FIELD_WINDOW_DAYS = 7

/**
 * 목표 밖인 칸을 «주의»에서 «중단»으로 올리는 기준. 목표 한계(가까운 쪽 끝)에서 벗어난 폭이 그 한계값의 이 비율 이상이면 «중단»이다.
 * **가정 값이다.** 목표 수치 자체가 시뮬레이터 실측이 없는 가정이라(`balanceDashboard/targets.ts`) 같은 태도로 두고,
 * 오픈 뒤 실제 데이터로 맞춘다. 바꾸려면 이 한 곳만 고친다.
 */
export const STOP_DEVIATION_RATIO = 0.5

/** 마디가 보이는 기간 글자. 계산식의 기간과 같다 */
export const NODE_PERIOD_TEXT: Readonly<Record<EcosystemNodeId, string>> = {
  sync: '최근 7일',
  jam: '최근 7일',
  capsule: '완결 4주',
  item_badge: '최근 30일 (등급은 완결 12주)',
  inventory: '지금',
  collection: '챕터 1 이후 60일·365일',
  system_drop: '최근 7일',
  user_drop: '최근 7일',
  checkin_point: '지금',
  pickup: '최근 7일',
}
