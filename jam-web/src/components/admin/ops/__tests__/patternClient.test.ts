/**
 * 운영 패턴 쓰기 요청 호출 (티켓 20261008_1617) — 던지지 않고 결과를 돌려준다.
 * - 만들기: POST, 본문은 내용 칸 그대로. 고치기: PATCH, 내용 칸 + `expectedUpdatedAt`(받은 문자열 그대로)
 * - 상태 바꾸기: 쉬는 중일 때만 `pauseReason`을 싣는다
 * - 400은 `fieldErrors`(문자열만), 409는 상태 코드, 끊기면 status 0과 고정 문장
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { changeOpsPatternStatusRequest, createOpsPatternRequest, updateOpsPatternRequest } from '../patternClient'
import type { OpsPatternInput } from '@/lib/admin/opsPatterns/input'

const INPUT: OpsPatternInput = {
  name: '이름',
  principle: '원리',
  userExperience: '경험',
  menus: [],
  samples: [],
  cardShapes: [],
  knobs: {
    condition: { open: '', closed: '' },
    place: { open: '', closed: '' },
    time: { open: '', closed: '' },
    reward: { open: '', closed: '' },
    tribe: { rule: '', example: '' },
  },
  pitfalls: '',
}
const PATTERN = { patternNo: 'P19', name: '이름', updatedAt: '2026-10-08T07:05:00.123456+00:00' }

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createOpsPatternRequest', () => {
  it('POST로 내용 칸을 보내고 만든 패턴을 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(201, { pattern: PATTERN }))
    expect(await createOpsPatternRequest(INPUT)).toEqual({ ok: true, pattern: PATTERN, changed: false })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-patterns')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual(INPUT)
  })

  it('409는 상태 코드와 서버 문장을 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '그사이 다른 패턴이 만들어졌어요. 다시 저장해 주세요.' }))
    expect(await createOpsPatternRequest(INPUT)).toEqual({
      ok: false,
      status: 409,
      error: '그사이 다른 패턴이 만들어졌어요. 다시 저장해 주세요.',
      fieldErrors: {},
    })
  })

  it('네트워크가 끊기면 던지지 않고 status 0과 고정 문장을 돌려준다', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    expect(await createOpsPatternRequest(INPUT)).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, fieldErrors: {} })
  })
})

describe('updateOpsPatternRequest', () => {
  it('PATCH 본문에 expectedUpdatedAt을 받은 문자열 그대로 싣는다', async () => {
    fetchMock.mockReturnValue(respond(200, { pattern: PATTERN, changed: true }))
    const result = await updateOpsPatternRequest('P19', INPUT, PATTERN.updatedAt)
    expect(result).toEqual({ ok: true, pattern: PATTERN, changed: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-patterns/P19')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ ...INPUT, expectedUpdatedAt: '2026-10-08T07:05:00.123456+00:00' })
  })

  it('400은 문자열인 fieldErrors만 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(400, { error: '입력한 내용을 확인해 주세요.', fieldErrors: { name: '이름을 적어 주세요.', bad: 3 } }))
    expect(await updateOpsPatternRequest('P19', INPUT, 't0')).toEqual({
      ok: false,
      status: 400,
      error: '입력한 내용을 확인해 주세요.',
      fieldErrors: { name: '이름을 적어 주세요.' },
    })
  })

  it('JSON이 아닌 서버 오류는 고정 문장이다', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>', { status: 502 })))
    expect(await updateOpsPatternRequest('P19', INPUT, 't0')).toMatchObject({
      ok: false,
      status: 502,
      error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    })
  })
})

describe('changeOpsPatternStatusRequest', () => {
  it('쉬는 중으로 바꿀 때만 pauseReason을 싣는다', async () => {
    fetchMock.mockReturnValue(respond(200, { pattern: PATTERN, changed: true }))
    await changeOpsPatternStatusRequest('P19', { status: 'paused', pauseReason: '시즌 끝' }, 't0')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'paused', pauseReason: '시즌 끝', expectedUpdatedAt: 't0' })
    await changeOpsPatternStatusRequest('P19', { status: 'archived', pauseReason: '무시됨' }, 't0')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ status: 'archived', expectedUpdatedAt: 't0' })
  })

  it('409는 상태 코드로 알아본다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '그사이 상태가 바뀌었어요. 최신 내용을 불러와 주세요.' }))
    expect(await changeOpsPatternStatusRequest('P19', { status: 'active' }, 't0')).toMatchObject({ ok: false, status: 409 })
  })
})
