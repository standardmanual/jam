/**
 * 배지 상세 Hero 카드의 글자색 — 배경 유무로 갈린다 (티켓 20261015_2134, 1회)
 *
 * 블롭·테마 배경이 깔린 카드는 어두운 면 위 글자라 제목·설명이 모두 --snow다.
 * 배경이 없는 카드는 흰 면 + 1px border라 제목 --foreground, 설명 --muted다.
 * 크림·흰 면 위에 text-snow를 쓰면 글자가 사라지고(1.0x:1), 배경 위에 text-foreground를 쓰면
 * 블롭 기본 배경(#555555)에서 2.40:1이 된다(인계 중대 "콘텐츠 배경 위 글자 뒤집힘").
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/heroTextColor.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// 캔버스를 그리는 클라이언트 배경은 렌더 결과(클래스)와 무관하다.
vi.mock('@/components/BlobAnimationBackground', () => ({ default: () => null }))

import BadgeHeroSection from '../BadgeHeroSection'

const BADGE = {
  image_url: null,
  name: '한강 러너',
  rarity: 'common' as const,
  description: '한강을 달렸어요.',
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
}

const BLOB = {
  bgColor: '#555555',
} as unknown as NonNullable<Parameters<typeof BadgeHeroSection>[0]['backgroundAnimation']>

function titleClass(html: string): string {
  return /<h1 class="([^"]*)"/.exec(html)?.[1] ?? ''
}

function descriptionClass(html: string): string {
  return /<p class="([^"]*)">한강을 달렸어요\./.exec(html)?.[1] ?? ''
}

describe('BadgeHeroSection 글자색', () => {
  it('배경이 없으면 흰 면 위라 제목 foreground, 설명 muted다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection badge={BADGE} hasEarned />)
    expect(titleClass(html)).toContain('text-foreground')
    expect(titleClass(html)).not.toContain('text-snow')
    expect(descriptionClass(html)).toContain('text-muted')
    expect(descriptionClass(html)).not.toContain('text-snow')
    expect(html).toContain('bg-surface')
  })

  it('테마 배경이 깔리면 제목·설명이 모두 snow다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection badge={BADGE} hasEarned themedBackground />)
    expect(titleClass(html)).toContain('text-snow')
    expect(titleClass(html)).not.toContain('text-foreground')
    expect(descriptionClass(html)).toContain('text-snow')
    expect(descriptionClass(html)).not.toContain('text-muted')
  })

  it('블롭 애니메이션 카드도 제목·설명이 snow다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection badge={BADGE} hasEarned backgroundAnimation={BLOB} />)
    expect(titleClass(html)).toContain('text-snow')
    expect(descriptionClass(html)).toContain('text-snow')
    expect(html).toContain('bg-transparent')
  })
})
