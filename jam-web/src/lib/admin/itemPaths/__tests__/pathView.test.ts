/**
 * 컬렉션별 획득 경로 화면의 보기 모델 (티켓 20261022_1136 2회) — 순수 함수만 시험한다. 지키는 것:
 * 1. 컬렉션은 막힘이 많은 순서이고 같으면 ID 순서다. 한 쪽은 10개이고, 범위를 벗어난 쪽 번호는 마지막·첫 쪽으로 맞춘다. 컬렉션이 없어도 1쪽이 있다
 * 2. 탭(`?tab=`)과 쪽 번호(`?page=`)는 잘못된 값이면 기본값(지표, 1쪽)이다
 * 3. 아이템마다 길 다섯 개를 열린 길과 닫힌 길(사유)로 나누고, 길 순서는 드랍·믹스·미션·동기화와 캡슐·등급 올리기다
 * 4. 한 컬렉션 안에서 막힘 → 드랍 제외 → 열림 순서이고 같은 상태끼리는 이름 순서다. 이름을 모르는 것은 같은 상태의 맨 뒤다
 * 5. 기간 한정 운영이 끝나 얻을 길이 없는 아이템이 «막힘»으로 먼저 보이고, 끝난 컬렉션에서도 미션으로 열린 것은 «열림»이다
 * 6. 고른 컬렉션 순서를 지키고, 이름을 모르는 컬렉션은 이름이 null이다
 */
import { describe, it, expect } from 'vitest'
import { computeItemPaths } from '../compute'
import {
  COLLECTION_PATHS_PAGE_SIZE,
  PATH_KEYS,
  buildCollectionPathViews,
  idsOnPage,
  itemPathRowOf,
  parseDashboardTab,
  parsePageParam,
  pickCollectionPage,
  sortCollectionsByBlocked,
  type PathNames,
} from '../pathView'
import type {
  CollectionPathSummary,
  ItemPathCollectionInput,
  ItemPathItemInput,
  ItemPathMissionInput,
} from '../types'

const NOW = new Date('2026-10-26T00:00:00.000Z')
const PAST = '2026-09-01T00:00:00.000Z'

function summary(collectionId: string, blocked: number, over: Partial<CollectionPathSummary> = {}): CollectionPathSummary {
  return { collectionId, total: blocked + 1, open: 1, blocked, dropExcluded: 0, ...over }
}

function collection(over: Partial<ItemPathCollectionInput> = {}): ItemPathCollectionInput {
  return { id: 'c1', tribe_id: 't1', is_active: true, valid_from: null, valid_until: null, drop_excluded: false, ...over }
}

function item(over: Partial<ItemPathItemInput> = {}): ItemPathItemInput {
  return {
    id: 'i1',
    item_book_id: 'c1',
    deleted_at: null,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    rarity: 'common',
    always_locked: false,
    ...over,
  }
}

function mission(rewardIds: string[]): ItemPathMissionInput {
  return {
    id: 'm1',
    reward_badge_ids: rewardIds,
    starts_at: PAST,
    ends_at: null,
    exposure_mode: 'start_date',
    exposure_at: null,
  }
}

const names = (collections: Record<string, string> = {}, items: Record<string, string> = {}): PathNames => ({
  collections: new Map(Object.entries(collections)),
  items: new Map(Object.entries(items)),
})

describe('탭과 쪽 번호', () => {
  it('tab은 paths만 획득 경로이고 없거나 모르는 값은 지표다', () => {
    expect(parseDashboardTab('paths')).toBe('paths')
    expect(parseDashboardTab(undefined)).toBe('metrics')
    expect(parseDashboardTab('metrics')).toBe('metrics')
    expect(parseDashboardTab('PATHS')).toBe('metrics')
    expect(parseDashboardTab('')).toBe('metrics')
  })

  it('page는 1 이상의 정수 문자열만 받고 나머지는 1쪽이다', () => {
    expect(parsePageParam('3')).toBe(3)
    expect(parsePageParam(undefined)).toBe(1)
    for (const bad of ['', '0', '-1', '1.5', 'abc', '2abc', ' 2', '99999999999999999999']) {
      expect(parsePageParam(bad), bad).toBe(1)
    }
  })
})

