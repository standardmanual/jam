/**
 * poi/reclassify — 기존 599건 재분류 매핑 규칙 (티켓 20260907_1243)
 *
 * 실행: cd jam-web && npx vitest run src/lib/poi/__tests__/reclassify.test.ts
 */
import { describe, it, expect } from 'vitest'
import { matchNaverCategoryToTargetSlug } from '../reclassify'

describe('matchNaverCategoryToTargetSlug', () => {
  it('구체적인 자연 유형(국립공원 등)은 nature로 매핑된다', () => {
    expect(matchNaverCategoryToTargetSlug('여행,레저>자연공원>국립공원')).toBe('nature')
  })

  it('일반 공원은 park로 매핑된다(국립공원 등 구체 패턴에 안 걸리는 경우)', () => {
    expect(matchNaverCategoryToTargetSlug('여행,레저>공원')).toBe('park')
  })

  it('박물관/미술관/전망대는 tourist_attraction으로 매핑된다', () => {
    expect(matchNaverCategoryToTargetSlug('문화,예술>박물관')).toBe('tourist_attraction')
    expect(matchNaverCategoryToTargetSlug('전시,관람>미술관')).toBe('tourist_attraction')
  })

  it('경기장/종합운동장은 stadium으로 매핑된다', () => {
    expect(matchNaverCategoryToTargetSlug('스포츠,레저>경기장')).toBe('stadium')
  })

  it('대학병원은 school이 아니라 hospital로 매핑된다(대학 패턴의 병원 예외 처리)', () => {
    expect(matchNaverCategoryToTargetSlug('의료,건강>대학병원')).toBe('hospital')
  })

  it('대학교는 school로 매핑된다', () => {
    expect(matchNaverCategoryToTargetSlug('교육,학문>대학교')).toBe('school')
  })

  it('관공서 계열은 government로 매핑된다', () => {
    expect(matchNaverCategoryToTargetSlug('공공기관,단체>행정,관공서>주민센터')).toBe('government')
  })

  it('어느 패턴에도 매칭되지 않으면 null(unassigned 배정 대상)', () => {
    expect(matchNaverCategoryToTargetSlug('시설물>알수없는분류')).toBeNull()
  })

  it('원본 분류가 비어있거나 없으면 null', () => {
    expect(matchNaverCategoryToTargetSlug('')).toBeNull()
    expect(matchNaverCategoryToTargetSlug(null)).toBeNull()
    expect(matchNaverCategoryToTargetSlug(undefined)).toBeNull()
  })
})
