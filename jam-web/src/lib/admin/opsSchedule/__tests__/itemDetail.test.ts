/**
 * 일정표 항목 서랍 데이터 읽기 (티켓 20261006_1537 ③-b)
 *
 * 서비스 클라이언트와 기획 상세 읽기(`getOpsBundleDetail`)는 가짜로 바꾼다(실 DB에 닿지 않는다). 지키는 것:
 * - 항목 → 그 항목의 묶음 ID로 기획 상세를 읽고, 서랍이 쓰는 값(항목 자기 묶음 ID·시험 여부·항목 전부·결정 기록·밸런스)을 돌려준다
 * - UUID가 아니거나 없는 항목은 null이고, 묶음을 읽지 않는다(DB에 잘못된 값이 가지 않는다)
 * - 읽는 사이 묶음이 지워졌거나 묶음 안에 그 항목이 없으면 null이다
 * - 조회 오류는 던진다(「없는 항목」으로 숨기지 않는다)
 * - 읽기만 한다: `select`만 부르고 `insert`·`update`·`upsert`·`delete`를 쓰지 않는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const hoisted = vi.hoisted(() => ({
  row: { value: null as { bundle_id: string } | null, error: null as { message: string } | null },
  eqCalls: [] as Array<[string, unknown]>,
  detail: { value: null as unknown, error: null as Error | null },
  detailCalls: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          hoisted.eqCalls.push([column, value])
          return { maybeSingle: async () => ({ data: hoisted.row.value, error: hoisted.row.error }) }
        },
      }),
    }),
  }),
}))

vi.mock('@/lib/admin/opsInbox/query', () => ({
  getOpsBundleDetail: vi.fn(async (id: string) => {
    hoisted.detailCalls.push(id)
    if (hoisted.detail.error) throw hoisted.detail.error
    return hoisted.detail.value
  }),
}))

import { getScheduleItemDetail } from '../itemDetail'

const ITEM_ID = '3f2a9c1e-0000-4000-8000-0000000000a1'
const OTHER_ID = '3f2a9c1e-0000-4000-8000-0000000000b2'
const BUNDLE_ID = '11111111-1111-4111-8111-111111111111'

function item(id: string) {
  return { id, position: 0, kind: 'home_feed_card', status: 'reviewing' }
}

function detail(itemIds: string[]) {
  return {
    bundle: { id: BUNDLE_ID, isSample: true, formatErrors: [], bundleId: 'b', week: 'w', hypothesis: null, author: 'a', receivedAt: '2026-10-01T00:00:00Z' },
    items: itemIds.map(item),
    decisions: [{ id: 'd1', itemId: null, action: 'submit' }],
    balance: { status: 'failed' },
    execution: { approvedCount: 0, readyCount: 0 },
  }
}

beforeEach(() => {
  hoisted.row = { value: { bundle_id: BUNDLE_ID }, error: null }
  hoisted.eqCalls = []
  hoisted.detail = { value: detail([ITEM_ID, OTHER_ID]), error: null }
  hoisted.detailCalls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getScheduleItemDetail', () => {
  it('항목의 묶음을 기획 상세로 읽고 서랍이 쓰는 값만 돌려준다', async () => {
    const result = await getScheduleItemDetail(ITEM_ID)
    expect(hoisted.eqCalls).toEqual([['id', ITEM_ID]])
    expect(hoisted.detailCalls).toEqual([BUNDLE_ID])
    expect(result).toMatchObject({ itemId: ITEM_ID, bundleId: BUNDLE_ID, isSample: true, balance: { status: 'failed' } })
    expect(result?.items.map((entry) => entry.id)).toEqual([ITEM_ID, OTHER_ID])
    expect(result?.decisions).toHaveLength(1)
    // 예약 등록 요약·형식 오류 같은 서랍이 안 쓰는 값은 나가지 않는다
    expect(result).not.toHaveProperty('execution')
    expect(result).not.toHaveProperty('bundle')
  })

  it('대문자 UUID도 소문자로 맞춰 찾는다', async () => {
    const result = await getScheduleItemDetail(ITEM_ID.toUpperCase())
    expect(hoisted.eqCalls).toEqual([['id', ITEM_ID]])
    expect(result?.itemId).toBe(ITEM_ID)
  })

  it.each(['', 'card:3f2a9c1e-0000-4000-8000-0000000000a1', 'not-a-uuid', "1'; drop table x;--"])(
    'UUID가 아닌 값(%s)은 null이고 DB를 읽지 않는다',
    async (value) => {
      expect(await getScheduleItemDetail(value)).toBeNull()
      expect(hoisted.eqCalls).toEqual([])
      expect(hoisted.detailCalls).toEqual([])
    }
  )

  it('없는 항목은 null이고 묶음을 읽지 않는다', async () => {
    hoisted.row = { value: null, error: null }
    expect(await getScheduleItemDetail(ITEM_ID)).toBeNull()
    expect(hoisted.detailCalls).toEqual([])
  })

  it('묶음이 사라졌거나 묶음 안에 그 항목이 없으면 null이다', async () => {
    hoisted.detail = { value: null, error: null }
    expect(await getScheduleItemDetail(ITEM_ID)).toBeNull()
    hoisted.detail = { value: detail([OTHER_ID]), error: null }
    expect(await getScheduleItemDetail(ITEM_ID)).toBeNull()
  })

  it('항목 조회 오류는 던진다(없는 항목으로 숨기지 않는다)', async () => {
    hoisted.row = { value: null, error: { message: 'boom' } }
    await expect(getScheduleItemDetail(ITEM_ID)).rejects.toThrow('boom')
  })

  it('기획 상세 읽기 오류도 그대로 던진다', async () => {
    hoisted.detail = { value: null, error: new Error('detail failed') }
    await expect(getScheduleItemDetail(ITEM_ID)).rejects.toThrow('detail failed')
  })
})

describe('읽기만 한다', () => {
  it('소스에 쓰기 호출이 없다', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/admin/opsSchedule/itemDetail.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    expect(source).toMatch(/\.select\(/)
    expect(source).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
  })
})
