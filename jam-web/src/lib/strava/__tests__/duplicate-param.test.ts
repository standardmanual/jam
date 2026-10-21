/**
 * 중복 연결 안내(`?strava=duplicate`, `?strava=duplicate_blocked`) 주소 처리 (티켓 20261017_1422 2회, 20261021_1249 4회)
 *
 * 실행: cd jam-web && npx vitest run src/lib/strava/__tests__/duplicate-param.test.ts
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { hasStravaDuplicateParam, stravaDuplicateMode, urlWithoutStravaParam } from '../duplicate-param'

const params = (query: string) => new URLSearchParams(query)

describe('stravaDuplicateMode / hasStravaDuplicateParam', () => {
  it('strava=duplicate는 offer, strava=duplicate_blocked는 blocked다', () => {
    expect(stravaDuplicateMode(params('strava=duplicate'))).toBe('offer')
    expect(stravaDuplicateMode(params('strava=duplicate_blocked'))).toBe('blocked')
    expect(hasStravaDuplicateParam(params('strava=duplicate'))).toBe(true)
    expect(hasStravaDuplicateParam(params('strava=duplicate_blocked'))).toBe(true)
  })

  it('다른 값은 열지 않는다 — connected·error는 StravaConnectReveal의 몫이다', () => {
    for (const query of ['strava=error&reason=db_error', 'strava=connected', 'strava=connected&reveal=1', 'strava=', 'strava=Duplicate', 'strava=duplicates', '']) {
      expect(stravaDuplicateMode(params(query)), query).toBeNull()
      expect(hasStravaDuplicateParam(params(query)), query).toBe(false)
    }
  })
})

describe('urlWithoutStravaParam — 열리자마자 주소에서 값을 지운다', () => {
  it('strava만 지우면 경로만 남는다 — 새로고침해도 다시 열리지 않는다', () => {
    expect(urlWithoutStravaParam('/runner', params('strava=duplicate'))).toBe('/runner')
  })

  it('다른 쿼리는 그대로 둔다', () => {
    expect(urlWithoutStravaParam('/runner', params('strava=duplicate&tab=badges'))).toBe('/runner?tab=badges')
  })

  it('막힘 안내(duplicate_blocked)도 같은 방식으로 지운다', () => {
    expect(urlWithoutStravaParam('/runner', params('strava=duplicate_blocked'))).toBe('/runner')
    expect(urlWithoutStravaParam('/runner', params('strava=duplicate_blocked&tab=badges'))).toBe('/runner?tab=badges')
  })
})

describe('프로필 경유지와 레이아웃 연결', () => {
  const read = (relative: string) => readFileSync(path.resolve(__dirname, '../../../', relative), 'utf8')

  it('profile/page.tsx가 strava 값을 /{username}으로 그대로 전달한다 (duplicate 포함)', () => {
    const source = read('app/(main)/profile/page.tsx')
    expect(source).toContain("if (typeof strava === 'string') forwardedParams.set('strava', strava)")
    expect(source).toContain('redirect(`/${username}${forwardQuery}`)')
  })

  it('(main)/layout.tsx가 StravaConnectReveal 옆에 중복 안내 시트를 둔다', () => {
    const source = read('app/(main)/layout.tsx')
    expect(source.indexOf('<StravaConnectReveal')).toBeGreaterThan(-1)
    expect(source.indexOf('<StravaDuplicateSheet')).toBeGreaterThan(source.indexOf('<StravaConnectReveal'))
  })
})
