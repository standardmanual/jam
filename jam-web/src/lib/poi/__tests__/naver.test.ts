/**
 * poi/naver — 키워드 scope별 지역 접두어 조합 (티켓 20260907_1243)
 *
 * 실행: cd jam-web && npx vitest run src/lib/poi/__tests__/naver.test.ts
 */
import { describe, it, expect } from 'vitest'
import { buildRegionPrefix } from '../naver'

const REGIONS = { sido: '서울특별시', gu: '마포구', dong: '연남동' }

describe('buildRegionPrefix', () => {
  it('scope=dong이면 시도+구+동을 전부 이어붙인다', () => {
    expect(buildRegionPrefix(REGIONS, 'dong')).toBe('서울특별시 마포구 연남동')
  })

  it('scope=gu면 동을 뺀 시도+구까지만 이어붙인다', () => {
    expect(buildRegionPrefix(REGIONS, 'gu')).toBe('서울특별시 마포구')
  })

  it('scope=sido면 시도만 남긴다', () => {
    expect(buildRegionPrefix(REGIONS, 'sido')).toBe('서울특별시')
  })

  it('regions가 null이면 null(호출부가 순수 키워드로 폴백)', () => {
    expect(buildRegionPrefix(null, 'dong')).toBeNull()
  })

  it('상위 단계 값이 비어있으면 있는 부분만 이어붙인다', () => {
    expect(buildRegionPrefix({ sido: null, gu: '마포구', dong: '연남동' }, 'dong')).toBe('마포구 연남동')
  })

  it('scope에 필요한 단계까지 전부 비어있으면 null', () => {
    expect(buildRegionPrefix({ sido: null, gu: null, dong: null }, 'sido')).toBeNull()
  })
})
