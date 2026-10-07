/**
 * postItemImage — 이미지 업로드 요청 검증 (티켓 20261007_0945)
 * 실행: cd jam-web && npx vitest run src/components/admin/ops/__tests__/imageClient.test.ts
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { postItemImage } from '../imageClient'

const BUNDLE = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'
const blob = new Blob(['png'], { type: 'image/png' })

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('postItemImage', () => {
  it('FormData(image 필드, PNG)로 POST하고 성공하면 주소를 돌려준다', async () => {
    const fetchMock = respond(200, { ok: true, url: 'https://x.test/a.webp?v=1', webpBytes: 10 })
    vi.stubGlobal('fetch', fetchMock)
    const result = await postItemImage(BUNDLE, ITEM, blob)
    expect(result).toEqual({ ok: true, url: 'https://x.test/a.webp?v=1' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/admin/ops-inbox/${BUNDLE}/items/${ITEM}/image`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    const file = (init.body as FormData).get('image') as File
    expect(file.type).toBe('image/png')
  })

  it.each([
    [400, '이미지 형식이 올바르지 않아요'],
    [403, '관리자 권한이 필요해요'],
    [404, '찾을 수 없는 항목이에요'],
    [500, '이미지를 저장하지 못했어요'],
  ])('%i는 고정 한국어 메시지로 돌려준다(서버 원문은 싣지 않는다)', async (status, expected) => {
    vi.stubGlobal('fetch', respond(status, { error: 'DB internal error xyz' }))
    const result = await postItemImage(BUNDLE, ITEM, blob)
    expect(result).toMatchObject({ ok: false, status })
    expect(result.ok === false && result.message).toContain(expected)
    expect(result.ok === false && result.message).not.toContain('xyz')
  })

  it('409는 서버가 이유를 실었으면 그 문장을, 시험 묶음 문장도 그대로 돌려준다', async () => {
    vi.stubGlobal('fetch', respond(409, { error: '시험 묶음은 자원이 없어 이미지를 저장하지 않아요.' }))
    expect(await postItemImage(BUNDLE, ITEM, blob)).toEqual({
      ok: false,
      status: 409,
      message: '시험 묶음은 자원이 없어 이미지를 저장하지 않아요.',
    })
  })

  it('409에 서버 문장이 없으면 고정 문장이다', async () => {
    vi.stubGlobal('fetch', respond(409, 'not json'))
    const result = await postItemImage(BUNDLE, ITEM, blob)
    expect(result).toMatchObject({ ok: false, status: 409 })
    expect(result.ok === false && result.message).toContain('이미지를 저장할 수 없어요')
  })

  it('그 밖의 상태는 고정 문장이고, 네트워크가 끊기면 status 0이다. 던지지 않는다', async () => {
    vi.stubGlobal('fetch', respond(502, 'bad gateway'))
    expect(await postItemImage(BUNDLE, ITEM, blob)).toMatchObject({ ok: false, status: 502 })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await postItemImage(BUNDLE, ITEM, blob)).toMatchObject({ ok: false, status: 0 })
  })

  it('성공 응답에 주소가 없으면 실패로 돌려준다', async () => {
    vi.stubGlobal('fetch', respond(200, { ok: true }))
    expect(await postItemImage(BUNDLE, ITEM, blob)).toMatchObject({ ok: false, status: 200 })
  })
})
