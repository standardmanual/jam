/**
 * /api/admin/activity-badge-templates (GET 목록)와 [classKey] (PUT 저장·DELETE 삭제) — 티켓 20261116_0234
 *
 * 고정하는 것:
 * - 권한이 없으면 세 메서드 모두 403이고 DB를 건드리지 않는다.
 * - GET: 아무것도 등록되지 않아도 네 분류를 metric·days·streak·count 순서로 돌려준다.
 * - PUT: 분류·본문·크기·SVG 형식·자리 문제는 400이고 DB에 쓰지 않는다. 정상이면 정화한 SVG와 자리, 관리자 이메일을 upsert한다.
 * - DELETE: 없는 분류여도 200, 분류가 틀리면 400.
 *
 * 실제 공용 DB는 호출하지 않는다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/activity-badge-templates
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  admin: null as { id: string; email: string } | null,
  rows: [] as Array<Record<string, unknown>>,
  upsert: vi.fn(),
  del: vi.fn(),
  dbError: null as { message: string } | null,
}))

vi.mock('@/lib/admin/auth', () => ({ getAdminUser: async () => h.admin }))
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: async () => ({ data: h.rows, error: h.dbError }),
      upsert: (payload: Record<string, unknown>, opts: unknown) => {
        h.upsert(payload, opts)
        return {
          select: () => ({
            single: async () => ({
              data: h.dbError ? null : { ...payload },
              error: h.dbError,
            }),
          }),
        }
      },
      delete: () => ({
        eq: async (col: string, val: string) => {
          h.del(col, val)
          return { error: h.dbError }
        },
      }),
    }),
  }),
}))

import { GET } from '../route'
import { PUT, DELETE } from '../[classKey]/route'

const text = (id: string, label: string) =>
  `<text id="${id}" fill="#123B2E" font-family="Pretendard" font-size="48"><tspan x="120" y="96">${label}</tspan></text>`
const okSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${text('name', '이름')}${text('value', '값')}</svg>`

const put = (classKey: string, body: unknown) =>
  PUT(new NextRequest(`http://localhost/api/admin/activity-badge-templates/${classKey}`, { method: 'PUT', body: JSON.stringify(body) }), {
    params: Promise.resolve({ classKey }),
  })
const del = (classKey: string) =>
  DELETE(new NextRequest(`http://localhost/api/admin/activity-badge-templates/${classKey}`, { method: 'DELETE' }), {
    params: Promise.resolve({ classKey }),
  })

beforeEach(() => {
  h.admin = { id: 'admin-1', email: 'admin@jam.test' }
  h.rows = []
  h.dbError = null
  h.upsert.mockReset()
  h.del.mockReset()
})

describe('어드민이 아니면 403', () => {
  it('세 메서드 모두 DB에 닿지 않는다', async () => {
    h.admin = null
    expect((await GET()).status).toBe(403)
    expect((await put('metric', { svg: okSvg })).status).toBe(403)
    expect((await del('metric')).status).toBe(403)
    expect(h.upsert).not.toHaveBeenCalled()
    expect(h.del).not.toHaveBeenCalled()
  })
})

describe('GET', () => {
  it('등록된 것이 없어도 네 분류를 순서대로 돌려준다', async () => {
    const res = await GET()
    const { templates } = await res.json()
    expect(templates.map((t: { classKey: string }) => t.classKey)).toEqual(['metric', 'days', 'streak', 'count'])
    expect(templates[0]).toEqual({
      classKey: 'metric',
      label: '운동 수치',
      svg: null,
      slots: null,
      updatedAt: null,
      updatedBy: null,
    })
  })

  it('등록된 분류는 본문과 수정 정보를 싣는다', async () => {
    h.rows = [{ class_key: 'days', svg: '<svg/>', slots: { a: 1 }, updated_at: '2026-11-16T00:00:00Z', updated_by: 'a@b.c' }]
    const { templates } = await (await GET()).json()
    expect(templates[1]).toMatchObject({ classKey: 'days', svg: '<svg/>', slots: { a: 1 }, updatedBy: 'a@b.c' })
    expect(templates[0].svg).toBeNull()
  })

  it('조회 실패는 500이고 DB 원문을 싣지 않는다', async () => {
    h.dbError = { message: 'secret db detail' }
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })
})

describe('PUT 400', () => {
  const noWrite = () => expect(h.upsert).not.toHaveBeenCalled()

  it('분류가 틀리면 400', async () => {
    expect((await put('nope', { svg: okSvg })).status).toBe(400)
    noWrite()
  })

  it('svg가 문자열이 아니거나 비어 있으면 400', async () => {
    expect((await put('metric', {})).status).toBe(400)
    expect((await put('metric', { svg: 3 })).status).toBe(400)
    expect((await put('metric', { svg: '  ' })).status).toBe(400)
    noWrite()
  })

  it('1,000,000바이트를 넘으면 400', async () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg"><!--${'a'.repeat(1_000_001)}--></svg>`
    expect((await put('metric', { svg: big })).status).toBe(400)
    noWrite()
  })

  it('SVG로 읽지 못하면 400', async () => {
    expect((await put('metric', { svg: '<svg><g></svg>' })).status).toBe(400)
    expect((await put('metric', { svg: '<html/>' })).status).toBe(400)
    noWrite()
  })

  it('이름 자리·값 자리가 없으면 400이고 안내가 name·value를 말한다', async () => {
    const noName = `<svg xmlns="http://www.w3.org/2000/svg">${text('value', '값')}</svg>`
    const r1 = await put('metric', { svg: noName })
    expect(r1.status).toBe(400)
    expect((await r1.json()).error).toContain('name')
    const noValue = `<svg xmlns="http://www.w3.org/2000/svg">${text('name', '이름')}</svg>`
    const r2 = await put('metric', { svg: noValue })
    expect(r2.status).toBe(400)
    expect((await r2.json()).error).toContain('value')
    noWrite()
  })

  it('자리가 글자가 아니면 400', async () => {
    const outlined = `<svg xmlns="http://www.w3.org/2000/svg"><path id="name" d="M0 0"/>${text('value', '값')}</svg>`
    expect((await put('metric', { svg: outlined })).status).toBe(400)
    noWrite()
  })
})

describe('PUT 성공', () => {
  it('정화한 SVG와 자리, 관리자 이메일을 upsert하고 removed를 돌려준다', async () => {
    const dirty = okSvg.replace('<text id="name"', '<script>x()</script><text onclick="y()" id="name"')
    const res = await put('streak', { svg: dirty })
    expect(res.status).toBe(200)
    expect(h.upsert).toHaveBeenCalledTimes(1)
    const [payload, opts] = h.upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'class_key' })
    expect(payload).toMatchObject({ class_key: 'streak', updated_by: 'admin@jam.test' })
    expect(payload.svg).not.toMatch(/script|onclick/)
    expect(payload.slots.name).toMatchObject({ found: true, isText: true, x: 120, fontSize: 48 })
    expect(typeof payload.updated_at).toBe('string')
    const json = await res.json()
    expect(json.removed.length).toBe(2)
    expect(json.template).toMatchObject({ classKey: 'streak', label: '이어 온 날', updatedBy: 'admin@jam.test' })
  })

  it('저장 실패는 500이고 DB 원문을 싣지 않는다', async () => {
    h.dbError = { message: 'secret db detail' }
    const res = await put('metric', { svg: okSvg })
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })
})

describe('DELETE', () => {
  it('없는 분류의 템플릿이어도 200이다', async () => {
    const res = await del('count')
    expect(res.status).toBe(200)
    expect(h.del).toHaveBeenCalledWith('class_key', 'count')
  })

  it('분류가 틀리면 400이고 지우지 않는다', async () => {
    expect((await del('nope')).status).toBe(400)
    expect(h.del).not.toHaveBeenCalled()
  })
})
