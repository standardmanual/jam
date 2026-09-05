/**
 * 배지 목록 화면의 «정렬·조건 필드 필터» 순수 규칙 (티켓 20260905_0032 C-2)
 *
 * ## 왜 필요한가
 * 목록 정렬이 최신순·이름순 4종뿐이라 **계열·레벨 축이 없다.** v5는 164계열 550종이라
 * 계열을 눈으로 훑을 수단이 필요하고, 「`avg_watts`를 쓰는 배지만」처럼 조건 필드로 좁히는
 * 필터도 없다.
 *
 * ## 여기 두는 것 / 두지 않는 것
 * React·Supabase에 의존하지 않는 «비교와 판정»만 둔다. 서버 컴포넌트(`app/admin/badges/page.tsx`)와
 * 클라이언트 필터 바(`BadgesFilterBar.tsx`)가 **같은 목록·같은 비교 함수**를 쓴다.
 *
 * ## ⚠️ `sort_order = 0`은 맨 뒤다
 * 저장소의 다른 `sort_order`(`today_cards`·`factions`·`item_books`)는 0이 앞이라는 **반대
 * 관습**이라, 습관대로 오름차순 정렬하면 배지 트리·계열 관리 화면과 순서가 갈린다.
 * 규칙을 다시 선언하지 않고 `badgeTree.ts`의 `sortRank`를 그대로 쓴다(B묶음이 export해 뒀다).
 *
 * ## 조건 필드 목록의 단일 출처는 레지스트리다
 * 필터 선택지를 손으로 나열하지 않는다 — `conditionRegistry.ts`의 선언에서 파생하므로
 * 새 조건 필드를 추가하면 필터에 자동으로 나타난다.
 */
import type { BadgeRarity } from '@/types/database'
import { familyKeyOf } from '@/lib/badge-engine/badgeKind'
import {
  CONDITION_FIELD_KEYS,
  getConditionField,
  type ConditionKey,
} from '@/lib/badge-engine/conditionRegistry'
// 「0은 맨 뒤」·종목 탭 순서는 배지 트리와 같은 규칙을 써야 한다 — 다시 선언하지 않는다.
import { sortRank, TREE_ACTIVITY_ORDER } from '@/lib/badgeTree'
import { familySlotRank } from './badge-families'

// ── 정렬 ────────────────────────────────────────────────────────────────────

/**
 * 목록 정렬 값. `family_asc`·`level_asc`가 이번에 추가된 축이다.
 *
 * 앞의 넷은 DB(`created_at`·`name`)가 직접 정렬할 수 있지만, 뒤의 둘은 «0은 맨 뒤» 규칙과
 * 계열 그룹핑(`family_key` 폴백 포함)이 들어가 PostgREST `.order()`로 표현할 수 없다 —
 * `requiresFullFetchSort()`가 그 둘을 가려낸다.
 */
export const BADGE_LIST_SORTS = ['created_desc', 'created_asc', 'name_asc', 'name_desc', 'family_asc', 'level_asc'] as const

export type BadgeListSort = (typeof BADGE_LIST_SORTS)[number]

export const BADGE_LIST_SORT_LABEL: Record<BadgeListSort, string> = {
  created_desc: '최신순',
  created_asc: '오래된 순',
  name_asc: '이름 (가나다)',
  name_desc: '이름 (역순)',
  family_asc: '계열순',
  level_asc: '레벨순',
}

export const BADGE_LIST_SORT_OPTIONS: { value: BadgeListSort; label: string }[] = BADGE_LIST_SORTS.map((value) => ({
  value,
  label: BADGE_LIST_SORT_LABEL[value],
}))

export const DEFAULT_BADGE_LIST_SORT: BadgeListSort = 'created_desc'

/** URL 파라미터를 정렬 값으로 좁힌다. 모르는 값은 기본값으로 되돌린다 */
export function parseBadgeListSort(value: string | null | undefined): BadgeListSort {
  return (BADGE_LIST_SORTS as readonly string[]).includes(value ?? '')
    ? (value as BadgeListSort)
    : DEFAULT_BADGE_LIST_SORT
}

/**
 * DB 정렬로 표현할 수 없어 **전량 조회 후 메모리 정렬**이 필요한 축인가.
 *
 * ⚠️ PostgREST 기본 응답 상한은 1000행이라 `.limit()`을 크게 줘도 에러 없이 잘린다 —
 * 이 값이 true면 호출부는 `range`로 페이지를 끝까지 넘겨 전량을 가져와야 한다.
 */
