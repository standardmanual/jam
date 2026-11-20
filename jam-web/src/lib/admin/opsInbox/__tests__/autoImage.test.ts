/**
 * 기획을 열면 이미지를 미리 만드는 대상 고르기 (티켓 20261120_1416)
 *
 * 지키는 것: 도착·검토중이고 이미지가 없고 제작 인자와 색(`bg`·`end`)이 완성된 항목만 고른다 / 시험 묶음·승인 이후 상태·이미지 칸 없는 종류·이미 이미지가 있는 항목·
 * 색 비었거나 `color_pending`·`preset_id` 없음·이미 시도한 항목은 제외 / 새로 읽어 `items`가 바뀌어도 한 항목은 한 번만 고른다.
 */
import { describe, expect, it } from 'vitest'
import type { OpsItemRecord } from '../query'
import { claimAutoImageItemIds, pickAutoImageItemIds } from '../autoImage'

const SPEC = { preset_id: 'p1', bg: '#111111', end: '#222222' }

function makeItem(over: Partial<OpsItemRecord> = {}, original: Record<string, unknown> = {}): OpsItemRecord {
  return {
    id: 'item-1',
    position: 0,
    itemKey: 'card-1',
    kind: 'home_feed_card',
    patternNo: null,
    startsAt: null,
    endsAt: null,
    status: 'reviewing',
    original: { shape: 'hero', copy: { title: '제목' }, image_spec: SPEC, ...original },
    edited: null,
    formatErrors: [],
    updatedAt: '2026-11-20T00:00:00Z',
    ...over,
  } as OpsItemRecord
}

const pick = (items: OpsItemRecord[], attempted: string[] = [], isSample = false) =>
  pickAutoImageItemIds(items, { isSample, attempted: new Set(attempted) })

describe('pickAutoImageItemIds', () => {
  it('도착·검토중이고 이미지가 없고 지시와 색이 완성된 항목을 items 순서대로 고른다', () => {
    const items = [makeItem({ id: 'a', status: 'arrived' }), makeItem({ id: 'b' }), makeItem({ id: 'c', kind: 'mission' })]
    expect(pick(items)).toEqual(['a', 'b', 'c'])
  })

  it('시험 묶음이면 고르지 않는다', () => {
    expect(pick([makeItem()], [], true)).toEqual([])
  })

  it('승인 이후 상태·반려·취소 등 도착·검토중이 아닌 항목은 고르지 않는다', () => {
    for (const status of ['approved', 'preparing', 'scheduled', 'live', 'rejected', 'cancelled', 'failed', 'ended']) {
      expect(pick([makeItem({ status })])).toEqual([])
    }
  })

  it('이미지 칸이 없는 종류는 고르지 않는다', () => {
    expect(pick([makeItem({ kind: 'notice' }), makeItem({ id: 'x', kind: null })])).toEqual([])
  })

  it('자원에 이미지가 이미 있으면 고르지 않는다(종류마다 칸 이름이 다르다)', () => {
    expect(pick([makeItem({}, { resource: { cover_image_url: 'https://x/y.png' } })])).toEqual([])
    expect(pick([makeItem({ kind: 'mission' }, { resource: { image_url: 'https://x/y.png' } })])).toEqual([])
    expect(pick([makeItem({ kind: 'mission' }, { resource: { image_url: '  ' } })])).toEqual(['item-1'])
  })

  it('preset_id가 없거나 image_spec이 없으면 고르지 않는다', () => {
    expect(pick([makeItem({}, { image_spec: { bg: '#111111', end: '#222222' } })])).toEqual([])
    expect(pick([makeItem({}, { image_spec: undefined })])).toEqual([])
  })

  it('bg나 end가 비어 있으면 고르지 않는다', () => {
    expect(pick([makeItem({}, { image_spec: { preset_id: 'p1' } })])).toEqual([])
    expect(pick([makeItem({}, { image_spec: { preset_id: 'p1', bg: '#111111' } })])).toEqual([])
    expect(pick([makeItem({}, { image_spec: { preset_id: 'p1', bg: '#111111', end: '  ' } })])).toEqual([])
  })

  it('색 대기(color_pending)이면 고르지 않고, 값이 불리언이 아니어도 고르지 않는다', () => {
    expect(pick([makeItem({}, { color_pending: true })])).toEqual([])
    expect(pick([makeItem({}, { color_pending: 'yes' })])).toEqual([])
    expect(pick([makeItem({}, { color_pending: false })])).toEqual(['item-1'])
  })

  it('이미 시도한 항목은 고르지 않는다', () => {
    expect(pick([makeItem({ id: 'a' }), makeItem({ id: 'b' })], ['a'])).toEqual(['b'])
  })

  it('수정본의 image_spec이 있으면 원본 대신 그것으로 판정한다(색이 채워진 뒤 새로 읽은 항목)', () => {
    const pending = makeItem({}, { image_spec: { preset_id: 'p1' }, color_pending: true })
    expect(pick([pending])).toEqual([])
    const filled = { ...pending, edited: { image_spec: SPEC, color_pending: false } as never }
    expect(pick([filled])).toEqual(['item-1'])
  })
})

describe('claimAutoImageItemIds', () => {
  it('고른 항목을 시도한 것으로 기록해 items가 새로 바뀌어도 다시 돌려주지 않는다', () => {
    const attempted = new Set<string>()
    expect(claimAutoImageItemIds([makeItem({ id: 'a' })], false, attempted)).toEqual(['a'])
    expect(claimAutoImageItemIds([makeItem({ id: 'a', updatedAt: '2026-11-20T01:00:00Z' })], false, attempted)).toEqual([])
    expect(claimAutoImageItemIds([makeItem({ id: 'a' }), makeItem({ id: 'b' })], false, attempted)).toEqual(['b'])
  })

  it('대상이 없으면 빈 배열이고 시험 묶음이면 기록도 하지 않는다', () => {
    const attempted = new Set<string>()
    expect(claimAutoImageItemIds([makeItem()], true, attempted)).toEqual([])
    expect(attempted.size).toBe(0)
  })
})
