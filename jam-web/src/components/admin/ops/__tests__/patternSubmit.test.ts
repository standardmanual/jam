/**
 * 패턴 폼·상태 메뉴의 저장 흐름 (티켓 20261008_1617 ⑩a-2)
 *
 * 저장소에 jsdom이 없어 클릭 흐름은 이 순수 async 함수로 고정한다(`fetch`를 막고 본문·결과만 본다 — 실제 쓰기는 하지 않는다).
 * - 검사에 걸리면 요청이 나가지 않고 칸별 오류를 돌려준다
 * - 만들기: POST 본문은 내용 칸 그대로, 201이면 서버가 정한 번호를 돌려준다. 409는 `conflict`
 * - 고치기: PATCH 본문에 내용 칸 전체 + `expectedUpdatedAt`이 **받은 문자열 그대로**(마이크로초 자릿수 보존) 나간다. 200 `changed` 구분, 409 `conflict`, 400 `fieldErrors`
 * - 상태 바꾸기: 쉬는 중일 때만 이유가 나가고, 409·400·서버 오류를 가른다
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { draftFromRecord, emptyDraft, type PatternDraft } from '@/lib/admin/opsPatterns/formDraft'
import { createdToastText, submitPatternForm, submitPatternStatus } from '../patternSubmit'

const UPDATED_AT = '2026-10-08T07:05:00.123456+00:00'

const RECORD = {
  name: '비 오는 날 카페',
  principle: '비가 오면 카페에서 쓰는 배지를 연다',
  userExperience: '비 오는 날 알림을 받는다',
  menus: ['홈피드'],
  samples: [{ no: 1, name: '첫째 샘플', role: 'main', impl: '본체' }],
  cardShapes: [{ shape: 'hero', note: '큰 사진' }],
  knobs: {
    condition: { open: '비', closed: '' },
    place: { open: '', closed: '' },
    time: { open: '', closed: '' },
    reward: { open: '', closed: '' },
    tribe: { rule: '', example: '' },
  },
  pitfalls: '',
}

function filled(overrides: Partial<PatternDraft> = {}): PatternDraft {
  return { ...draftFromRecord(RECORD as never), ...overrides }
}

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

describe('submitPatternForm — 검사', () => {
  it('필수 칸이 비면 요청을 보내지 않고 칸별 오류를 돌려준다', async () => {
    const result = await submitPatternForm({ mode: 'create' }, emptyDraft())
    expect(result).toEqual({
      kind: 'invalid',
      fieldErrors: { name: '이름을 적어 주세요.', principle: '작동 원리를 적어 주세요.', userExperience: '유저가 겪는 것을 적어 주세요.' },
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('고르지 않은 샘플 역할은 samples.N.role 오류가 된다', async () => {
    const draft = filled()
    draft.samples = [{ no: '1', name: '샘플', role: '', impl: '' }]
    const result = await submitPatternForm({ mode: 'edit', patternNo: 'P03', expectedUpdatedAt: UPDATED_AT }, draft)
    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') expect(Object.keys(result.fieldErrors)).toEqual(['samples.0.role'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('submitPatternForm — 만들기', () => {
  it('POST로 내용 칸을 보내고 201이면 서버가 정한 번호를 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(201, { pattern: { patternNo: 'P19', updatedAt: UPDATED_AT } }))
    const result = await submitPatternForm({ mode: 'create' }, filled({ name: '  새 패턴  ' }))
    expect(result).toEqual({ kind: 'created', patternNo: 'P19' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-patterns')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.name).toBe('새 패턴')
    expect(body.samples).toEqual([{ no: 1, name: '첫째 샘플', role: 'main', impl: '본체' }])
    expect(body).not.toHaveProperty('expectedUpdatedAt')
    expect(body).not.toHaveProperty('patternNo')
  })

  it('409는 conflict로 서버 문장을 그대로 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '그사이 다른 패턴이 만들어졌어요. 다시 저장해 주세요.' }))
    expect(await submitPatternForm({ mode: 'create' }, filled())).toEqual({
      kind: 'conflict',
      message: '그사이 다른 패턴이 만들어졌어요. 다시 저장해 주세요.',
    })
  })
})

describe('submitPatternForm — 고치기', () => {
  const target = { mode: 'edit', patternNo: 'P03', expectedUpdatedAt: UPDATED_AT } as const

  it('expectedUpdatedAt을 받은 문자열 그대로 보낸다 (Date를 거치지 않아 마이크로초가 남는다)', async () => {
    fetchMock.mockReturnValue(respond(200, { pattern: { patternNo: 'P03', updatedAt: UPDATED_AT }, changed: true }))
    expect(await submitPatternForm(target, filled())).toEqual({ kind: 'saved', changed: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-patterns/P03')
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(init.body)
    expect(body.expectedUpdatedAt).toBe('2026-10-08T07:05:00.123456+00:00')
    expect(new Date(UPDATED_AT).toISOString()).not.toBe(UPDATED_AT)
    expect(body.name).toBe('비 오는 날 카페')
    expect(Object.keys(body).sort()).toEqual(
      ['cardShapes', 'expectedUpdatedAt', 'knobs', 'menus', 'name', 'pitfalls', 'principle', 'samples', 'userExperience']
    )
  })

  it('바뀐 내용이 없다는 응답은 changed false다', async () => {
    fetchMock.mockReturnValue(respond(200, { pattern: { patternNo: 'P03' }, changed: false }))
    expect(await submitPatternForm(target, filled())).toEqual({ kind: 'saved', changed: false })
  })

  it('409는 conflict, 입력은 호출한 쪽이 그대로 둔다', async () => {
    fetchMock.mockReturnValue(respond(409, { error: '그사이 다른 곳에서 이 패턴을 고쳤어요. 최신 내용을 불러와 주세요.' }))
    expect(await submitPatternForm(target, filled())).toEqual({
      kind: 'conflict',
      message: '그사이 다른 곳에서 이 패턴을 고쳤어요. 최신 내용을 불러와 주세요.',
    })
  })

  it('400 fieldErrors는 같은 경로 그대로 돌려준다', async () => {
    fetchMock.mockReturnValue(respond(400, { error: '입력한 내용을 확인해 주세요.', fieldErrors: { 'samples.2.role': '샘플의 역할은 주·보조 장치·걸침 중에서 골라 주세요.' } }))
    expect(await submitPatternForm(target, filled())).toEqual({
      kind: 'fieldErrors',
      message: '입력한 내용을 확인해 주세요.',
      fieldErrors: { 'samples.2.role': '샘플의 역할은 주·보조 장치·걸침 중에서 골라 주세요.' },
    })
  })

  it('fieldErrors 없는 400·서버 오류·끊김은 failed다', async () => {
    fetchMock.mockReturnValueOnce(respond(400, { error: '패턴의 수정 시각이 필요해요. 화면을 새로 고쳐 주세요.' }))
    expect(await submitPatternForm(target, filled())).toEqual({ kind: 'failed', message: '패턴의 수정 시각이 필요해요. 화면을 새로 고쳐 주세요.' })
    fetchMock.mockReturnValueOnce(respond(500, { error: '패턴을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' }))
    expect(await submitPatternForm(target, filled())).toEqual({ kind: 'failed', message: '패턴을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.' })
    fetchMock.mockRejectedValueOnce(new TypeError('network'))
    expect(await submitPatternForm(target, filled())).toMatchObject({ kind: 'failed' })
  })
})

describe('submitPatternStatus', () => {
  it('쉬게 하기는 이유를 싣고 expectedUpdatedAt은 받은 문자열 그대로다', async () => {
    fetchMock.mockReturnValue(respond(200, { pattern: {}, changed: true }))
    expect(await submitPatternStatus('P03', { status: 'paused', pauseReason: '시즌이 끝났어요' }, UPDATED_AT)).toEqual({ kind: 'changed' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/ops-patterns/P03')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'paused', pauseReason: '시즌이 끝났어요', expectedUpdatedAt: '2026-10-08T07:05:00.123456+00:00' })
  })

  it('보관하기·다시 사용하기는 이유를 싣지 않는다', async () => {
    fetchMock.mockReturnValue(respond(200, { pattern: {}, changed: true }))
    await submitPatternStatus('P03', { status: 'archived' }, UPDATED_AT)
    await submitPatternStatus('P03', { status: 'active' }, UPDATED_AT)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ status: 'archived', expectedUpdatedAt: UPDATED_AT })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ status: 'active', expectedUpdatedAt: UPDATED_AT })
  })

  it('이미 그 상태면 unchanged다', async () => {
    fetchMock.mockReturnValue(respond(200, { pattern: {}, changed: false }))
    expect(await submitPatternStatus('P03', { status: 'active' }, UPDATED_AT)).toEqual({ kind: 'unchanged' })
  })

  it('409는 conflict, 이유 칸 400은 fieldErrors, 그 밖은 failed다', async () => {
    fetchMock.mockReturnValueOnce(respond(409, { error: '그사이 상태가 바뀌었어요. 최신 내용을 불러와 주세요.' }))
    expect(await submitPatternStatus('P03', { status: 'archived' }, UPDATED_AT)).toEqual({ kind: 'conflict' })
    fetchMock.mockReturnValueOnce(respond(400, { error: '입력한 내용을 확인해 주세요.', fieldErrors: { pauseReason: '쉬는 이유를 200자 이내로 적어 주세요.' } }))
    expect(await submitPatternStatus('P03', { status: 'paused', pauseReason: '' }, UPDATED_AT)).toEqual({
      kind: 'fieldErrors',
      fieldErrors: { pauseReason: '쉬는 이유를 200자 이내로 적어 주세요.' },
    })
    fetchMock.mockReturnValueOnce(respond(404, { error: '찾을 수 없는 패턴이에요.' }))
    expect(await submitPatternStatus('P03', { status: 'archived' }, UPDATED_AT)).toEqual({ kind: 'failed', message: '찾을 수 없는 패턴이에요.' })
  })
})

describe('createdToastText', () => {
  it('번호 끝 숫자의 받침에 따라 을/를을 고른다', () => {
    expect(createdToastText('P19')).toBe('P19를 만들었어요')
    expect(createdToastText('P20')).toBe('P20을 만들었어요')
    expect(createdToastText('P21')).toBe('P21을 만들었어요')
    expect(createdToastText('P22')).toBe('P22를 만들었어요')
    expect(createdToastText('P23')).toBe('P23을 만들었어요')
    expect(createdToastText('P24')).toBe('P24를 만들었어요')
    expect(createdToastText('P25')).toBe('P25를 만들었어요')
    expect(createdToastText('P26')).toBe('P26을 만들었어요')
    expect(createdToastText('P27')).toBe('P27을 만들었어요')
    expect(createdToastText('P28')).toBe('P28을 만들었어요')
  })
})