export function requiresFullFetchSort(sort: BadgeListSort): boolean {
  return sort === 'family_asc' || sort === 'level_asc'
}

/** 비교 함수가 보는 행. 목록 조회가 실제로 가져오는 컬럼의 부분집합이다 */
export interface BadgeListSortRow {
  name: string
  created_at: string
  rarity: BadgeRarity | null
  level: number | null
  family_key: string | null
  sort_order: number
  activity_types: string[] | null
}

/** 종목 탭 순서. 활동 종목이 없는 배지(체크인·아이템)는 맨 뒤 */
function activityRank(row: BadgeListSortRow): number {
  const first = row.activity_types?.[0]
  const index = first ? (TREE_ACTIVITY_ORDER as readonly string[]).indexOf(first) : -1
  return index < 0 ? TREE_ACTIVITY_ORDER.length : index
}

/**
 * 계열순 — 종목 탭 순서 → 표시 순서(`sortRank`, **0은 맨 뒤**) → 계열 키 → 계열 안 자리 → 이름.
 * 계열 관리 화면(`compareFamilies`)이 계열을 늘어놓는 순서와 같은 기준이라, 두 화면에서
 * 같은 계열이 같은 자리에 온다.
 */
export function compareByFamily(a: BadgeListSortRow, b: BadgeListSortRow): number {
  return (
    activityRank(a) - activityRank(b) ||
    sortRank(a.sort_order) - sortRank(b.sort_order) ||
    familyKeyOf(a).localeCompare(familyKeyOf(b), 'ko') ||
    familySlotRank(a) - familySlotRank(b) ||
    a.name.localeCompare(b.name, 'ko')
  )
}

/**
 * 레벨순 — 레벨 오름차순. **레벨이 없는 배지(등급형·체크인·아이템)는 맨 뒤**다.
 * 레벨이 같으면 계열순으로 갈라 같은 계열의 같은 자리가 흩어지지 않게 한다.
 */
export function compareByLevel(a: BadgeListSortRow, b: BadgeListSortRow): number {
  const rank = (row: BadgeListSortRow) => (row.level == null ? Number.MAX_SAFE_INTEGER : row.level)
  return rank(a) - rank(b) || compareByFamily(a, b)
}

/** 정렬 값에 대응하는 비교 함수. DB 정렬(`created_*`·`name_*`)과 결과가 같아야 한다 */
export function compareBadgeListRows(sort: BadgeListSort): (a: BadgeListSortRow, b: BadgeListSortRow) => number {
  switch (sort) {
    case 'name_asc':
      return (a, b) => a.name.localeCompare(b.name, 'ko')
    case 'name_desc':
      return (a, b) => b.name.localeCompare(a.name, 'ko')
    case 'created_asc':
      return (a, b) => a.created_at.localeCompare(b.created_at)
    case 'family_asc':
      return compareByFamily
    case 'level_asc':
      return compareByLevel
    default:
      return (a, b) => b.created_at.localeCompare(a.created_at)
  }
}

// ── 조건 필드 필터 ──────────────────────────────────────────────────────────

/**
 * 「이 조건 필드를 쓰는 배지만」 필터의 선택지. **레지스트리에서 파생한다** — 손으로
 * 나열하면 새 조건 필드(v5 신규 20종)가 필터에 나타나지 않는다. 발급 판정에 관여하지 않는
 * `meta` 역할 필드는 제외한다(`CONDITION_FIELD_KEYS`).
 */
export const CONDITION_FIELD_FILTER_OPTIONS: { value: ConditionKey; label: string }[] = CONDITION_FIELD_KEYS.map(
  (key) => ({ value: key, label: getConditionField(key)?.label ?? key })
)

/**
 * URL 파라미터를 조건 필드 키로 좁힌다. **레지스트리에 없는 값은 null**이다 —
 * 이 값이 그대로 PostgREST의 jsonb 경로(`condition_json->>키`)에 들어가므로 임의 문자열을
 * 통과시키지 않는다.
 */
export function parseConditionFieldFilter(value: string | null | undefined): ConditionKey | null {
  if (!value) return null
  return (CONDITION_FIELD_KEYS as readonly string[]).includes(value) ? (value as ConditionKey) : null
}

/** 조건에 그 필드가 들어 있는가 — 메모리 경로(체크인 카테고리 필터 등)가 쓰는 판정 */
export function badgeUsesConditionField(
  condition: Record<string, unknown> | null | undefined,
  key: ConditionKey
): boolean {
  return !!condition && condition[key] !== undefined && condition[key] !== null
}
