/**
 * 배지 목록 정렬·조건 필드 필터 회귀 (티켓 20260905_0032 C묶음)
 *
 * 지키는 것:
 *   ① 계열순·레벨순에서 **`sort_order = 0`은 맨 뒤**다 — 규칙을 재선언하지 않고
 *      `badgeTree.ts`의 `sortRank`를 그대로 쓴다(저장소의 다른 `sort_order`는 0이 앞이라
 *      습관대로 정렬하면 배지 트리·계열 화면과 순서가 갈린다)
 *   ② 조건 필드 필터 선택지가 **조건 레지스트리에서 파생**된다 — 손으로 나열하면 v5 신규
 *      필드가 필터에 나타나지 않는다
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/badge-list-view.test.ts`
 */
import {
  BADGE_LIST_SORTS,
  CONDITION_FIELD_FILTER_OPTIONS,
  badgeUsesConditionField,
  compareBadgeListRows,
  parseBadgeListSort,
  parseConditionFieldFilter,
  requiresFullFetchSort,
  type BadgeListSortRow,
} from '../badge-list-view'
import { sortRank } from '@/lib/badgeTree'
import { CONDITION_FIELDS, CONDITION_FIELD_KEYS } from '@/lib/badge-engine/conditionRegistry'

let seq = 0
function row(overrides: Partial<BadgeListSortRow> = {}): BadgeListSortRow {
  seq += 1
  return {
    name: `배지-${seq}`,
    created_at: '2026-01-01T00:00:00Z',
    rarity: 'common',
    level: null,
    family_key: `walking:family-${seq}`,
    sort_order: 10,
    activity_types: ['walking'],
    ...overrides,
  }
}

function sorted(rows: BadgeListSortRow[], sort: Parameters<typeof compareBadgeListRows>[0]) {
  return [...rows].sort(compareBadgeListRows(sort)).map((r) => r.name)
}

describe('① sort_order = 0은 맨 뒤다', () => {
  it('계열순 정렬에서 sort_order 0인 계열이 마지막에 온다', () => {
    const rows = [
      row({ name: '미설정', sort_order: 0, family_key: 'walking:unset' }),
      row({ name: '두번째', sort_order: 5, family_key: 'walking:second' }),
      row({ name: '첫번째', sort_order: 1, family_key: 'walking:first' }),
    ]
    expect(sorted(rows, 'family_asc')).toEqual(['첫번째', '두번째', '미설정'])
  })

  it('규칙을 재선언하지 않는다 — 공용 sortRank와 같은 판정이다', () => {
    // 0은 다른 어떤 값보다 뒤, 1은 5보다 앞. 이 함수가 유일한 정의다.
    expect(sortRank(0)).toBeGreaterThan(sortRank(99999))
    expect(sortRank(1)).toBeLessThan(sortRank(5))
  })

  it('레벨순에서도 레벨이 같으면 sort_order 0이 맨 뒤다', () => {
    const rows = [
      row({ name: '미설정', level: 3, rarity: null, sort_order: 0, family_key: 'walking:unset' }),
      row({ name: '설정됨', level: 3, rarity: null, sort_order: 7, family_key: 'walking:set' }),
    ]
    expect(sorted(rows, 'level_asc')).toEqual(['설정됨', '미설정'])
  })

  it('레벨순은 레벨 오름차순이고 레벨 없는 배지는 맨 뒤다', () => {
    const rows = [
      row({ name: '등급형', level: null, rarity: 'mystic' }),
      row({ name: 'Lv.5', level: 5, rarity: null }),
      row({ name: 'Lv.1', level: 1, rarity: null }),
    ]
    expect(sorted(rows, 'level_asc')).toEqual(['Lv.1', 'Lv.5', '등급형'])
  })

  it('계열순은 같은 계열을 붙여 놓고 계열 안에서는 자리 오름차순이다', () => {
    const rows = [
      row({ name: 'A-mystic', rarity: 'mystic', sort_order: 3, family_key: 'walking:a' }),
      row({ name: 'B-common', rarity: 'common', sort_order: 4, family_key: 'walking:b' }),
      row({ name: 'A-common', rarity: 'common', sort_order: 3, family_key: 'walking:a' }),
    ]
    expect(sorted(rows, 'family_asc')).toEqual(['A-common', 'A-mystic', 'B-common'])
  })

  it('계열 키가 비어 있으면 이름 폴백으로 묶인다(familyKeyOf와 같은 규칙)', () => {
    const rows = [
      row({ name: '같은이름', rarity: 'mystic', family_key: null, sort_order: 2 }),
      row({ name: '다른계열', rarity: 'common', family_key: null, sort_order: 2 }),
      row({ name: '같은이름', rarity: 'common', family_key: null, sort_order: 2 }),
    ]
    // `#name:같은이름` 두 건이 붙어 있고, 그 안에서 common → mystic 순
    expect(sorted(rows, 'family_asc')).toEqual(['같은이름', '같은이름', '다른계열'])
  })

  it('종목 탭 순서가 1순위다 — 종목 없는 배지(체크인·아이템)는 맨 뒤', () => {
    const rows = [
      row({ name: '체크인', activity_types: null, sort_order: 1 }),
      row({ name: '러닝', activity_types: ['running'], sort_order: 9 }),
      row({ name: '걷기', activity_types: ['walking'], sort_order: 9 }),
    ]
    expect(sorted(rows, 'family_asc')).toEqual(['걷기', '러닝', '체크인'])
  })

  it('계열순·레벨순만 전량 조회가 필요하다 — 나머지는 DB가 정렬한다', () => {
    expect(requiresFullFetchSort('family_asc')).toBe(true)
    expect(requiresFullFetchSort('level_asc')).toBe(true)
    expect(requiresFullFetchSort('created_desc')).toBe(false)
    expect(requiresFullFetchSort('name_asc')).toBe(false)
  })

  it('모르는 정렬 값은 기본값(최신순)으로 되돌린다', () => {
    expect(parseBadgeListSort('level_asc')).toBe('level_asc')
    expect(parseBadgeListSort('sort_order')).toBe('created_desc')
    expect(parseBadgeListSort(null)).toBe('created_desc')
    expect(BADGE_LIST_SORTS).toContain('family_asc')
  })
})

