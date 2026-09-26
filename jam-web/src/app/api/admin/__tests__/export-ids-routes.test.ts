/**
 * UUID `ids`를 받는 어드민 export 라우트 10곳이 공용 `parseExportIds`로 요청을 거른다(티켓 20260926_1412).
 * UUID가 아닌 값·상한 초과는 DB에 닿기 전에 400으로 거절되고, 빈 선택은 각 라우트의 기존 문구를 유지하며,
 * 유효한 요청은 검증을 통과해 DB 조회 단계로 넘어간다.
 * 제외한 라우트: `badge-families/export`(ids가 UUID가 아닌 계열 키).
 * 실행: cd jam-web && npx vitest run src/app/api/admin/__tests__/export-ids-routes.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const createServiceClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createServiceClient }))
vi.mock('@/lib/admin/auth', () => ({ requireAdmin: async () => null }))

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const ROUTES: Array<{ path: string; load: () => Promise<{ POST: (req: NextRequest) => Promise<Response> }>; empty: string }> = [
  { path: 'badges', load: () => import('../badges/export/route'), empty: '내보낼 배지를 선택해주세요.' },
  { path: 'item-badges', load: () => import('../item-badges/export/route'), empty: '내보낼 아이템배지를 선택해주세요.' },
  { path: 'item-badges/orphaned', load: () => import('../item-badges/orphaned/export/route'), empty: '내보낼 개체를 선택해주세요.' },
  { path: 'itembooks', load: () => import('../itembooks/export/route'), empty: '내보낼 컬렉션을 선택해주세요.' },
  { path: 'missions', load: () => import('../missions/export/route'), empty: '내보낼 미션을 선택해주세요.' },
  { path: 'poi', load: () => import('../poi/export/route'), empty: '내보낼 POI를 선택해주세요.' },
  { path: 'points/ledger', load: () => import('../points/ledger/export/route'), empty: '내보낼 원장을 선택해주세요.' },
  { path: 'recipes', load: () => import('../recipes/export/route'), empty: '내보낼 레시피를 선택해주세요.' },
  { path: 'today', load: () => import('../today/export/route'), empty: '내보낼 카드를 선택해 주세요.' },
  { path: 'users', load: () => import('../users/export/route'), empty: '내보낼 유저를 선택해주세요.' },
]

async function call(load: (typeof ROUTES)[number]['load'], path: string, body: unknown): Promise<Response | null> {
  const { POST } = await load()
  const req = new NextRequest(`https://j-a-m.app/api/admin/${path}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  try {
    return await POST(req)
  } catch {
    // 검증을 통과해 DB 단계까지 갔지만 이 테스트의 DB 대역이 던진 경우
    return null
  }
}

beforeEach(() => {
  createServiceClient.mockReset()
  createServiceClient.mockImplementation(() => {
    throw new Error('DB 대역: 이 테스트는 DB 조회를 하지 않는다')
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe.each(ROUTES)('POST /api/admin/$path/export ids 검증', ({ path, load, empty }) => {
  it('UUID가 아닌 값이 섞이면 400과 안내 문구를 돌려주고 DB에 닿지 않는다', async () => {
    const res = await call(load, path, { ids: [uuid(1), 'a; drop table'] })
    expect(res?.status).toBe(400)
    const { error } = await res!.json()
    expect(error).toBe('선택한 항목의 식별자 형식이 올바르지 않습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.')
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('1,000건을 넘으면 400으로 거절하고 DB에 닿지 않는다', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => uuid(i))
    const res = await call(load, path, { ids })
    expect(res?.status).toBe(400)
    const { error } = await res!.json()
    expect(error).toBe('한 번에 최대 1,000건까지 내보낼 수 있습니다. 선택을 줄여 다시 시도해 주세요.')
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('빈 선택은 이 라우트의 기존 문구로 400을 돌려준다', async () => {
    const res = await call(load, path, { ids: [] })
    expect(res?.status).toBe(400)
    expect((await res!.json()).error).toBe(empty)
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('유효한 UUID 목록은 검증을 통과해 DB 조회 단계로 넘어간다', async () => {
    const res = await call(load, path, { ids: [uuid(1), uuid(2)] })
    expect(res?.status).not.toBe(400)
    expect(createServiceClient).toHaveBeenCalled()
  })
})