describe('컬렉션 정렬과 쪽 나누기', () => {
  it('막힘이 많은 컬렉션부터, 같으면 컬렉션 ID 순서다', () => {
    const sorted = sortCollectionsByBlocked([summary('c3', 1), summary('c2', 5), summary('c1', 1), summary('c4', 0)])
    expect(sorted.map((s) => s.collectionId)).toEqual(['c2', 'c1', 'c3', 'c4'])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const input = [summary('b', 1), summary('a', 2)]
    sortCollectionsByBlocked(input)
    expect(input.map((s) => s.collectionId)).toEqual(['b', 'a'])
  })

  const many = Array.from({ length: 25 }, (_, i) => summary(`c${String(i).padStart(2, '0')}`, 25 - i))

  it('한 쪽은 10개이고 25개면 3쪽이다', () => {
    expect(COLLECTION_PATHS_PAGE_SIZE).toBe(10)
    const first = pickCollectionPage(many, 1)
    expect(first).toMatchObject({ page: 1, totalPages: 3, total: 25 })
    expect(first.collectionIds).toHaveLength(10)
    expect(first.collectionIds[0]).toBe('c00')
    const last = pickCollectionPage(many, 3)
    expect(last.collectionIds).toEqual(['c20', 'c21', 'c22', 'c23', 'c24'])
  })

  it('쪽을 이어 읽어도 컬렉션이 겹치거나 빠지지 않는다', () => {
    const all = [1, 2, 3].flatMap((page) => pickCollectionPage(many, page).collectionIds)
    expect(all).toHaveLength(25)
    expect(new Set(all).size).toBe(25)
  })

  it('정확히 10개면 1쪽이다', () => {
    expect(pickCollectionPage(many.slice(0, 10), 1)).toMatchObject({ page: 1, totalPages: 1, total: 10 })
    expect(pickCollectionPage(many.slice(0, 11), 1).totalPages).toBe(2)
  })

  it('범위를 벗어난 쪽은 마지막 쪽으로, 1보다 작으면 1쪽으로 맞춘다', () => {
    expect(pickCollectionPage(many, 99).page).toBe(3)
    expect(pickCollectionPage(many, 0).page).toBe(1)
    expect(pickCollectionPage(many, -4).page).toBe(1)
  })

  it('컬렉션이 없어도 빈 1쪽이다', () => {
    expect(pickCollectionPage([], 5)).toEqual({ page: 1, totalPages: 1, total: 0, collectionIds: [] })
  })
})

describe('아이템 한 줄', () => {
  it('길 다섯 개를 열린 길과 닫힌 길(사유)로 나누고 길 순서를 지킨다', () => {
    const result = computeItemPaths({
      collections: [collection()],
      items: [item()],
      recipes: [],
      missions: [],
      lockedPoints: { common: 50, rare: 100, epic: 200, mystic: 400 },
      now: NOW,
    }).items[0]
    const row = itemPathRowOf(result, '첫 숨결')
    expect(PATH_KEYS).toEqual(['drop', 'mix', 'mission', 'syncCapsule', 'tierUp'])
    expect(row.name).toBe('첫 숨결')
    expect(row.status).toBe('open')
    expect(row.openPaths).toEqual(['drop', 'syncCapsule'])
    expect(row.closedPaths).toEqual([
      { path: 'mix', reasons: ['no_recipe'] },
      { path: 'mission', reasons: ['no_mission'] },
      { path: 'tierUp', reasons: ['tier_up_rarity_pair_missing'] },
    ])
    expect(row.lock).toEqual({ receivedLocked: false, unlockPoints: null })
  })

  it('열린 길과 닫힌 길을 합치면 항상 다섯 길 전부다', () => {
    const result = computeItemPaths({
      collections: [collection({ valid_until: PAST })],
      items: [item({ always_locked: true, rarity: 'rare' })],
      recipes: [],
      missions: [],
      lockedPoints: { common: 50, rare: 100, epic: 200, mystic: 400 },
      now: NOW,
    }).items[0]
    const row = itemPathRowOf(result, null)
    expect([...row.openPaths, ...row.closedPaths.map((c) => c.path)].sort()).toEqual([...PATH_KEYS].sort())
    expect(row.name).toBeNull()
    expect(row.lock).toEqual({ receivedLocked: true, unlockPoints: 100 })
  })
})

