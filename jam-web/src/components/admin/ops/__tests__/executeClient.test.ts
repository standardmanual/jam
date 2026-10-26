/**
 * 예약 등록·공개 전 취소·지금 종료 요청 호출 (티켓 20261002_1648, 20261002_1649, 20261006_1038) — `postExecute`·`postCancel`·`postEnd`
 *
 * 요약창과 주 버튼, 취소 확인창이 기대는 결과 모양을 고정한다(던지지 않고 결과를 돌려준다):
 * - 요청 형식: POST, 본문 JSON(`{ dryRun: true }`·`{ badgePreview: true }`(티켓 20261005_1607) 또는 `{ itemIds }`), 묶음 ID는 주소에 싣는다
 * - 200: 응답 본문을 그대로 돌려준다
 * - 409: 서버 문장에 「화면을 새로 불러왔어요」를 덧붙여 상태 코드로 알아본다(`postDecision`과 같다)
 * - 500·서버 문장이 없는 오류: 서버 문장 또는 고정 문장
 * - 네트워크가 끊기면 status 0과 고정 문장(NETWORK_ERROR_MESSAGE)이고 던지지 않는다
 * - `fetchBadgePreview`(티켓 20261005_1607): `{ badgePreview: true }`를 보내 응답을 배지 구역 상태로 바꾸고, 어떤 실패도 던지지 않고 `failed`로 돌려준다
 * - `postCancel`은 같은 규칙을 항목 주소(`items/[itemId]/cancel`)에 적용하고, 본문은 `{ dryRun: true }`·`{ reason }`·`{}`다
 * - `postEnd`는 항목 주소(`items/[itemId]/end`)에 같은 규칙을 적용한다. 되돌림 실패 500의 `itemEnded`는 `data`에 남는다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { fetchBadgePreview, postCancel, postEnd, postExecute } from '../executeClient'

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

describe('postExecute', () => {
  it('사전 점검은 POST로 { dryRun: true }를 JSON으로 보낸다', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true, dryRun: true, ready: ['a'] }))
    const result = await postExecute('bundle-1', { dryRun: true })
    expect(result).toEqual({ ok: true, data: { ok: true, dryRun: true, ready: ['a'] } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-inbox/bundle-1/execute')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ dryRun: true })
  })

  it('배지 미리 세기는 같은 주소로 { badgePreview: true }를 JSON으로 보낸다', async () => {
    const body = { ok: true, badgePreview: { totalUsers: 0, evaluatedUsers: 0, sampled: false, failedUsers: 0, lines: [] } }
    fetchMock.mockReturnValue(respond(200, body))
    expect(await postExecute('bundle-1', { badgePreview: true })).toEqual({ ok: true, data: body })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-inbox/bundle-1/execute')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ badgePreview: true })
  })

  it('approve: true는 사전 점검·실행 본문에 그대로 실린다(승인하고 예약, 티켓 20261026_2031)', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true }))
    await postExecute('bundle-1', { dryRun: true, approve: true })
    await postExecute('bundle-1', { itemIds: ['a'], approve: true })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ dryRun: true, approve: true })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ itemIds: ['a'], approve: true })
  })

  it('실행은 { itemIds }를 보내고 200이면 응답을 그대로 돌려준다', async () => {
    const body = { ok: true, scheduled: ['a', 'b'], failed: [], skipped: [], excludedCount: 0 }
    fetchMock.mockReturnValue(respond(200, body))
    expect(await postExecute('bundle-1', { itemIds: ['a', 'b'] })).toEqual({ ok: true, data: body })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ itemIds: ['a', 'b'] })
  })

  it('409는 서버 문장에 「화면을 새로 불러왔어요」를 덧붙이고 상태 코드로 알아본다', async () => {
    fetchMock.mockReturnValue(
      respond(409, { error: '예약할 수 있는 항목이 없어요. 이미 다른 곳에서 처리했거나 그사이 바뀐 항목이에요.', skipped: [{ id: 'a', reason: '이미 다른 곳에서 처리한 항목이에요' }] })
    )
    const result = await postExecute('bundle-1', { itemIds: ['a'] })
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: '예약할 수 있는 항목이 없어요. 이미 다른 곳에서 처리했거나 그사이 바뀐 항목이에요. 화면을 새로 불러왔어요.',
    })
    // 서버가 함께 실은 값(건너뛴 항목)은 data에 남는다
    expect(result.ok === false && result.data.skipped).toEqual([{ id: 'a', reason: '이미 다른 곳에서 처리한 항목이에요' }])
  })

  it('500은 서버 문장을 그대로 돌려준다(화면을 새로 불러왔다는 말을 붙이지 않는다)', async () => {
    fetchMock.mockReturnValue(respond(500, { error: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.' }))
    expect(await postExecute('bundle-1', { itemIds: ['a'] })).toEqual({
      ok: false,
      status: 500,
      error: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
      data: { error: '예약 등록하지 못했어요. 잠시 뒤 다시 눌러 주세요.' },
    })
  })

  it('서버 문장이 없는 오류는 고정 문장이다', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>oops</html>', { status: 502 })))
    expect(await postExecute('bundle-1', { dryRun: true })).toEqual({
      ok: false,
      status: 502,
      error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      data: {},
    })
  })

  it('네트워크가 끊기면 던지지 않고 status 0과 고정 문장이다(영어 원문을 노출하지 않는다)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await postExecute('bundle-1', { itemIds: ['a'] })
    expect(result).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, data: {} })
    expect(JSON.stringify(result)).not.toContain('Failed to fetch')
  })
})

describe('fetchBadgePreview', () => {
  const items = [{ id: 'b1', position: 1, kind: 'jam_badge', startsAt: '2026-10-10T00:00:00Z', original: { user_experience: '첫 믹스 배지' }, edited: null }]
  const ok = { totalUsers: 40, evaluatedUsers: 40, sampled: false, failedUsers: 0, lines: [{ itemId: 'b1', status: 'counted', userCount: 12, points: 120 }] }

  it('{ badgePreview: true, approve: true }를 보내고 응답을 완료 상태(줄·안내)로 바꾼다', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true, badgePreview: ok }))
    const section = await fetchBadgePreview('bundle-1', items)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ badgePreview: true, approve: true })
    expect(section).toEqual({
      status: 'done',
      lines: [{ id: 'b1', name: 'JAM! 배지 · 10/10(토) 09:00 시작 · 첫 믹스 배지', text: '공개되면 약 12명에게 120포인트' }],
      notes: [],
    })
  })

  it('대상 항목을 주면 그 항목의 줄만 싣는다(체크하지 않은 검토중 배지는 뺀다)', async () => {
    const two = [...items, { ...items[0], id: 'b2', position: 2 }]
    const lines = [...ok.lines, { itemId: 'b2', status: 'counted', userCount: 3, points: 30 }]
    fetchMock.mockReturnValue(respond(200, { ok: true, badgePreview: { ...ok, lines } }))
    const section = await fetchBadgePreview('bundle-1', two, new Set(['b1']))
    expect(section.status === 'done' && section.lines.map((line) => line.id)).toEqual(['b1'])
  })

  it('서버 오류·권한 오류·네트워크 오류는 던지지 않고 failed다', async () => {
    for (const status of [400, 403, 404, 500, 502]) {
      fetchMock.mockReturnValueOnce(respond(status, { error: '서버 문장' }))
      expect(await fetchBadgePreview('bundle-1', items), String(status)).toEqual({ status: 'failed' })
    }
    fetchMock.mockReturnValueOnce(Promise.reject(new TypeError('Failed to fetch')))
    expect(await fetchBadgePreview('bundle-1', items)).toEqual({ status: 'failed' })
  })

  it('읽을 수 없는 응답 모양은 failed다', async () => {
    fetchMock.mockReturnValueOnce(respond(200, { ok: true }))
    expect(await fetchBadgePreview('bundle-1', items)).toEqual({ status: 'failed' })
    fetchMock.mockReturnValueOnce(respond(200, { ok: true, badgePreview: { ...ok, totalUsers: 'many' } }))
    expect(await fetchBadgePreview('bundle-1', items)).toEqual({ status: 'failed' })
  })
})

describe('postCancel', () => {
  it('미리 보기는 항목 주소로 POST { dryRun: true }를 JSON으로 보내고 200이면 응답을 그대로 돌려준다', async () => {
    const body = { ok: true, dryRun: true, cancelIds: ['item-1', 'item-2'], blockers: [] }
    fetchMock.mockReturnValue(respond(200, body))
    expect(await postCancel('bundle-1', 'item-1', { dryRun: true })).toEqual({ ok: true, data: body })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-inbox/bundle-1/items/item-1/cancel')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ dryRun: true })
  })

  it('취소는 { reason }을 보내고 200이면 응답을 그대로 돌려준다', async () => {
    const body = { ok: true, cancelled: ['item-2', 'item-1'], missing: [] }
    fetchMock.mockReturnValue(respond(200, body))
    expect(await postCancel('bundle-1', 'item-1', { reason: '공개 시각이 바뀌었어요' })).toEqual({ ok: true, data: body })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: '공개 시각이 바뀌었어요' })
  })

  it('사유 없는 취소는 빈 객체를 보낸다', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true, cancelled: ['item-1'], missing: [] }))
    await postCancel('bundle-1', 'item-1', {})
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({})
  })

  it('409는 서버 문장에 「화면을 새로 불러왔어요」를 덧붙이고 막는 항목을 data에 남긴다', async () => {
    const blockers = [{ id: 'item-2', reason: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요.' }]
    fetchMock.mockReturnValue(respond(409, { error: blockers[0].reason, blockers }))
    const result = await postCancel('bundle-1', 'item-1', { reason: '사유' })
    expect(result).toMatchObject({
      ok: false,
      status: 409,
      error: '이 항목을 가리키는 항목이 이미 게재 중이에요. 그 항목을 먼저 종료해 주세요. 화면을 새로 불러왔어요.',
    })
    expect(result.ok === false && result.data.blockers).toEqual(blockers)
  })

  it('500은 서버 문장을 그대로 돌려주고 일부만 취소한 항목(cancelled)은 data에 남는다', async () => {
    const error = '일부만 취소했어요. 나머지는 취소하지 못했어요. 화면을 새로 고쳐 확인해 주세요.'
    fetchMock.mockReturnValue(respond(500, { error, cancelled: ['item-2'] }))
    expect(await postCancel('bundle-1', 'item-1', {})).toEqual({ ok: false, status: 500, error, data: { error, cancelled: ['item-2'] } })
  })

  it('서버 문장이 없는 오류는 고정 문장이다', async () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response('<html>oops</html>', { status: 502 })))
    expect(await postCancel('bundle-1', 'item-1', { dryRun: true })).toEqual({
      ok: false,
      status: 502,
      error: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
      data: {},
    })
  })

  it('네트워크가 끊기면 던지지 않고 status 0과 고정 문장이다(영어 원문을 노출하지 않는다)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await postCancel('bundle-1', 'item-1', {})
    expect(result).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, data: {} })
    expect(JSON.stringify(result)).not.toContain('Failed to fetch')
  })
})

describe('postEnd', () => {
  it('미리 보기는 항목의 end 주소로 POST { dryRun: true }를 JSON으로 보내고 200이면 응답을 그대로 돌려준다', async () => {
    const body = { ok: true, dryRun: true, isSample: false, kind: 'mission', pointedByLive: [], impact: { participants: 3, inProgressUsers: 1 } }
    fetchMock.mockReturnValue(respond(200, body))
    expect(await postEnd('bundle-1', 'item-1', { dryRun: true })).toEqual({ ok: true, data: body })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-inbox/bundle-1/items/item-1/end')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body)).toEqual({ dryRun: true })
  })

  it('지금 종료는 { reason }을 보내고, 사유가 없으면 빈 객체를 보낸다', async () => {
    fetchMock.mockReturnValue(respond(200, { ok: true, itemId: 'item-1', resourceState: 'ended' }))
    await postEnd('bundle-1', 'item-1', { reason: '표기 오류가 있었어요' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ reason: '표기 오류가 있었어요' })
    await postEnd('bundle-1', 'item-1', {})
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({})
  })

  it('409는 서버 문장에 「화면을 새로 불러왔어요」를 덧붙인다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '게재중인 항목만 지금 종료할 수 있어요.' }))
    expect(await postEnd('bundle-1', 'item-1', {})).toMatchObject({
      ok: false,
      status: 409,
      error: '게재중인 항목만 지금 종료할 수 있어요. 화면을 새로 불러왔어요.',
    })
  })

  it('되돌림 실패 500은 서버 문장을 그대로 돌려주고 itemEnded는 data에 남는다', async () => {
    const error = '지금 종료하지 못했어요. 항목은 종료로 바뀌었지만 자원은 아직 게재 중이에요. 기존 어드민에서 종료 시각을 확인해 주세요.'
    fetchMock.mockReturnValue(respond(500, { error, itemEnded: true }))
    expect(await postEnd('bundle-1', 'item-1', {})).toEqual({ ok: false, status: 500, error, data: { error, itemEnded: true } })
  })

  it('네트워크가 끊기면 던지지 않고 status 0과 고정 문장이다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await postEnd('bundle-1', 'item-1', { dryRun: true })).toEqual({ ok: false, status: 0, error: NETWORK_ERROR_MESSAGE, data: {} })
  })
})
