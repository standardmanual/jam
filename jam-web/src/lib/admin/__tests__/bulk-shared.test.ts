/**
 * 어드민 일괄 처리 서버·클라이언트 공용 계약 회귀 테스트(티켓 20260924_0940).
 *
 * `lib/admin/bulk/shared.ts`의 순수 함수만 다룬다 — 실제 DB 반영은 각 메뉴의 API
 * 라우트(하위 티켓 ②~⑪)가 담당하고, 여기서는 "요청을 믿고 실행해도 되는지" 판정만 고정한다.
 */
import { describe, it, expect } from 'vitest'
import {
  BULK_MAX_IDS,
  confirmPhraseFor,
  formatBulkResult,
  isPhraseMatch,
  parseBulkBody,
  selectAllBannerState,
  type BulkResult,
} from '@/lib/admin/bulk/shared'

const UUID_A = '11111111-1111-1111-1111-111111111111'
const UUID_B = '22222222-2222-2222-2222-222222222222'

/** i마다 서로 다른 유효한 형식의 UUID를 만든다(상한 테스트용 — 중복 제거 이후에도 개수가 그대로여야 한다) */
function uuidAt(i: number): string {
  return `${i.toString(16).padStart(8, '0')}-1111-1111-1111-111111111111`
}

describe('parseBulkBody', () => {
  const config = { actions: { delete: {}, activate: { maxIds: 5 } }, idFormat: 'uuid' as const }

  it('정상 요청을 통과시키고 중복 ID를 제거한다', () => {
    const result = parseBulkBody({ ids: [UUID_A, UUID_A, UUID_B], action: 'delete' }, config)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.body.ids).toEqual([UUID_A, UUID_B])
      expect(result.body.action).toBe('delete')
      expect(result.body.dryRun).toBe(false)
    }
  })

  it('기본 상한(1,000건)을 넘으면 거부한다', () => {
    const ids = Array.from({ length: BULK_MAX_IDS + 1 }, (_, i) => uuidAt(i))
    const result = parseBulkBody({ ids, action: 'delete' }, config)
    expect(result.ok).toBe(false)
  })

  it('동작별 maxIds를 넘으면 거부한다', () => {
    const ids = Array.from({ length: 6 }, (_, i) => uuidAt(i))
    const result = parseBulkBody({ ids, action: 'activate' }, config)
    expect(result.ok).toBe(false)
  })

  it('idFormat이 uuid면 형식이 다른 ID를 거부한다', () => {
    const result = parseBulkBody({ ids: ['not-a-uuid'], action: 'delete' }, config)
    expect(result.ok).toBe(false)
  })

  it("idFormat이 'string'이면 임의 문자열 ID를 허용한다", () => {
    const result = parseBulkBody(
      { ids: ['user:1', 'user:2'], action: 'delete' },
      { actions: { delete: {} }, idFormat: 'string' }
    )
    expect(result.ok).toBe(true)
  })

  it('등록되지 않은 동작은 거부한다', () => {
    const result = parseBulkBody({ ids: [UUID_A], action: 'unknown' }, config)
    expect(result.ok).toBe(false)
  })
})

describe('isPhraseMatch', () => {
  it('완전히 같으면 일치한다', () => {
    expect(isPhraseMatch('삭제 12', '삭제 12')).toBe(true)
  })

  it('앞뒤 공백은 무시한다', () => {
    expect(isPhraseMatch('  삭제 12  ', '삭제 12')).toBe(true)
  })

  it('내용이 다르면 불일치한다', () => {
    expect(isPhraseMatch('삭제 13', '삭제 12')).toBe(false)
  })
})

describe('confirmPhraseFor', () => {
  it('동작과 건수로만 계산한다(결정론적)', () => {
    expect(confirmPhraseFor('삭제', 12)).toBe(confirmPhraseFor('삭제', 12))
  })

  it('건수가 다르면 문구도 다르다', () => {
    expect(confirmPhraseFor('삭제', 12)).not.toBe(confirmPhraseFor('삭제', 13))
  })
})

describe('formatBulkResult', () => {
  it('건너뜀이 있으면 함께 안내한다', () => {
    const result: BulkResult = { processed: ['a', 'b'], skipped: [{ id: 'c', reason: '참조 있음' }] }
    expect(formatBulkResult(result, { verb: '삭제' })).toBe('2건 삭제, 1건 건너뜀')
  })

  it('건너뜀이 없으면 처리 건수만 안내한다', () => {
    const result: BulkResult = { processed: ['a'], skipped: [] }
    expect(formatBulkResult(result, { verb: '삭제' })).toBe('1건 삭제')
  })
})

describe('selectAllBannerState', () => {
  it('현재 페이지가 전부 선택되지 않았으면 숨긴다', () => {
    expect(selectAllBannerState(['a', 'b'], ['a'], 50, 1000)).toEqual({ type: 'hidden' })
  })

  it('페이지는 전부 선택했지만 전체는 아니면 선택 유도 문구를 보여준다', () => {
    expect(selectAllBannerState(['a', 'b'], ['a', 'b'], 50, 1000)).toEqual({
      type: 'prompt',
      selectableCount: 50,
    })
  })

  it('필터 결과 전체(상한 이내)가 선택되면 all-selected다', () => {
    const ids = ['a', 'b']
    expect(selectAllBannerState(ids, ids, 2, 1000)).toEqual({ type: 'all-selected', count: 2 })
  })

  it('필터 결과가 상한을 넘으면 상한만큼만 선택된 capped 상태다', () => {
    const pageIds = ['a', 'b']
    const selected = ['a', 'b', 'c']
    expect(selectAllBannerState(pageIds, selected, 10, 3)).toEqual({
      type: 'capped',
      count: 3,
      totalCount: 10,
    })
  })
})
