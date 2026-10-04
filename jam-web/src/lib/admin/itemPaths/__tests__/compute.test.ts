/**
 * computeItemPaths — 컬렉션별 아이템 얻을 길 계산 유닛테스트 (티켓 20261004_1640, 상위 20260930_1503 ⑦a)
 *
 * 지키는 것:
 * 1. 드랍 길 — 컬렉션 비활성·공개 전·기간 끝, `drop_excluded`(컬렉션·아이템), 아이템 유효기간 밖은 닫힌다
 * 2. 믹스 길 — 공개 중 레시피의 보상에 있을 때만 열린다. 공개 예정·종료·종료 시각 정각은 닫힌다
 * 3. 미션 길 — 노출 중이고 진행 중인 미션의 보상에 있을 때만 열린다. hidden·종료·시작 전은 닫히고 상시(ends_at null)는 열린다
 * 4. 상태 분류 — 세 길이 모두 닫히면 막힘, 드랍 제외는 따로, 한 길이라도 열리면 열림
 * 5. 경계 시각 — 레시피 종료는 제외(`<`)·컬렉션 종료는 포함(`<=`), 기존 판정 함수와 같은 결과
 * 6. 여러 레시피·미션 ID는 중복 없이 모은다
 */
import { describe, it, expect } from 'vitest'
import { computeItemPaths, classifyItem, summarizeCollection } from '../compute'
import type {
  ItemPathCollectionInput,
  ItemPathItemInput,
  ItemPathMissionInput,
  ItemPathRecipeInput,
} from '../types'
import { isItemBookDroppable } from '@/lib/itembook/visibility'
import { isRecipeReleased } from '@/lib/combine/visibility'

const NOW = new Date('2026-10-04T00:00:00.000Z')
const PAST = '2026-09-01T00:00:00.000Z'
const FUTURE = '2026-11-01T00:00:00.000Z'

function collection(over: Partial<ItemPathCollectionInput> = {}): ItemPathCollectionInput {
  return { id: 'c1', is_active: true, valid_from: null, valid_until: null, drop_excluded: false, ...over }
}

function item(over: Partial<ItemPathItemInput> = {}): ItemPathItemInput {
  return {
    id: 'i1',
    item_book_id: 'c1',
    deleted_at: null,
    drop_excluded: false,
    valid_from: null,
    valid_until: null,
    ...over,
  }
}

function recipe(over: Partial<ItemPathRecipeInput> = {}): ItemPathRecipeInput {
  return { id: 'r1', reward_badge_ids: ['i1'], valid_from: null, valid_until: null, ...over }
}

function mission(over: Partial<ItemPathMissionInput> = {}): ItemPathMissionInput {
  return {
    id: 'm1',
    reward_badge_ids: ['i1'],
    starts_at: PAST,
    ends_at: null,
    exposure_mode: 'start_date',
    exposure_at: null,
    ...over,
  }
}

/** 컬렉션 1·아이템 1을 계산해 그 아이템의 결과를 돌려준다 */
function run(opts: {
  collection?: Partial<ItemPathCollectionInput>
  item?: Partial<ItemPathItemInput>
  recipes?: ItemPathRecipeInput[]
  missions?: ItemPathMissionInput[]
  now?: Date
}) {
  const result = computeItemPaths({
    collections: [collection(opts.collection)],
    items: [item(opts.item)],
    recipes: opts.recipes ?? [],
    missions: opts.missions ?? [],
    now: opts.now ?? NOW,
  })
  return result.items[0]
}

