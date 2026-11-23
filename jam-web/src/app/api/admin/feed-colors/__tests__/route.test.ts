/**
 * GET·PUT /api/admin/feed-colors — 인증·검증·저장·삭제·캐시 무효화 (티켓 20261121_2146)
 * DB는 기록형 스텁이다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/feed-colors/__tests__/route.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const state = vi.hoisted(() => ({
  authorized: true,
  rows: [] as { color_key: string; hex: string }[],
  upserts: [] as Record<string, unknown>[][],
  deletes: [] as string[][],
  upsertError: null as { message: string } | null,
  invalidated: 0,
}))

const fakeClient = {
  from: (table: string) => {
    expect(table).toBe('feed_color_overrides')
    return {
      select: () => Promise.resolve({ data: state.rows, error: null }),
      upsert: (rows: Record<string, unknown>[]) => {
        state.upserts.push(rows)
        if (!state.upsertError) {
          for (const row of rows) {
            state.rows = state.rows.filter((r) => r.color_key !== row.color_key)
            state.rows.push({ color_key: String(row.color_key), hex: String(row.hex) })
          }
        }
        return Promise.resolve({ error: state.upsertError })
      },
      delete: () => ({
        in: (_column: string, keys: string[]) => {
          state.deletes.push(keys)
          state.rows = state.rows.filter((r) => !keys.includes(r.color_key))
          return Promise.resolve({ error: null })
        },
      }),
    }
  },
}

vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => fakeClient }))
vi.mock('@/lib/admin/auth', () => ({
  requireAdmin: async () =>
    state.authorized ? null : NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 }),
  getAdminUser: async () => (state.authorized ? { id: 'admin-1', email: 'a@example.com' } : null),
}))
vi.mock('@/lib/today/feedColorOverridesServer', () => ({
  invalidateFeedColors: () => {
    state.invalidated += 1
  },
}))

const { GET, PUT } = await import('../route')

const put = (body: unknown, raw?: string) =>
  PUT(
    new NextRequest('https://j-a-m.app/api/admin/feed-colors', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    }),
  )

beforeEach(() => {
  state.authorized = true
  state.rows = []
  state.upserts = []
  state.deletes = []
  state.upsertError = null
  state.invalidated = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('인증', () => {
  it('어드민이 아니면 GET·PUT 모두 거절하고 아무것도 쓰지 않는다', async () => {
    state.authorized = false
    expect((await GET()).status).toBe(403)
    const res = await put({ overrides: { red: '#aabbcc' } })
    expect(res.status).toBe(403)
    expect(state.upserts).toEqual([])
    expect(state.deletes).toEqual([])
    expect(state.invalidated).toBe(0)
  })
})

describe('GET', () => {
  it('저장된 덮어쓰기와 9색 기본값(소문자)을 돌려준다', async () => {
    state.rows = [{ color_key: 'red', hex: '#AABBCC' }]
    const body = await (await GET()).json()
    expect(body.overrides).toEqual({ red: '#aabbcc' })
    expect(Object.keys(body.defaults)).toHaveLength(9)
    expect(body.defaults.red).toBe('#ff1d1d')
  })
})

describe('PUT 검증', () => {
  it('잘못된 hex는 400이고 아무것도 저장하지 않는다', async () => {
    for (const hex of ['aabbcc', '#abc', '#gggggg', 12, '']) {
      const res = await put({ overrides: { red: hex } })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toContain('red')
    }
    expect(state.upserts).toEqual([])
    expect(state.invalidated).toBe(0)
  })

  it('모르는 키는 400이다(같은 요청의 올바른 값도 저장하지 않는다)', async () => {
    const res = await put({ overrides: { red: '#aabbcc', black: '#000000' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('black')
    expect(state.upserts).toEqual([])
  })

  it('본문이 JSON이 아니거나 overrides가 객체가 아니거나 비어 있으면 400이다', async () => {
    expect((await put(null, '{깨진')).status).toBe(400)
    expect((await put({ overrides: ['red'] })).status).toBe(400)
    expect((await put({})).status).toBe(400)
    expect((await put({ overrides: {} })).status).toBe(400)
  })

  it('키가 9개를 넘거나 본문이 너무 크면 400이다', async () => {
    const many = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, '#aabbcc']))
    expect((await put({ overrides: many })).status).toBe(400)
    expect((await put({ overrides: { red: '#aabbcc' }, memo: 'x'.repeat(3000) })).status).toBe(400)
    expect(state.upserts).toEqual([])
  })
})

describe('PUT 저장', () => {
  it('hex는 소문자로 upsert하고 updated_by에 관리자 id를 남기고 태그를 무효화한다', async () => {
    const res = await put({ overrides: { red: '#AABBCC', 'green': '#112233' } })
    expect(res.status).toBe(200)
    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0]).toEqual([
      expect.objectContaining({ color_key: 'red', hex: '#aabbcc', updated_by: 'admin-1' }),
      expect.objectContaining({ color_key: 'green', hex: '#112233', updated_by: 'admin-1' }),
    ])
    expect(state.invalidated).toBe(1)
    expect((await res.json()).overrides).toEqual({ red: '#aabbcc', 'green': '#112233' })
  })

  it('null이면 그 키의 행을 지운다(기본값 복원)', async () => {
    state.rows = [
      { color_key: 'red', hex: '#aabbcc' },
      { color_key: 'blue', hex: '#001122' },
    ]
    const res = await put({ overrides: { red: null } })
    expect(res.status).toBe(200)
    expect(state.deletes).toEqual([['red']])
    expect(state.upserts).toEqual([])
    expect(state.invalidated).toBe(1)
    expect((await res.json()).overrides).toEqual({ blue: '#001122' })
  })

  it('저장과 삭제를 한 요청에 섞을 수 있다', async () => {
    const res = await put({ overrides: { red: '#aabbcc', blue: null } })
    expect(res.status).toBe(200)
    expect(state.upserts).toHaveLength(1)
    expect(state.deletes).toEqual([['blue']])
  })

  it('저장이 실패하면 500과 안내 문구를 주고 오류 원문을 내보내지 않는다', async () => {
    state.upsertError = { message: 'permission denied for table feed_color_overrides' }
    const res = await put({ overrides: { red: '#aabbcc' } })
    expect(res.status).toBe(500)
    const { error } = await res.json()
    expect(error).not.toContain('permission denied')
    expect(state.invalidated).toBe(0)
  })
})
