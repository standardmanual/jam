/**
 * 앰비언트 드랍 대상 읽기 공용 함수 — 유효기간 판정과 지점별 활성 드랍 집계 (티켓 20261001_2130)
 *
 * 실행: cd jam-web && npx vitest run src/lib/ambient-drop/__tests__/target-queries.test.ts
 */
import { describe, it, expect } from 'vitest'
import { badgeValidityAt, countActiveByPoi } from '../targetQueries'

const AT = '2026-10-01T03:00:00.000Z'
const AT_MS = new Date(AT).getTime()

describe('badgeValidityAt', () => {
  it('기간이 없으면 ok', () => {
    expect(badgeValidityAt({ valid_from: null, valid_until: null }, AT_MS)).toBe('ok')
  })

  it('시작 전이면 not_yet, 끝난 뒤면 expired', () => {
    expect(badgeValidityAt({ valid_from: '2026-10-01T03:00:00.001Z', valid_until: null }, AT_MS)).toBe('not_yet')
    expect(badgeValidityAt({ valid_from: null, valid_until: '2026-10-01T02:59:59.999Z' }, AT_MS)).toBe('expired')
  })

  it('경계 시각은 포함한다 (valid_from == 기준, valid_until == 기준)', () => {
    expect(badgeValidityAt({ valid_from: AT, valid_until: AT }, AT_MS)).toBe('ok')
  })

  it('+00:00과 Z 표기가 같은 순간이면 같은 결과다', () => {
    const z = { valid_from: '2026-10-01T03:00:00Z', valid_until: '2026-10-01T03:00:00Z' }
    const offset = { valid_from: '2026-10-01T03:00:00+00:00', valid_until: '2026-10-01T03:00:00+00:00' }
    expect(badgeValidityAt(z, AT_MS)).toBe('ok')
    expect(badgeValidityAt(offset, AT_MS)).toBe('ok')

    // 문자열로 비교하면 '…00+00:00' > '…00.000Z'(문자 '+' < '.')이라 갈렸을 경계 — 시각으로 비교하므로 같다
    const justAfter = { valid_from: '2026-10-01T03:00:00.001+00:00', valid_until: null }
    const justAfterZ = { valid_from: '2026-10-01T03:00:00.001Z', valid_until: null }
    expect(badgeValidityAt(justAfter, AT_MS)).toBe('not_yet')
    expect(badgeValidityAt(justAfterZ, AT_MS)).toBe('not_yet')
  })

  it('다른 시간대 표기도 같은 순간으로 읽는다', () => {
    // 12:00+09:00 == 03:00Z
    expect(badgeValidityAt({ valid_from: '2026-10-01T12:00:00+09:00', valid_until: '2026-10-01T12:00:00+09:00' }, AT_MS)).toBe('ok')
  })
})

describe('countActiveByPoi', () => {
  it('지점별로 행 수를 센다', () => {
    const counts = countActiveByPoi([{ poi_id: 'a' }, { poi_id: 'b' }, { poi_id: 'a' }, { poi_id: 'a' }])
    expect(counts.get('a')).toBe(3)
    expect(counts.get('b')).toBe(1)
    expect(counts.get('c')).toBeUndefined()
  })

  it('행이 없으면 빈 맵', () => {
    expect(countActiveByPoi([]).size).toBe(0)
  })
})