describe('드랍 길', () => {
  it('노출 중 컬렉션의 정상 아이템이면 열린다', () => {
    const r = run({})
    expect(r.drop).toEqual({ open: true, reasons: [] })
    expect(r.status).toBe('open')
  })

  it('컬렉션이 비활성이면 닫힌다', () => {
    const r = run({ collection: { is_active: false } })
    expect(r.drop.open).toBe(false)
    expect(r.drop.reasons).toEqual(['collection_inactive'])
    expect(r.status).toBe('blocked')
  })

  it('컬렉션 공개 전이면 닫힌다', () => {
    const r = run({ collection: { valid_from: FUTURE } })
    expect(r.drop.reasons).toEqual(['collection_not_launched'])
  })

  it('컬렉션 기간이 끝났으면 닫힌다', () => {
    const r = run({ collection: { valid_until: PAST } })
    expect(r.drop.reasons).toEqual(['collection_ended'])
  })

  it('컬렉션 종료 시각 정각은 포함이라 아직 열려 있다(<=)', () => {
    const r = run({ collection: { valid_until: NOW.toISOString() } })
    expect(r.drop.open).toBe(true)
  })

  it('컬렉션 종료 시각이 1ms 지나면 닫힌다', () => {
    const r = run({ collection: { valid_until: NOW.toISOString() }, now: new Date(NOW.getTime() + 1) })
    expect(r.drop.reasons).toEqual(['collection_ended'])
  })

  it('컬렉션이 drop_excluded이면 드랍 제외다', () => {
    const r = run({ collection: { drop_excluded: true } })
    expect(r.drop.open).toBe(false)
    expect(r.drop.reasons).toEqual(['collection_drop_excluded'])
    expect(r.status).toBe('drop_excluded')
  })

  it('아이템이 drop_excluded이면 드랍 제외다', () => {
    const r = run({ item: { drop_excluded: true } })
    expect(r.drop.reasons).toEqual(['item_drop_excluded'])
    expect(r.status).toBe('drop_excluded')
  })

  it('아이템 유효기간이 끝났으면 닫힌다', () => {
    const r = run({ item: { valid_until: PAST } })
    expect(r.drop.reasons).toEqual(['item_out_of_period'])
    expect(r.status).toBe('blocked')
  })

  it('아이템 유효기간이 아직 시작 전이면 닫힌다', () => {
    const r = run({ item: { valid_from: FUTURE } })
    expect(r.drop.reasons).toEqual(['item_out_of_period'])
  })

  it('아이템 유효기간 안이면 열린다', () => {
    const r = run({ item: { valid_from: PAST, valid_until: FUTURE } })
    expect(r.drop.open).toBe(true)
  })

  it('컬렉션 닫힘과 아이템 기간 밖이 겹치면 사유를 모두 담는다', () => {
    const r = run({ collection: { is_active: false }, item: { valid_until: PAST } })
    expect(r.drop.reasons).toEqual(['collection_inactive', 'item_out_of_period'])
  })

  it('판정이 isItemBookDroppable과 같다 — 컬렉션 경계·상태 조합을 전부 대조한다', () => {
    const times = [null, PAST, NOW.toISOString(), FUTURE]
    for (const is_active of [true, false]) {
      for (const valid_from of times) {
        for (const valid_until of times) {
          const c = collection({ is_active, valid_from, valid_until })
          const r = run({ collection: c })
          expect(r.drop.open).toBe(isItemBookDroppable(c, NOW.toISOString()))
        }
      }
    }
  })
})

describe('믹스 길', () => {
  it('공개 중 레시피의 보상에 있으면 열린다', () => {
    const r = run({ recipes: [recipe()] })
    expect(r.mix).toEqual({ open: true, recipeIds: ['r1'], reasons: [] })
  })

  it('레시피 보상에 없으면 닫힌다(no_recipe)', () => {
    const r = run({ recipes: [recipe({ reward_badge_ids: ['other'] })] })
    expect(r.mix).toEqual({ open: false, recipeIds: [], reasons: ['no_recipe'] })
  })

  it('reward_badge_ids가 null인 레시피는 무시한다', () => {
    const r = run({ recipes: [recipe({ reward_badge_ids: null })] })
    expect(r.mix.reasons).toEqual(['no_recipe'])
  })

  it('공개 예정 레시피는 닫힌다', () => {
    const r = run({ recipes: [recipe({ valid_from: FUTURE })] })
    expect(r.mix).toEqual({ open: false, recipeIds: [], reasons: ['recipe_scheduled'] })
  })

  it('종료된 레시피는 닫힌다', () => {
    const r = run({ recipes: [recipe({ valid_until: PAST })] })
    expect(r.mix.reasons).toEqual(['recipe_ended'])
  })

  it('레시피 종료 시각 정각은 닫힌다(종료 제외 경계)', () => {
    const r = run({ recipes: [recipe({ valid_until: NOW.toISOString() })] })
    expect(r.mix.open).toBe(false)
    expect(r.mix.reasons).toEqual(['recipe_ended'])
  })

  it('레시피 종료 1ms 전은 열린다', () => {
    const r = run({ recipes: [recipe({ valid_until: NOW.toISOString() })], now: new Date(NOW.getTime() - 1) })
    expect(r.mix.open).toBe(true)
  })

  it('레시피 공개 시각 정각은 열린다(공개 포함 경계)', () => {
    const r = run({ recipes: [recipe({ valid_from: NOW.toISOString() })] })
    expect(r.mix.open).toBe(true)
  })

  it('판정이 isRecipeReleased와 같다 — 경계 조합을 전부 대조한다', () => {
    const times = [null, PAST, NOW.toISOString(), FUTURE]
    for (const valid_from of times) {
      for (const valid_until of times) {
        const rc = recipe({ valid_from, valid_until })
        const r = run({ recipes: [rc] })
        expect(r.mix.open).toBe(isRecipeReleased(rc, NOW))
      }
    }
  })

  it('열린 레시피가 하나라도 있으면 닫힌 레시피 사유는 싣지 않는다', () => {
    const r = run({ recipes: [recipe({ id: 'r1', valid_until: PAST }), recipe({ id: 'r2' })] })
    expect(r.mix).toEqual({ open: true, recipeIds: ['r2'], reasons: [] })
  })

  it('여러 레시피 ID를 중복 없이 입력 순서대로 모은다', () => {
    const r = run({
      recipes: [
        recipe({ id: 'r1', reward_badge_ids: ['i1', 'i1'] }),
        recipe({ id: 'r2', reward_badge_ids: ['x', 'i1'] }),
        recipe({ id: 'r3', reward_badge_ids: ['x'] }),
      ],
    })
    expect(r.mix.recipeIds).toEqual(['r1', 'r2'])
  })

  it('닫힌 레시피 사유는 중복 없이 담는다', () => {
    const r = run({
      recipes: [
        recipe({ id: 'r1', valid_until: PAST }),
        recipe({ id: 'r2', valid_until: PAST }),
        recipe({ id: 'r3', valid_from: FUTURE }),
      ],
    })
    expect(r.mix.reasons).toEqual(['recipe_ended', 'recipe_scheduled'])
  })
})

