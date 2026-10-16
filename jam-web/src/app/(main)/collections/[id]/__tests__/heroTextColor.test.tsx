/**
 * 컬렉션 상세 Hero 카드의 글자색 — 블롭 배경 유무로 갈린다 (티켓 20261015_2134, 1회)
 *
 * 배지 상세(BadgeHeroSection)와 같은 규칙이다. 블롭 위는 제목·설명·빈 이미지 아이콘이 --snow,
 * 배경이 없는 흰 카드는 제목 --foreground, 설명 --muted다. 제목이 `#FFFFFF`로 박혀 있던 때는
 * 흰 카드 위 흰 글자였다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/collections/[id]/__tests__/heroTextColor.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/BlobAnimationBackground', () => ({ default: () => null }))

import ItemBookHeroSection from '../ItemBookHeroSection'

const BOOK = { name: '한강 컬렉션', description: '한강의 지점을 모았어요.', image_url: null }

const BLOB = {
  bgColor: '#555555',
} as unknown as NonNullable<Parameters<typeof ItemBookHeroSection>[0]['backgroundAnimation']>

describe('ItemBookHeroSection 글자색', () => {
  it('배경이 없으면 제목 foreground, 설명 muted, 아이콘 muted다(흰 글자 아님)', () => {
    const html = renderToStaticMarkup(
      <ItemBookHeroSection book={BOOK} slottedCount={1} totalBadgeCount={3} />
    )
    expect(html).toMatch(/<h1[^>]*style="color:var\(--foreground\)"/)
    expect(html).toMatch(/class="text-base text-center text-muted">한강의 지점을 모았어요\./)
    expect(html).toContain('color:var(--muted)')
    expect(html).not.toContain('#FFFFFF')
    expect(html).not.toContain('#AAAAAA')
    expect(html).toContain('bg-surface')
  })

  it('블롭 배경 위에서는 제목·설명·아이콘이 snow다', () => {
    const html = renderToStaticMarkup(
      <ItemBookHeroSection book={BOOK} slottedCount={1} totalBadgeCount={3} backgroundAnimation={BLOB} />
    )
    expect(html).toMatch(/<h1[^>]*style="color:var\(--snow\)"/)
    expect(html).toMatch(/class="text-base text-center text-snow">한강의 지점을 모았어요\./)
    expect(html).toContain('bg-transparent')
  })
})