describe('② 조건 필드 필터는 레지스트리에서 파생된다', () => {
  it('선택지 목록이 레지스트리의 조건 필드 키와 정확히 같다', () => {
    expect(CONDITION_FIELD_FILTER_OPTIONS.map((o) => o.value)).toEqual([...CONDITION_FIELD_KEYS])
  })

  it('라벨도 레지스트리 선언에서 온다 — 화면이 한글을 따로 적지 않는다', () => {
    for (const option of CONDITION_FIELD_FILTER_OPTIONS) {
      const field = CONDITION_FIELDS.find((f) => f.key === option.value)
      expect(option.label).toBe(field?.label)
    }
  })

  it('발급 판정에 관여하지 않는 meta 필드는 선택지에 없다', () => {
    const metaKeys = CONDITION_FIELDS.filter((f) => f.role === 'meta').map((f) => f.key)
    for (const key of metaKeys) {
      expect(CONDITION_FIELD_FILTER_OPTIONS.map((o) => o.value)).not.toContain(key)
    }
  })

  it('레지스트리에 없는 값은 통과시키지 않는다 — jsonb 경로에 그대로 들어가기 때문이다', () => {
    expect(parseConditionFieldFilter('avg_watts')).toBe('avg_watts')
    expect(parseConditionFieldFilter('avg_watts,name')).toBeNull()
    expect(parseConditionFieldFilter('drop_weight')).toBeNull()
    expect(parseConditionFieldFilter('')).toBeNull()
    expect(parseConditionFieldFilter(undefined)).toBeNull()
  })

  it('필드를 쓰는 배지만 남긴다', () => {
    expect(badgeUsesConditionField({ avg_watts: 200 }, 'avg_watts')).toBe(true)
    expect(badgeUsesConditionField({ avg_watts: 0 }, 'avg_watts')).toBe(true)
    expect(badgeUsesConditionField({ distance_km: 10 }, 'avg_watts')).toBe(false)
    expect(badgeUsesConditionField(null, 'avg_watts')).toBe(false)
  })
})
