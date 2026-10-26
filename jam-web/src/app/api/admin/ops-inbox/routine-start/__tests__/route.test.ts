/**
 * POST /api/admin/ops-inbox/routine-start — 루틴 시작 기록 라우트 (티켓 20261026_2032)
 *
 * 서비스 클라이언트는 메모리 안의 가짜로 바꾼다. 지키는 것:
 * - 인증: 읽기 토큰 또는 관리자 세션만. 토큰이 없거나 틀리거나 환경변수가 없으면 거부(403)
 * - 저장: 201, 같은 run_key 재전송은 200(덮어쓰지 않음)
 * - 400: JSON 아님·형식 오류·16KB 초과
 * - 500: DB 오류 원문을 응답에 싣지 않는다
 *
 * 실행: cd jam-web && npx vitest run src/app/api/admin/ops-inbox/routine-start/__tests__/route.test.ts
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  failInsert: false,
  user: null as { id: string; email: string } | null,
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'ops_routine_starts') throw new Error(`예상 밖의 테이블: ${table}`)
      return {
        insert: (payload: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              if (h.failInsert) return { data: null, error: { message: 'relation secret_table exploded' } }
              if (h.rows.some((r) => r.run_key === payload.run_key)) {
                return { data: null, error: { code: '23505', message: 'duplicate key value' } }
              }
              const row = { id: `id-${h.rows.length + 1}`, bundle_id: null, ...payload }
              h.rows.push(row)
              return { data: { id: row.id }, error: null }
            },
          }),
        }),
      }
    },
  }),
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))

import { POST } from '../route'
import { MAX_ROUTINE_START_BODY_BYTES } from '@/lib/admin/opsInbox/constants'

const TOKEN = 'test-admin-read-token-abcdef'
const URL_OK = 'http://localhost/api/admin/ops-inbox/routine-start'
const ENV_KEYS = ['ADMIN_API_READ_TOKEN', 'ADMIN_EMAILS'] as const
const BODY = { run_key: 'weekly-2026-W44-a', week: '2026-W44', author: '윤진', agents: ['윤진', '윈터'] }

function send(body: unknown, options: { token?: string | null; url?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.token !== null) headers['x-admin-read-token'] = options.token ?? TOKEN
  return POST(new Request(options.url ?? URL_OK, { method: 'POST', headers, body: options.raw ?? JSON.stringify(body) }))
}

describe('POST /api/admin/ops-inbox/routine-start', () => {
  const saved: Record<string, string | undefined> = {}
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key]
    process.env.ADMIN_API_READ_TOKEN = TOKEN
    process.env.ADMIN_EMAILS = 'admin@example.com'
    h.rows = []
    h.failInsert = false
    h.user = null
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })

  describe('저장', () => {
    it('읽기 토큰으로 보내면 201이고 한 행이 저장된다', async () => {
      const res = await send(BODY)
      expect(res.status).toBe(201)
      expect(await res.json()).toMatchObject({ status: 'created', run_key: BODY.run_key })
      expect(h.rows).toHaveLength(1)
      expect(h.rows[0]).toMatchObject({ run_key: BODY.run_key, week: '2026-W44', author: '윤진', agents: ['윤진', '윈터'], bundle_id: null })
    })

    it('week 없이도 저장된다', async () => {
      const res = await send({ run_key: 'k', author: '윤진', agents: [] })
      expect(res.status).toBe(201)
      expect(h.rows[0].week).toBeNull()
    })

    it('같은 run_key를 다시 보내면 200이고 덮어쓰지 않는다', async () => {
      await send(BODY)
      const res = await send({ ...BODY, author: '다른이' })
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ status: 'duplicate' })
      expect(h.rows).toHaveLength(1)
      expect(h.rows[0].author).toBe('윤진')
    })
  })

  describe('인증', () => {
    it('토큰이 없고 세션도 없으면 403이고 저장하지 않는다', async () => {
      const res = await send(BODY, { token: null })
      expect(res.status).toBe(403)
      expect(h.rows).toHaveLength(0)
    })

    it('틀린 토큰이면 403', async () => {
      expect((await send(BODY, { token: 'wrong' })).status).toBe(403)
      expect(h.rows).toHaveLength(0)
    })

    it('환경변수가 없으면 올바른 값을 보내도 403', async () => {
      delete process.env.ADMIN_API_READ_TOKEN
      expect((await send(BODY)).status).toBe(403)
      expect(h.rows).toHaveLength(0)
    })

    it.each(['/api/admin/ops-inbox/routine-start/', '/api/admin/ops-inbox/routine-start/x', '/api/admin/ops-inbox/other'])(
      '토큰이 맞아도 경로 %s는 세션 검사로 넘어가 403',
      async (pathname) => {
        const res = await send(BODY, { url: `http://localhost${pathname}` })
        expect(res.status).toBe(403)
        expect(h.rows).toHaveLength(0)
      }
    )

    it('관리자 로그인 세션이면 토큰 없이도 저장된다', async () => {
      h.user = { id: 'admin-1', email: 'admin@example.com' }
      const res = await send(BODY, { token: null })
      expect(res.status).toBe(201)
    })
  })

  describe('400', () => {
    it('JSON이 아니면 400', async () => {
      const res = await send(null, { raw: '{not json' })
      expect(res.status).toBe(400)
      expect(h.rows).toHaveLength(0)
    })

    it('형식이 틀리면 400이고 details에 사유를 담는다', async () => {
      const res = await send({ run_key: '', author: 1, agents: 'x' })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.details).toHaveLength(3)
      expect(h.rows).toHaveLength(0)
    })

    it('본문이 16KB를 넘으면 400', async () => {
      const res = await send({ ...BODY, pad: 'x'.repeat(MAX_ROUTINE_START_BODY_BYTES) })
      expect(res.status).toBe(400)
      expect(h.rows).toHaveLength(0)
    })
  })

  it('저장 실패는 500이고 DB 오류 원문을 응답에 싣지 않는다', async () => {
    h.failInsert = true
    const res = await send(BODY)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret_table')
  })
})