describe('미션 길', () => {
  it('진행 중이고 노출된 미션의 보상에 있으면 열린다', () => {
    const r = run({ missions: [mission()] })
    expect(r.mission).toEqual({ open: true, missionIds: ['m1'], reasons: [] })
  })

  it('미션 보상에 없으면 닫힌다(no_mission)', () => {
    const r = run({ missions: [mission({ reward_badge_ids: ['other'] })] })
    expect(r.mission).toEqual({ open: false, missionIds: [], reasons: ['no_mission'] })
  })

  it('exposure_mode가 hidden이면 닫힌다', () => {
    const r = run({ missions: [mission({ exposure_mode: 'hidden' })] })
    expect(r.mission.reasons).toEqual(['mission_hidden'])
  })

  it('노출일 지정(scheduled)이고 노출 시각 전이면 닫힌다', () => {
    const r = run({ missions: [mission({ exposure_mode: 'scheduled', exposure_at: FUTURE })] })
    expect(r.mission.reasons).toEqual(['mission_not_exposed'])
  })

  it('노출일 지정(scheduled)이고 노출 시각이 지났으면 열린다', () => {
    const r = run({ missions: [mission({ exposure_mode: 'scheduled', exposure_at: PAST })] })
    expect(r.mission.open).toBe(true)
  })

  it('exposure_mode가 비어 있으면(마이그레이션 전) start_date로 본다', () => {
    const r = run({ missions: [mission({ exposure_mode: undefined, exposure_at: undefined })] })
    expect(r.mission.open).toBe(true)
  })

  it('종료된 미션은 닫힌다', () => {
    const r = run({ missions: [mission({ ends_at: PAST })] })
    expect(r.mission.reasons).toEqual(['mission_ended'])
  })

  it('시작 전 미션은 닫힌다', () => {
    const r = run({ missions: [mission({ starts_at: FUTURE })] })
    expect(r.mission.reasons).toEqual(['mission_not_started'])
  })

  it('상시 미션(ends_at null)은 시작 시각이 지났으면 열린다', () => {
    const r = run({ missions: [mission({ ends_at: null })] })
    expect(r.mission.open).toBe(true)
  })

  it('미션 종료 시각 정각은 아직 진행 중이다(isMissionActive는 종료 포함)', () => {
    const r = run({ missions: [mission({ ends_at: NOW.toISOString() })] })
    expect(r.mission.open).toBe(true)
  })

  it('여러 미션 ID를 중복 없이 입력 순서대로 모은다', () => {
    const r = run({
      missions: [
        mission({ id: 'm1', reward_badge_ids: ['i1', 'i1'] }),
        mission({ id: 'm2', reward_badge_ids: ['i1'] }),
        mission({ id: 'm3', reward_badge_ids: ['x'] }),
        mission({ id: 'm4', reward_badge_ids: ['i1'], ends_at: PAST }),
      ],
    })
    expect(r.mission.missionIds).toEqual(['m1', 'm2'])
  })
})

