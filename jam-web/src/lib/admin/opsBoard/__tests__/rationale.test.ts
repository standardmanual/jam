/**
 * 기획 이유 칩·핵심 항목·종류별 묶음 (티켓 20261026_2024 1회차)
 *
 * 지키는 것: 수정본이 있으면 수정본에서 이유를 읽는다, 묶음 칩은 많은 순(같으면 종류 순서)이고 반려·취소 항목은 세지 않는다,
 * 핵심은 5개 상한과 `position` 순이고 하나도 없으면 확인 필요 항목으로 대신한다, 종류 묶음은 `OPS_ITEM_KINDS` 순서이고
 * 검토중이 아닌 항목·패턴 제안은 뺀다, 새 필드가 없는 옛 항목은 모두 빈 결과다.
 */
import { describe, expect, it } from 'vitest'
import type { Json } from '@/types/database.generated'
import { bundleRationaleChips, highlightItems, itemRationaleChips, kindGroups } from '../rationale'

interface TestItem {
  id: string
  position: number
  kind: string | null
  status: string
  original: Json
  edited: Json | null
}

function item(over: Partial<TestItem> & { id: string }): TestItem {
  return { position: 0, kind: 'home_feed_card', status: 'reviewing', original: {}, edited: null, ...over }
}

const r = (kind: string, label = `${kind} 이유`) => ({ kind, label })

describe('itemRationaleChips', () => {
  it('수정본이 있으면 수정본에서 읽고 없으면 원본에서 읽는다', () => {
    const original = { rationale: [r('trend', '원본')] }
    expect(itemRationaleChips({ original, edited: null }).map((chip) => chip.label)).toEqual(['원본'])
    expect(itemRationaleChips({ original, edited: { rationale: [r('season', '수정본')] } }).map((chip) => chip.label)).toEqual(['수정본'])
  })

  it('새 필드가 없는 옛 항목은 빈 배열이다', () => {
    expect(itemRationaleChips({ original: { copy: { title: 'x' } }, edited: null })).toEqual([])
  })
})

describe('bundleRationaleChips', () => {
  it('종류별로 세어 많은 순으로 돌려주고, 같은 수는 종류 순서(트렌드 → 시즌 → 날씨 → 신호 → 패턴)다', () => {
    const items = [
      item({ id: 'a', original: { rationale: [r('signal'), r('trend')] } }),
      item({ id: 'b', original: { rationale: [r('signal'), r('season')] } }),
      item({ id: 'c', original: { rationale: [r('weather')] } }),
    ]
    expect(bundleRationaleChips(items)).toEqual([
      { kind: 'signal', count: 2 },
      { kind: 'trend', count: 1 },
      { kind: 'season', count: 1 },
      { kind: 'weather', count: 1 },
    ])
  })

  it('반려·취소 항목은 세지 않는다', () => {
    const items = [
      item({ id: 'a', status: 'rejected', original: { rationale: [r('trend')] } }),
      item({ id: 'b', status: 'cancelled', original: { rationale: [r('trend')] } }),
      item({ id: 'c', status: 'approved', original: { rationale: [r('pattern')] } }),
    ]
    expect(bundleRationaleChips(items)).toEqual([{ kind: 'pattern', count: 1 }])
  })

  it('시험 묶음이어도 같은 규칙이고, 이유가 하나도 없으면 빈 배열이다', () => {
    expect(bundleRationaleChips([item({ id: 'a' }), item({ id: 'b' })])).toEqual([])
    expect(bundleRationaleChips([])).toEqual([])
  })
})

describe('highlightItems', () => {
  it('핵심 표시가 참인 항목을 position 순으로 최대 5개 돌려준다', () => {
    const items = Array.from({ length: 7 }, (_, index) => item({ id: `i${index}`, position: 6 - index, original: { highlight: true } }))
    const out = highlightItems(items, new Set())
    expect(out.fallback).toBe(false)
    expect(out.items.map((entry) => entry.position)).toEqual([0, 1, 2, 3, 4])
  })

  it('수정본의 핵심 표시가 원본보다 우선한다', () => {
    const items = [item({ id: 'a', original: { highlight: true }, edited: { highlight: false } }), item({ id: 'b', position: 1, edited: { highlight: true } })]
    expect(highlightItems(items, new Set()).items.map((entry) => entry.id)).toEqual(['b'])
  })

  it('핵심이 하나도 없으면 확인 필요 항목으로 대신하고(최대 5개) 대체임을 알린다', () => {
    const items = Array.from({ length: 8 }, (_, index) => item({ id: `i${index}`, position: index }))
    const out = highlightItems(items, new Set(items.map((entry) => entry.id)))
    expect(out.fallback).toBe(true)
    expect(out.items).toHaveLength(5)
    expect(highlightItems(items, new Set(['i3', 'i1'])).items.map((entry) => entry.id)).toEqual(['i1', 'i3'])
  })

  it('둘 다 없으면 빈 배열이다', () => {
    expect(highlightItems([item({ id: 'a' })], new Set()).items).toEqual([])
    expect(highlightItems([], new Set()).items).toEqual([])
  })
})

describe('kindGroups', () => {
  it('종류 순서(OPS_ITEM_KINDS)로 묶고 검토중이 아닌 항목·패턴 제안은 뺀다', () => {
    const items = [
      item({ id: 'm1', kind: 'mission' }),
      item({ id: 'h1', kind: 'home_feed_card' }),
      item({ id: 'h2', kind: 'home_feed_card' }),
      item({ id: 'p1', kind: 'pattern_proposal' }),
      item({ id: 'a1', kind: 'drop_schedule', status: 'approved' }),
      item({ id: 'g1', kind: 'drop_schedule', status: 'arrived' }),
      item({ id: 'x1', kind: null }),
    ]
    expect(kindGroups(items)).toEqual([
      { kind: 'home_feed_card', itemIds: ['h1', 'h2'] },
      { kind: 'mission', itemIds: ['m1'] },
      { kind: null, itemIds: ['x1'] },
    ])
  })

  it('결정할 항목이 없으면 빈 배열이다', () => {
    expect(kindGroups([item({ id: 'a', status: 'live' })])).toEqual([])
  })
})
