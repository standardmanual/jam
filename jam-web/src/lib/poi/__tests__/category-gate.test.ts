/**
 * poi/category-gate — 네이버 원본 분류 검증 게이트 3단계 판정 (티켓 20260907_1242)
 *
 * 실행: cd jam-web && npx vitest run src/lib/poi/__tests__/category-gate.test.ts
 */
import { describe, it, expect } from 'vitest'
import { classifyNaverCategory } from '../category-gate'

describe('classifyNaverCategory', () => {
  it('원본 분류가 허용 패턴에 포함되면 approved', () => {
    expect(classifyNaverCategory('nature', '여행,레저>자연관광지>공원')).toBe('approved')
    expect(classifyNaverCategory('hospital', '의료,건강>병원>내과')).toBe('approved')
  })

  it('원본 분류가 거부 패턴에 포함되면 rejected (실측 오염 사례: nature로 검색된 카페 체인)', () => {
    expect(classifyNaverCategory('nature', '음식점>카페,디저트')).toBe('rejected')
    expect(classifyNaverCategory('government', '음식점>한식')).toBe('rejected')
  })

  it('허용/거부 어느 쪽에도 매칭되지 않으면 pending(애매함)', () => {
    expect(classifyNaverCategory('nature', '시설물>알수없는분류')).toBe('pending')
  })

  it('패턴이 정의되지 않은 카테고리는 근거 없이 승인/거부하지 않고 pending', () => {
    expect(classifyNaverCategory('fitness_center', '스포츠,레저>헬스장')).toBe('pending')
  })

  it('원본 분류가 비어있으면 pending', () => {
    expect(classifyNaverCategory('nature', '')).toBe('pending')
  })

  it('allow가 reject보다 먼저 매칭되면 approved (자연 카테고리에 "공원"이 포함된 케이스)', () => {
    // "공원"은 nature의 allow 패턴 — food의 allow에 있는 "음식점"과 무관하게 자기 카테고리 기준으로만 판정
    expect(classifyNaverCategory('nature', '여행,레저>공원')).toBe('approved')
  })
})
