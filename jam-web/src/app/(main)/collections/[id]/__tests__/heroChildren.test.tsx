/**
 * 컬렉션 상세 Hero의 children 자리 — 대표 카드와 진행도 바 사이 (2026-11-09 사용자 지시)
 *
 * 완성 알림 카드를 진행도 바 위에 두려고 `children`을 카드와 바 사이에 그린다.
 * 저장소에 jsdom이 없어 서버 렌더로 순서를 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/collections/[id]/__tests__/heroChildren.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/BlobAnimationBackground', () => ({ default: () => null }))

import ItemBookHeroSection from '../ItemBookHeroSection'

const BOOK = { name: '한강 컬렉션', description: '한강의 지점을 모았어요.', image_url: null }

describe('ItemBookHeroSection children', () => {
  it('대표 카드(제목) 다음, 진행도 바(n/m) 앞에 그린다', () => {
    const html = renderToStaticMarkup(
      <ItemBookHeroSection book={BOOK} slottedCount={3} totalBadgeCount={3}>
        <p>완성 알림</p>
      </ItemBookHeroSection>,
    )

    const title = html.indexOf('한강 컬렉션')
    const child = html.indexOf('완성 알림')
    const count = html.indexOf('3/3')
    expect(title).toBeGreaterThan(-1)
    expect(child).toBeGreaterThan(title)
    expect(count).toBeGreaterThan(child)
  })

  it('children이 없으면 아무것도 더하지 않는다', () => {
    const html = renderToStaticMarkup(<ItemBookHeroSection book={BOOK} slottedCount={1} totalBadgeCount={3} />)

    expect(html).not.toContain('완성 알림')
    expect(html).toContain('1/3')
  })
})
