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

  /* 20260824_005 — 구글은 같은 아바타를 lh3~lh6 등 여러 호스트로 내려주고
     auth/callback은 `includes('googleusercontent')`로 느슨하게 저장한다.
     lh3만 등록돼 있던 초기 구현은 lh4가 저장되는 순간 프로필 화면을 죽였다. */
  it('구글 아바타는 서브도메인이 달라도 최적화 대상 (*.googleusercontent.com)', () => {
    expect(isOptimizableImageSrc('https://lh4.googleusercontent.com/a/abc')).toBe(true)
    expect(isOptimizableImageSrc('https://lh5.googleusercontent.com/a/abc')).toBe(true)
  })

  it('와일드카드는 서브도메인 한 단계까지만 (보수적 판정)', () => {
    // 최상위 도메인 자체·2단계 이상 서브도메인은 next/image의 `*.` 규칙에 걸리지 않는다
    expect(isOptimizableImageSrc('https://googleusercontent.com/a/abc')).toBe(false)
    expect(isOptimizableImageSrc('https://a.b.googleusercontent.com/a/abc')).toBe(false)
    // 접미만 같고 경계가 다른 호스트(사칭)를 통과시키면 안 된다
    expect(isOptimizableImageSrc('https://evilgoogleusercontent.com/a/abc')).toBe(false)
    expect(isOptimizableImageSrc('https://lh3.googleusercontent.com.evil.kr/a/abc')).toBe(false)
  })

  it('미등록 외부 호스트는 최적화 대상이 아니다 (실제 장애 케이스)', () => {
    expect(isOptimizableImageSrc('https://storage.heypop.kr/assets/2026/04/a.jpeg')).toBe(false)
    expect(isOptimizableImageSrc('https://cdn.news.bbsi.co.kr/news/a.jpg')).toBe(false)
  })

  it('서브도메인이 다르면 최적화 대상이 아니다', () => {
    expect(isOptimizableImageSrc('https://evil.ceehnkzdbecxwzxrhhns.supabase.co/a.png')).toBe(false)
  })

  /* 게이트 리뷰(20260824_004)가 잡은 잔여 경로 — 호스트만 맞고 protocol/pathname이 어긋나면
     next/image가 여전히 throw한다. 호스트만 검사하던 초기 구현은 여기서 true를 반환했다. */
  it('등록 호스트라도 pathname이 다르면 최적화 대상이 아니다 (Supabase 서명 URL)', () => {
    expect(
      isOptimizableImageSrc('https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/sign/badges/a.png?token=x'),
    ).toBe(false)
    expect(isOptimizableImageSrc('https://ceehnkzdbecxwzxrhhns.supabase.co/rest/v1/badges')).toBe(false)
    // prefix만 같고 경계가 다른 경로도 걸러야 한다
    expect(isOptimizableImageSrc('https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/publicX/a.png')).toBe(false)
  })

  it('등록 호스트라도 http면 최적화 대상이 아니다', () => {
    expect(
      isOptimizableImageSrc('http://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/badges/a.png'),
    ).toBe(false)
  })

  it('쿼리스트링이 붙어도 pathname 기준으로 판정한다', () => {
    expect(
      isOptimizableImageSrc('https://ceehnkzdbecxwzxrhhns.supabase.co/storage/v1/object/public/a.png?v=2'),
    ).toBe(true)
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
