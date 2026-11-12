/**
 * 배지 상세 Hero 카드의 높이와 설명 줄바꿈 (2026-11-09 사용자 지시)
 *
 * - 카드의 1:1 비율 고정(`aspect-square`)을 풀었다 — 높이는 내용이 정한다.
 * - 설명 문단은 전역 `p { text-wrap: balance }`를 끄고 일반 줄바꿈(`text-wrap`)으로 둔다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/[id]/__tests__/heroLayout.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/BlobAnimationBackground', () => ({ default: () => null }))

import BadgeHeroSection from '@/components/BadgeHeroSection'

const BADGE = {
  image_url: null,
  name: '한강 러너',
  rarity: 'common' as const,
  description: '짝 잃은 양말이 제 짝을 찾아 빨랫줄에 나란히 걸렸습니다.',
  background_color: null,
  background_shader_id: null,
  background_image_url: null,
  background_animation: null,
}

describe('BadgeHeroSection 카드 높이', () => {
  it('카드 세로 크기를 고정하지 않는다(aspect-square 없음)', () => {
    for (const html of [
      renderToStaticMarkup(<BadgeHeroSection badge={BADGE} hasEarned />),
      renderToStaticMarkup(<BadgeHeroSection badge={BADGE} hasEarned themedBackground />),
    ]) {
      expect(html).not.toContain('aspect-square')
      expect(html).not.toMatch(/\bh-\[|min-h-\[|style="[^"]*height:/)
      // 이미지 블록과 글자 블록 사이는 간격이 띄운다
      expect(html).toContain('gap-4')
    }
  })
})

describe('BadgeHeroSection 설명 줄바꿈', () => {
  it('설명 문단은 text-wrap(balance 해제)이고 제목은 건드리지 않는다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection badge={BADGE} hasEarned />)
    const description = /<p class="([^"]*)">짝 잃은/.exec(html)?.[1] ?? ''
    const title = /<h1 class="([^"]*)"/.exec(html)?.[1] ?? ''

    // 전역 `p { text-wrap: balance }`가 레이어 밖이라 유틸리티만으로는 이기지 못한다 — 중요도 접미사가 필요하다
    expect(description.split(' ')).toContain('text-wrap!')
    expect(title).not.toContain('text-wrap')
  })
})

describe('BadgeHeroSection size (티켓 20261112_1629)', () => {
  const WITH_IMAGE = { ...BADGE, image_url: 'https://example.com/a.png' }

  it('기본(page)은 바깥 여백 px-4 pt-0 pb-5, 카드 안쪽 p-6, 이미지 200이다', () => {
    const html = renderToStaticMarkup(<BadgeHeroSection badge={WITH_IMAGE} hasEarned />)
    expect(html).toContain('class="relative z-10 px-4 pt-0 pb-5"')
    expect(html).toContain('gap-4 p-6')
    expect(html).toContain('w-[200px] h-[200px]')
    expect(renderToStaticMarkup(<BadgeHeroSection badge={WITH_IMAGE} hasEarned size="page" />)).toBe(html)
  })

  it('sheet는 바깥 여백이 없고 카드 안쪽 여백 24 16, 이미지 176이다 — 이름·설명 마크업은 page와 같다', () => {
    const page = renderToStaticMarkup(<BadgeHeroSection badge={WITH_IMAGE} hasEarned />)
    const sheet = renderToStaticMarkup(<BadgeHeroSection badge={WITH_IMAGE} hasEarned size="sheet" />)
    expect(sheet).toContain('class="relative z-10"')
    expect(sheet).not.toContain('px-4 pt-0 pb-5')
    expect(sheet).toContain('gap-4 py-6 px-4')
    expect(sheet).not.toContain('p-6')
    expect(sheet).toContain('w-44 h-44')
    expect(sheet).not.toContain('200')
    expect(sheet).toContain('176')
    for (const part of ['<h1 class="text-3xl font-bold text-center text-foreground">한강 러너</h1>', '짝 잃은 양말이 제 짝을 찾아 빨랫줄에 나란히 걸렸습니다.']) {
      expect(page).toContain(part)
      expect(sheet).toContain(part)
    }
  })
})
