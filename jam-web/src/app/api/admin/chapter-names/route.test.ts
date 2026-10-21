/**
 * GET·PUT /api/admin/chapter-names — 챕터 이름 표 (티켓 20261019_1318 2회)
 * 어드민만 쓰고, 오류 응답은 고정 문구다(DB 오류 원문이 응답에 실리지 않는다). DB는 메모리 스텁이다.
 * 실행: cd jam-web && npx vitest run "src/app/api/admin/chapter-names/route.test.ts"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeNamesDb, type FakeNamesDb } from '@/lib/chapter/__tests__/fakeNamesDb'
import {
  CHAPTER_NAMES_BODY_INVALID_MESSAGE,
  CHAPTER_NAMES_PARTIAL_ERROR_MESSAGE,
  CHAPTER_NAMES_READ_ERROR_MESSAGE,
  CHAPTER_NAMES_SAVE_ERROR_MESSAGE,
  CHAPTER_NAMES_TOO_LONG_MESSAGE,
  CHAPTER_NAMES_UNKNOWN_CELL_MESSAGE,
} from '@/lib/chapter/names-table'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const MISSING = '99999999-9999-4999-8999-999999999999'

const holder = vi.hoisted(() => ({ db: null as unknown, admin: true }))

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => (holder.db as FakeNamesDb).client }))
vi.mock('@/lib/admin/auth', () => ({
  getAdminUser: async () => (holder.admin ? { id: 'admin-1', email: 'admin@example.com' } : null),
}))

const { GET, PUT } = await import('./route')

let db: FakeNamesDb

const put = (body: unknown, raw?: string) =>
  PUT(
    new NextRequest('https://j-a-m.app/api/admin/chapter-names', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    })
  )

beforeEach(() => {
  holder.admin = true
  db = createFakeNamesDb({
    tribes: [
      { id: A, name: '러너', is_active: true, sort_order: 1 },
      { id: B, name: '워커', is_active: false, sort_order: 2 },
    ],
    chapter_definitions: [{ chapter_no: 1 }, { chapter_no: 2 }],
    chapter_names: [{ tribe_id: A, chapter_no: 1, name: '새내기' }],
  })
  holder.db = db
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('어드민 권한', () => {
  it('어드민이 아니면 GET·PUT 모두 403이고 DB를 부르지 않는다', async () => {
    holder.admin = false
    const get = await GET()
    expect(get.status).toBe(403)
    const res = await put({ changes: [{ tribe_id: A, chapter_no: 1, name: '가' }] })
    expect(res.status).toBe(403)
    expect(db.calls).toEqual([])
  })
})

describe('GET', () => {
  it('트라이브와 챕터 번호와 이름이 있는 칸을 돌려준다', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      tribes: [
        { id: A, name: '러너', isActive: true },
        { id: B, name: '워커', isActive: false },
      ],
      chapterNos: [1, 2],
      cells: [{ tribeId: A, chapterNo: 1, name: '새내기' }],
    })
  })

  it('읽지 못하면 500과 고정 문구다(DB 오류 원문이 없다)', async () => {
    db.failOn.add('chapter_names.select')
    const res = await GET()
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe(CHAPTER_NAMES_READ_ERROR_MESSAGE)
    expect(JSON.stringify(json)).not.toContain('chapter_names.select')
  })
})

describe('PUT', () => {
  it('이름을 저장하고 빈 칸은 지운다', async () => {
    const res = await put({
      changes: [
        { tribe_id: A, chapter_no: 1, name: '' },
        { tribe_id: B, chapter_no: 2, name: ' 단골 ' },
      ],
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, saved: 1, cleared: 1 })
    expect(db.tables.chapter_names.map((r) => [r.tribe_id, r.chapter_no, r.name])).toEqual([[B, 2, '단골']])
  })

  it('본문이 JSON이 아니면 400이다', async () => {
    const res = await put(null, '이건 JSON이 아니에요')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(CHAPTER_NAMES_BODY_INVALID_MESSAGE)
    expect(db.calls).toEqual([])
  })

  it('이름이 너무 길면 400이고 아무것도 쓰지 않는다', async () => {
    const res = await put({ changes: [{ tribe_id: A, chapter_no: 2, name: '가'.repeat(21) }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(CHAPTER_NAMES_TOO_LONG_MESSAGE)
    expect(db.calls).toEqual([])
  })

  it('없는 트라이브면 400이고 아무것도 쓰지 않는다', async () => {
    const res = await put({ changes: [{ tribe_id: MISSING, chapter_no: 1, name: '가' }] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(CHAPTER_NAMES_UNKNOWN_CELL_MESSAGE)
    expect(db.tables.chapter_names).toHaveLength(1)
  })

  it('저장이 실패하면 500과 고정 문구다(DB 오류 원문이 없다)', async () => {
    db.failOn.add('chapter_names.upsert')
    const res = await put({ changes: [{ tribe_id: A, chapter_no: 2, name: '가' }] })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe(CHAPTER_NAMES_SAVE_ERROR_MESSAGE)
    expect(JSON.stringify(json)).not.toContain('chapter_names.upsert')
  })

  it('이름은 저장됐는데 지우기가 실패하면 «일부만 저장됐을 수 있다»는 문구다', async () => {
    db.failOn.add('chapter_names.delete')
    const res = await put({
      changes: [
        { tribe_id: B, chapter_no: 1, name: '가' },
        { tribe_id: A, chapter_no: 1, name: '' },
      ],
    })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe(CHAPTER_NAMES_PARTIAL_ERROR_MESSAGE)
  })
})
