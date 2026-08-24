/**
 * 이미지 src 판별 회귀 테스트 (20260824_004).
 *
 * 이 함수가 true를 잘못 반환하면 next/image가 렌더 시점에 throw해 화면 전체가 죽는다.
 * "등록된 호스트 + 내부 경로만 true"라는 성질을 여기서 고정한다.
 */
import { describe, it, expect } from 'vitest'
import { isOptimizableImageSrc } from '@/lib/imageSrc'

describe('isOptimizableImageSrc', () => {
  it('내부 절대 경로는 최적화 대상', () => {
    expect(isOptimizableImageSrc('/badges/sample/a.png')).toBe(true)
  })

  it('remotePatterns에 등록된 호스트는 최적화 대상', () => {
    expect(
      isOptimizableImageSrc('https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/badges/a.png'),
    ).toBe(true)
    expect(isOptimizableImageSrc('https://lh3.googleusercontent.com/a/abc')).toBe(true)
  })

  it('미등록 외부 호스트는 최적화 대상이 아니다 (실제 장애 케이스)', () => {
    expect(isOptimizableImageSrc('https://storage.heypop.kr/assets/2026/04/a.jpeg')).toBe(false)
    expect(isOptimizableImageSrc('https://cdn.news.bbsi.co.kr/news/a.jpg')).toBe(false)
  })

  it('서브도메인이 다르면 최적화 대상이 아니다', () => {
    expect(isOptimizableImageSrc('https://evil.ceehnkzdbecxwzxrhhns.supabase.co/a.png')).toBe(false)
  })

  it('빈 값·공백·null·undefined는 false', () => {
    expect(isOptimizableImageSrc('')).toBe(false)
    expect(isOptimizableImageSrc('   ')).toBe(false)
    expect(isOptimizableImageSrc(null)).toBe(false)
    expect(isOptimizableImageSrc(undefined)).toBe(false)
  })

  it('프로토콜 상대 URL·data/blob·상대경로·파싱 실패는 false', () => {
    expect(isOptimizableImageSrc('//storage.heypop.kr/a.jpeg')).toBe(false)
    expect(isOptimizableImageSrc('data:image/png;base64,AAAA')).toBe(false)
    expect(isOptimizableImageSrc('blob:http://localhost/abc')).toBe(false)
    expect(isOptimizableImageSrc('badges/a.png')).toBe(false)
    expect(isOptimizableImageSrc('storage.heypop.kr/a.jpeg')).toBe(false)
  })
})
