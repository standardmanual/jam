/**
 * resolveAmbientTargetCollections — 앰비언트 드랍 대상 컬렉션 확정 (티켓 20260930_1516)
 *
 * random·explicit·explicit 「전체」 세 모드 × 노출 중 컬렉션이 있음/없음/일부.
 * 핵심 회귀: 노출 중 컬렉션이 없을 때 random과 「전체」가 모든 컬렉션으로 넓어지지 않고 건너뛴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/collection-target.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { resolveAmbientTargetCollections } from '../collectionTarget'

/** 항상 첫 번째를 고른다 — 결정론적 */
const pickFirst = (ids: readonly string[]) => ids[0] ?? null

describe('random 모드', () => {
  it('노출 중 컬렉션에서 하나를 고른다', () => {
    const pick = vi.fn(pickFirst)
    const result = resolveAmbientTargetCollections({
      useRandom: true,
      configIds: [],
      droppableIds: ['live-1', 'live-2'],
      pick,
    })

    expect(pick).toHaveBeenCalledWith(['live-1', 'live-2'])
    expect(result).toEqual({
      effectiveCollectionIds: ['live-1'],
      restrictToCollectionIds: null,
      excludedCollectionIds: [],
    })
  })

  it('설정된 collection_ids는 보지 않는다', () => {
    const result = resolveAmbientTargetCollections({
      useRandom: true,
      configIds: ['configured-but-ended'],
      droppableIds: ['live-1'],
      pick: pickFirst,
    })
    expect(result.effectiveCollectionIds).toEqual(['live-1'])
  })

  it('노출 중 컬렉션이 없으면 전체로 넓어지지 않고 건너뛴다', () => {
    const result = resolveAmbientTargetCollections({
      useRandom: true,
      configIds: [],
      droppableIds: [],
      pick: pickFirst,
    })

    expect(result.reason).toBe('no_eligible_collection')
    expect(result.effectiveCollectionIds).toEqual([])
    expect(result.restrictToCollectionIds).toBeNull()
  })
})

describe('explicit 모드 — 컬렉션을 지정함', () => {
  it('지정한 컬렉션이 모두 노출 중이면 그대로 쓴다', () => {
    const result = resolveAmbientTargetCollections({
      useRandom: false,
      configIds: ['live-1', 'live-2'],
      droppableIds: ['live-1', 'live-2', 'live-3'],
      pick: pickFirst,
    })

    expect(result).toEqual({
      effectiveCollectionIds: ['live-1', 'live-2'],
      restrictToCollectionIds: null,
      excludedCollectionIds: [],
    })
  })

  it('일부만 노출 중이면 노출 중인 것만 남기고 뺀 것은 excludedCollectionIds에 담는다', () => {
    const result = resolveAmbientTargetCollections({
      useRandom: false,
      configIds: ['live-1', 'inactive-1', 'ended-1'],
      droppableIds: ['live-1', 'live-3'],
      pick: pickFirst,
    })

    expect(result).toEqual({
      effectiveCollectionIds: ['live-1'],
      restrictToCollectionIds: null,
      excludedCollectionIds: ['inactive-1', 'ended-1'],
    })
    expect(result.reason).toBeUndefined()
  })

  it('지정한 컬렉션이 하나도 노출 중이 아니면 드랍하지 않고 사유와 뺀 목록을 남긴다', () => {
    const result = resolveAmbientTargetCollections({
      useRandom: false,
      configIds: ['inactive-1', 'future-1'],
      droppableIds: ['live-3'],
      pick: pickFirst,
    })

    expect(result).toEqual({
      effectiveCollectionIds: [],
      restrictToCollectionIds: null,
      excludedCollectionIds: ['inactive-1', 'future-1'],
      reason: 'no_eligible_collection',
    })
  })

  it('노출 중 컬렉션이 아예 없어도 같은 사유로 건너뛴다', () => {
    const result = resolveAmbientTargetCollections({
      useRandom: false,
      configIds: ['inactive-1'],
      droppableIds: [],
      pick: pickFirst,
    })
    expect(result.reason).toBe('no_eligible_collection')
    expect(result.excludedCollectionIds).toEqual(['inactive-1'])
  })
})

describe('explicit 모드 — 「전체」(collection_ids가 빈 배열)', () => {
  it('effectiveCollectionIds는 비워 두고 후보 배지를 노출 중 컬렉션으로 좁힌다', () => {
    const result = resolveAmbientTargetCollections({
      useRandom: false,
      configIds: [],
      droppableIds: ['live-1', 'live-2'],
      pick: pickFirst,
    })

    expect(result).toEqual({
      effectiveCollectionIds: [],
      restrictToCollectionIds: ['live-1', 'live-2'],
      excludedCollectionIds: [],
    })
  })

  it('노출 중 컬렉션이 없으면 모든 컬렉션으로 넓어지지 않고 건너뛴다', () => {
    const result = resolveAmbientTargetCollections({
      useRandom: false,
      configIds: [],
      droppableIds: [],
      pick: pickFirst,
    })

    expect(result.reason).toBe('no_eligible_collection')
    expect(result.restrictToCollectionIds).toBeNull()
  })
})
