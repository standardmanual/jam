/**
 * 장소 폼의 연결 배지 검색은 체크인 배지만 보여 준다 (티켓 20261018_1813)
 *
 * jsdom이 없어 폼을 렌더하지 못하므로 소스를 스캔해 고정한다. `typeFilter`가 빠져도 폼은 멀쩡히
 * 그려지고 모든 종류의 배지가 검색되기 때문에 «없어도 조용히 통과»한다. 서버 쪽 거절은
 * `api/admin/poi/__tests__/linked-badge-route.test.ts`가 고정한다.
 *
 * 실행: `npx vitest run src/app/admin/poi/__tests__/poi-form-badge-filter-contract.test.ts`
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FORM = readFileSync(join(__dirname, '..', 'PoiForm.tsx'), 'utf-8')

describe('PoiForm 연결 배지 검색', () => {
  it('BadgeSearchSelect에 체크인 배지만 고르는 typeFilter를 건다', () => {
    const start = FORM.indexOf('<BadgeSearchSelect')
    expect(start).toBeGreaterThanOrEqual(0)
    const element = FORM.slice(start, FORM.indexOf('/>', start))
    expect(element).toContain('typeFilter="checkin"')
  })
})