describe('상태 분류', () => {
  it('세 길이 모두 닫히면 막힘이다', () => {
    const r = run({
      collection: { is_active: false },
      recipes: [recipe({ valid_until: PAST })],
      missions: [mission({ exposure_mode: 'hidden' })],
    })
    expect(r.drop.open).toBe(false)
    expect(r.mix.open).toBe(false)
    expect(r.mission.open).toBe(false)
    expect(r.status).toBe('blocked')
  })

  it('드랍이 닫혀도 공개 중 레시피가 있으면 열림이다', () => {
    const r = run({ collection: { is_active: false }, recipes: [recipe()] })
    expect(r.status).toBe('open')
  })

  it('드랍이 닫혀도 진행 중 미션이 있으면 열림이다', () => {
    const r = run({ item: { valid_until: PAST }, missions: [mission()] })
    expect(r.status).toBe('open')
  })

  it('드랍 제외이고 다른 길이 없으면 드랍 제외다', () => {
    const r = run({ collection: { drop_excluded: true }, recipes: [recipe({ valid_until: PAST })] })
    expect(r.status).toBe('drop_excluded')
  })

  it('드랍 제외여도 믹스 길이 열려 있으면 열림이다', () => {
    const r = run({ item: { drop_excluded: true }, recipes: [recipe()] })
    expect(r.status).toBe('open')
  })

  it('드랍 제외와 기간 밖이 겹치면 드랍 제외로 둔다', () => {
    const r = run({ item: { drop_excluded: true, valid_until: PAST } })
    expect(r.status).toBe('drop_excluded')
  })

  it('classifyItem은 세 길 열림 여부와 드랍 사유만으로 분류한다', () => {
    const closed = { open: false }
    expect(classifyItem({ drop: { open: false, reasons: [] }, mix: closed, mission: closed })).toBe('blocked')
    expect(classifyItem({ drop: { open: true, reasons: [] }, mix: closed, mission: closed })).toBe('open')
    expect(
      classifyItem({ drop: { open: false, reasons: ['item_drop_excluded'] }, mix: closed, mission: closed }),
    ).toBe('drop_excluded')
  })
})

describe('결과 범위와 컬렉션 요약', () => {
  it('소프트 삭제된 아이템과 입력 컬렉션에 속하지 않는 아이템은 결과에 없다', () => {
    const result = computeItemPaths({
      collections: [collection()],
      items: [
        item({ id: 'i1' }),
        item({ id: 'deleted', deleted_at: PAST }),
        item({ id: 'orphan', item_book_id: null }),
        item({ id: 'other', item_book_id: 'c2' }),
      ],
      recipes: [],
      missions: [],
      now: NOW,
    })
    expect(result.items.map((r) => r.itemId)).toEqual(['i1'])
  })

  it('컬렉션별 열림·막힘·드랍 제외 개수를 센다', () => {
    const result = computeItemPaths({
      collections: [collection({ id: 'c1' }), collection({ id: 'c2', is_active: false }), collection({ id: 'c3' })],
      items: [
        item({ id: 'a', item_book_id: 'c1' }), // 열림
        item({ id: 'b', item_book_id: 'c1', valid_until: PAST }), // 막힘
        item({ id: 'c', item_book_id: 'c1', drop_excluded: true }), // 드랍 제외
        item({ id: 'd', item_book_id: 'c2' }), // 막힘(컬렉션 비활성)
      ],
      recipes: [],
      missions: [],
      now: NOW,
    })
    expect(result.collections).toEqual([
      { collectionId: 'c1', total: 3, open: 1, blocked: 1, dropExcluded: 1 },
      { collectionId: 'c2', total: 1, open: 0, blocked: 1, dropExcluded: 0 },
      { collectionId: 'c3', total: 0, open: 0, blocked: 0, dropExcluded: 0 },
    ])
  })

  it('summarizeCollection은 다른 컬렉션의 결과를 세지 않는다', () => {
    const summary = summarizeCollection('c1', [
      { collectionId: 'c1', status: 'open' },
      { collectionId: 'c2', status: 'blocked' },
    ])
    expect(summary).toEqual({ collectionId: 'c1', total: 1, open: 1, blocked: 0, dropExcluded: 0 })
  })

  it('컬렉션이 모두 막혔는지는 요약의 open이 0인지로 알 수 있다', () => {
    const result = computeItemPaths({
      collections: [collection({ is_active: false })],
      items: [item({ id: 'a' }), item({ id: 'b' })],
      recipes: [],
      missions: [],
      now: NOW,
    })
    expect(result.collections[0]).toMatchObject({ total: 2, open: 0, blocked: 2 })
  })
})
