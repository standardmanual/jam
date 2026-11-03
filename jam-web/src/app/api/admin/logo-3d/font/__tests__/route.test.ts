/**
 * /api/admin/logo-3d/font — 구글 폰트 TTF 중계 (티켓 20261103_1351)
 * 네트워크는 fetch 목으로 바꾸고, 권한·입력 검증·요청 주소·응답 헤더만 본다.
 * 실행: cd jam-web && npx vitest run src/app/api/admin/logo-3d/font/__tests__/route.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

let sessionUser: { id: string; email: string } | null = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@jam.app' }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
  // 화이트리스트에 없는 사용자의 users.is_admin 조회 — 어드민이 아닌 행을 돌려준다.
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_admin: false }, error: null }) }) }) }),
  }),
}))

const { GET } = await import('../route')

const TTF_BYTES = new Uint8Array([0, 1, 0, 0, 0, 18, 1, 0])
const FILE_URL = 'https://fonts.gstatic.com/s/notosanskr/v40/abc.ttf'

function req(query: string): NextRequest {
  return new NextRequest(`https://j-a-m.app/api/admin/logo-3d/font${query}`)
}

function cssWith(url: string): string {
  return `@font-face {\n  font-family: 'Noto Sans KR';\n  src: url(${url}) format('truetype');\n}`
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', 'admin@jam.app')
  vi.stubEnv('ADMIN_API_READ_TOKEN', '')
  sessionUser = { id: '00000000-0000-4000-8000-0000000000aa', email: 'admin@jam.app' }
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('권한', () => {
  it('로그인하지 않은 요청은 403이고 외부 요청을 하지 않는다', async () => {
    sessionUser = null
    const res = await GET(req('?family=Noto+Sans+KR&weight=700'))
    expect([401, 403]).toContain(res.status)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('어드민이 아닌 로그인 사용자는 막는다', async () => {
    sessionUser = { id: '00000000-0000-4000-8000-0000000000bb', email: 'someone@example.com' }
    const res = await GET(req('?family=Noto+Sans+KR&weight=700'))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('입력 검증', () => {
  it('카탈로그에 없는 family는 400이다 (임의 주소 요청 차단)', async () => {
    for (const family of ['Not A Real Font', 'Roboto&x=1', '../../etc', 'https://evil.example/a']) {
      const res = await GET(req(`?family=${encodeURIComponent(family)}&weight=400`))
      expect(res.status).toBe(400)
    }
    expect((await GET(req('?weight=400'))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('허용되지 않은 weight는 400이다', async () => {
    for (const weight of ['450', '0', '1000', '1', 'bold', '700;', '07']) {
      const res = await GET(req(`?family=Roboto&weight=${encodeURIComponent(weight)}`))
      expect(res.status).toBe(400)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('오류 메시지는 [현상] → [원인] → [해결책] 순서의 한국어다', async () => {
    const res = await GET(req('?family=Nope'))
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe(
      '폰트를 불러오지 못했어요. 목록에 없는 폰트 이름이에요. 폰트 검색 결과에서 고른 이름으로 다시 시도해 주세요.'
    )
  })
})

describe('정상 요청', () => {
  it('구형 사용자 에이전트로 스타일시트를 받아 TTF 바이트와 캐시 헤더를 돌려준다', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(cssWith(FILE_URL), { status: 200 }))
      .mockResolvedValueOnce(new Response(TTF_BYTES, { status: 200 }))

    const res = await GET(req('?family=Noto+Sans+KR&weight=700'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('font/ttf')
    expect(res.headers.get('cache-control')).toContain('max-age=')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(TTF_BYTES)

    const [cssUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(cssUrl).toBe('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700')
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/Safari\/531/)
    expect(fetchMock.mock.calls[1][0]).toBe(FILE_URL)
  })

  it('weight를 생략하면 400 굵기로 요청한다', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(cssWith(FILE_URL), { status: 200 }))
      .mockResolvedValueOnce(new Response(TTF_BYTES, { status: 200 }))
    await GET(req('?family=Roboto'))
    expect(fetchMock.mock.calls[0][0]).toBe('https://fonts.googleapis.com/css2?family=Roboto:wght@400')
  })
})

describe('외부 응답 처리', () => {
  it('fonts.gstatic.com이 아닌 주소는 받아 오지 않는다 (SSRF 차단)', async () => {
    for (const evil of [
      'https://evil.example/a.ttf',
      'http://fonts.gstatic.com/a.ttf',
      'https://fonts.gstatic.com.evil.example/a.ttf',
      'https://169.254.169.254/latest/meta-data',
    ]) {
      fetchMock.mockReset().mockResolvedValueOnce(new Response(cssWith(evil), { status: 200 }))
      const res = await GET(req('?family=Roboto&weight=400'))
      expect(res.status).toBe(502)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it('고른 굵기가 없는 폰트는 404와 안내 메시지다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad', { status: 400 }))
    const res = await GET(req('?family=Roboto&weight=100'))
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: string }).error).toContain('고른 굵기의 파일이 없어요')
  })

  it('구글 서버가 실패하면 502와 한국어 오류이고 원문은 싣지 않는다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET secret-detail'))
    const res = await GET(req('?family=Roboto&weight=400'))
    expect(res.status).toBe(502)
    const text = JSON.stringify(await res.json())
    expect(text).toContain('잠시 뒤 다시 시도해 주세요')
    expect(text).not.toContain('secret-detail')
  })

  it('폰트 파일 요청이 실패하면 502다', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(cssWith(FILE_URL), { status: 200 }))
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
    const res = await GET(req('?family=Roboto&weight=400'))
    expect(res.status).toBe(502)
  })
})
