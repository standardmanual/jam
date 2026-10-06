/**
 * GET /api/admin/ops-schedule/items/[itemId] — 일정표 항목 서랍 데이터 (티켓 20261006_1537 ③-b, 카리나 가정 12)
 *
 * 읽기(`getScheduleItemDetail`)와 관리자 판정(`requireAdmin`)은 가짜로 바꾼다. 지키는 것:
 * - 관리자 세션이 아니면 403이고 읽지 않는다. 읽기 토큰(`x-admin-read-token`)으로는 열리지 않는다(`requireAdmin`만 쓴다, 소스 계약)
 * - UUID가 아니면 400, 없는 항목은 404(「찾을 수 없는 항목이에요」), 조회 오류는 500이고 오류 원문을 응답에 싣지 않는다
 * - 성공은 200과 서랍 데이터 그대로다. 반려·취소·실패 항목도 막지 않는다(상태로 거르지 않는다)
 * - GET만 export한다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

const hoisted = vi.hoisted(() => ({
  admin: { value: true },
  detail: { value: null as unknown, error: null as Error | null },
  calls: [] as string[],
}))

vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: async () => (hoisted.admin.value ? null : NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })),
}))
vi.mock('@/lib/admin/opsSchedule/itemDetail', () => ({
  getScheduleItemDetail: vi.fn(async (id: string) => {
    hoisted.calls.push(id)
    if (hoisted.detail.error) throw hoisted.detail.error
    return hoisted.detail.value
  }),
}))

import * as routeModule from '../route'

const { GET } = routeModule
const ITEM_ID = '3f2a9c1e-0000-4000-8000-0000000000a1'

function call(itemId: string) {
  return GET(new Request(`http://localhost/api/admin/ops-schedule/items/${itemId}`), { params: Promise.resolve({ itemId }) })
}

beforeEach(() => {
  hoisted.admin.value = true
  hoisted.detail = { value: { itemId: ITEM_ID, bundleId: 'b1', isSample: false, items: [], decisions: [], balance: { status: 'failed' } }, error: null }
  hoisted.calls = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/admin/ops-schedule/items/[itemId]', () => {
  it('관리자가 아니면 403이고 읽지 않는다', async () => {
    hoisted.admin.value = false
    const res = await call(ITEM_ID)
    expect(res.status).toBe(403)
    expect(hoisted.calls).toEqual([])
  })

  it('UUID가 아니면 400이고 읽지 않는다', async () => {
    const res = await call('card:abc')
    expect(res.status).toBe(400)
    expect(hoisted.calls).toEqual([])
  })

  it('없는 항목은 404다', async () => {
    hoisted.detail = { value: null, error: null }
    const res = await call(ITEM_ID)
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('찾을 수 없는 항목이에요.')
  })

  it('조회 오류는 500이고 오류 원문을 싣지 않는다', async () => {
    hoisted.detail = { value: null, error: new Error('secret table name') }
    const res = await call(ITEM_ID)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('항목을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('성공하면 200과 서랍 데이터 그대로다(항목 상태로 거르지 않는다)', async () => {
    const res = await call(ITEM_ID)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(hoisted.detail.value)
    expect(hoisted.calls).toEqual([ITEM_ID])
  })
})

describe('소스 계약', () => {
  const code = readFileSync(join(process.cwd(), 'src/app/api/admin/ops-schedule/items/[itemId]/route.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')

  it('GET만 export한다', () => {
    expect(Object.keys(routeModule)).toEqual(['GET'])
  })

  it('requireAdmin 한 가지로 인증하고 읽기 토큰을 다루지 않는다', () => {
    expect(code).toMatch(/await\s+requireAdmin\s*\(\s*\)/)
    expect(code).not.toMatch(/requireAdminRead|isValidAdminReadToken|x-admin-read-token/)
  })
})
