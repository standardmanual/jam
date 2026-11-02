/**
 * 읽기 API 두 개의 쿼리 읽기 (티켓 20261102_1602) — 경계값·잘못된 값.
 */
import { describe, it, expect } from 'vitest'
import { parseBadgesQuery } from '../query'
import { parsePlacesQuery } from '../../opsPlaces/query'

const p = (s: string) => new URLSearchParams(s)

describe('parseBadgesQuery', () => {
  it('쿼리가 없으면 기본값이다', () => {
    expect(parseBadgesQuery(p(''))).toEqual({ family: '', limit: 30, offset: 0 })
  })

  it('경계값은 받고 범위 밖·형식 오류는 null이다', () => {
    expect(parseBadgesQuery(p('limit=1&offset=0'))).not.toBeNull()
    expect(parseBadgesQuery(p('limit=100'))).not.toBeNull()
    for (const bad of ['limit=0', 'limit=101', 'limit=abc', 'limit=-1', 'limit=1.5', 'offset=-1', `family=${'가'.repeat(101)}`]) {
      expect(parseBadgesQuery(p(bad)), bad).toBeNull()
    }
  })
})

describe('parsePlacesQuery', () => {
  it('쿼리가 없으면 요약이다', () => {
    expect(parsePlacesQuery(p(''))).toEqual({ mode: 'summary' })
  })

  it('category가 있으면 목록이고 기본값이 채워진다', () => {
    expect(parsePlacesQuery(p('category=mountain'))).toEqual({
      mode: 'list',
      query: { category: 'mountain', q: '', limit: 30, offset: 0, sort: 'drops' },
    })
  })

  it('잘못된 category·limit·sort·offset은 null이다', () => {
    for (const bad of [
      'category=Mountain',
      'category=a-b',
      'category=m&limit=0',
      'category=m&limit=101',
      'category=m&sort=random',
      'category=m&offset=-1',
      `category=m&q=${'a'.repeat(101)}`,
    ]) {
      expect(parsePlacesQuery(p(bad)), bad).toBeNull()
    }
  })

  it('category 없이 목록 전용 쿼리만 오면 null이다', () => {
    for (const bad of ['limit=5', 'sort=name', 'q=x', 'offset=1']) expect(parsePlacesQuery(p(bad)), bad).toBeNull()
  })
})