describe('컬렉션 보기 모델', () => {
  // c-ended: 기간이 끝났다. e1·e2는 얻을 길이 없어 막힘, e3은 진행 중 미션의 보상이라 열림
  // c-live : 노출 중이고 소속 트라이브가 있다. 드랍 제외 x1, 열림 o1·o2
  const computed = computeItemPaths({
    collections: [collection({ id: 'c-ended', valid_until: PAST }), collection({ id: 'c-live' })],
    items: [
      item({ id: 'e1', item_book_id: 'c-ended' }),
      item({ id: 'e2', item_book_id: 'c-ended' }),
      item({ id: 'e3', item_book_id: 'c-ended' }),
      item({ id: 'x1', item_book_id: 'c-live', drop_excluded: true }),
      item({ id: 'o1', item_book_id: 'c-live' }),
      item({ id: 'o2', item_book_id: 'c-live' }),
    ],
    recipes: [],
    missions: [mission(['e3'])],
    lockedPoints: { common: 50, rare: 100, epic: 200, mystic: 400 },
    now: NOW,
  })

  it('기간 한정 운영이 끝나 얻을 길이 없는 아이템이 막힘으로 먼저 보이고 사유가 컬렉션 기간 끝이다', () => {
    const [ended] = buildCollectionPathViews(computed, ['c-ended'], names({ 'c-ended': '끝난 컬렉션' }, { e1: '가', e2: '나', e3: '다' }))
    expect(ended).toMatchObject({ collectionId: 'c-ended', name: '끝난 컬렉션', total: 3, open: 1, blocked: 2, dropExcluded: 0 })
    expect(ended.items.map((r) => `${r.itemId}:${r.status}`)).toEqual(['e1:blocked', 'e2:blocked', 'e3:open'])
    expect(ended.items[0].closedPaths.find((c) => c.path === 'drop')?.reasons).toEqual(['collection_ended'])
    // 끝난 컬렉션이어도 진행 중 미션이 주는 아이템은 미션 길로 열려 있다
    expect(ended.items[2].openPaths).toEqual(['mission'])
  })

  it('막힘 → 드랍 제외 → 열림 순서이고 같은 상태끼리는 이름 순서다', () => {
    const [live] = buildCollectionPathViews(computed, ['c-live'], names({}, { x1: '가', o1: '하', o2: '나' }))
    expect(live.items.map((r) => `${r.itemId}:${r.status}`)).toEqual(['x1:drop_excluded', 'o2:open', 'o1:open'])
  })

  it('같은 이름이 등급마다 하나씩 있으면 낮은 등급부터 나오고, 행에 등급이 실린다(화면이 줄을 구분한다)', () => {
    const sameName = computeItemPaths({
      collections: [collection()],
      items: [
        item({ id: 'z-mystic', rarity: 'mystic' }),
        item({ id: 'a-epic', rarity: 'epic' }),
        item({ id: 'm-common', rarity: 'common' }),
        item({ id: 'b-rare', rarity: 'rare' }),
      ],
      recipes: [],
      missions: [],
      lockedPoints: { common: 50, rare: 100, epic: 200, mystic: 400 },
      now: NOW,
    })
    const sameNames = names({}, { 'z-mystic': '검은 비닐봉지', 'a-epic': '검은 비닐봉지', 'm-common': '검은 비닐봉지', 'b-rare': '검은 비닐봉지' })
    const [view] = buildCollectionPathViews(sameName, ['c1'], sameNames)
    expect(view.items.map((r) => `${r.itemId}:${r.rarity}`)).toEqual([
      'm-common:common',
      'b-rare:rare',
      'a-epic:epic',
      'z-mystic:mystic',
    ])
  })

  it('이름을 모르는 아이템은 같은 상태의 맨 뒤이고 이름이 null이다', () => {
    const [live] = buildCollectionPathViews(computed, ['c-live'], names({}, { o2: '나' }))
    expect(live.items.filter((r) => r.status === 'open').map((r) => `${r.itemId}:${r.name}`)).toEqual(['o2:나', 'o1:null'])
  })

  it('고른 컬렉션 순서를 지키고, 이름을 모르는 컬렉션은 이름이 null이다. 계산에 없는 컬렉션은 건너뛴다', () => {
    const views = buildCollectionPathViews(computed, ['c-live', 'missing', 'c-ended'], names({ 'c-ended': '끝난 컬렉션' }))
    expect(views.map((v) => v.collectionId)).toEqual(['c-live', 'c-ended'])
    expect(views.map((v) => v.name)).toEqual([null, '끝난 컬렉션'])
  })

  it('아이템이 없는 컬렉션도 빈 목록으로 싣는다', () => {
    const empty = computeItemPaths({ collections: [collection({ id: 'c0' })], items: [], recipes: [], missions: [], lockedPoints: { common: 50, rare: 100, epic: 200, mystic: 400 }, now: NOW })
    expect(buildCollectionPathViews(empty, ['c0'], names())[0]).toMatchObject({ total: 0, blocked: 0, items: [] })
  })

  it('이 쪽에 보일 컬렉션의 아이템 ID만 모은다', () => {
    expect(idsOnPage(computed, ['c-live'])).toEqual({ collectionIds: ['c-live'], itemIds: ['x1', 'o1', 'o2'] })
    expect(idsOnPage(computed, [])).toEqual({ collectionIds: [], itemIds: [] })
  })
})
