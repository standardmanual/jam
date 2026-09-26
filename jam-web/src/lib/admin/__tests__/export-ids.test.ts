/**
 * parseExportIds — 어드민 export 라우트 공용 ids 검증(티켓 20260926_1412).
 * 실행: cd jam-web && npx vitest run src/lib/admin/__tests__/export-ids.test.ts
 */
import { describe, it, expect } from 'vitest'
import { parseExportIds, MAX_EXPORT_IDS } from '../export-ids'

const EMPTY = '내보낼 항목을 선택해주세요.'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('parseExportIds', () => {
  it('UUID 문자열을 그대로 돌려준다', () => {
    expect(parseExportIds({ ids: [uuid(1), uuid(2)] }, EMPTY)).toEqual({ ok: true, ids: [uuid(1), uuid(2)] })
  })

  it('대문자 UUID도 통과시킨다', () => {
    const upper = 'ABCDEF01-2345-4678-89AB-CDEF01234567'
    expect(parseExportIds({ ids: [upper] }, EMPTY)).toEqual({ ok: true, ids: [upper] })
  })

  it('중복을 제거한다', () => {
    expect(parseExportIds({ ids: [uuid(1), uuid(1), uuid(2)] }, EMPTY)).toEqual({
      ok: true,
      ids: [uuid(1), uuid(2)],
    })
  })

  it('문자열이 아닌 값은 무시한다', () => {
    expect(parseExportIds({ ids: [uuid(1), 42, null, { a: 1 }] }, EMPTY)).toEqual({ ok: true, ids: [uuid(1)] })
  })

  it('UUID가 아닌 값이 하나라도 있으면 400으로 거절한다', () => {
    expect(parseExportIds({ ids: [uuid(1), 'not-a-uuid'] }, EMPTY)).toEqual({
      ok: false,
      status: 400,
      error: '선택한 항목의 식별자 형식이 올바르지 않습니다. 목록을 새로 고친 뒤 다시 시도해 주세요.',
    })
  })

  it('상한을 넘으면 400으로 거절한다', () => {
    const ids = Array.from({ length: MAX_EXPORT_IDS + 1 }, (_, i) => uuid(i))
    expect(parseExportIds({ ids }, EMPTY)).toEqual({
      ok: false,
      status: 400,
      error: '한 번에 최대 1,000건까지 내보낼 수 있습니다. 선택을 줄여 다시 시도해 주세요.',
    })
  })

  it('정확히 상한이면 통과한다', () => {
    const ids = Array.from({ length: MAX_EXPORT_IDS }, (_, i) => uuid(i))
    const result = parseExportIds({ ids }, EMPTY)
    expect(result.ok && result.ids.length).toBe(MAX_EXPORT_IDS)
  })

  it('중복은 개수에 넣지 않는다', () => {
    const ids = Array.from({ length: MAX_EXPORT_IDS + 5 }, (_, i) => uuid(i % MAX_EXPORT_IDS))
    expect(parseExportIds({ ids }, EMPTY).ok).toBe(true)
  })

  it.each([
    ['ids 없음', {}],
    ['빈 배열', { ids: [] }],
    ['배열 아님', { ids: 'abc' }],
    ['본문 null', null],
    ['문자열만 걸러 0건', { ids: [1, 2] }],
  ])('선택이 없으면(%s) 전달받은 빈 선택 문구로 400을 돌려준다', (_label, body) => {
    expect(parseExportIds(body, EMPTY)).toEqual({ ok: false, status: 400, error: EMPTY })
  })
})
