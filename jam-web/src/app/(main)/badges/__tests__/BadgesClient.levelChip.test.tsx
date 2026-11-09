/**
 * 액티비티 배지 목록 — 무한레벨형 배지는 등급 칩 자리에 Lv.N 칩이 보인다 (2026-11-09 사용자 지시)
 *
 * 레벨형은 `rarity`가 NULL이라 등급 칩을 그릴 수 없다(마이그레이션 130). 이전에는 목록 카드에 `level`을 넘기지 않아
 * 레벨형 배지에 칩이 없었다. 저장소에 jsdom이 없어 서버 렌더 문자열로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/__tests__/BadgesClient.levelChip.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/badges',
  useSearchParams: () => new URLSearchParams(),
}))

import BadgesClient from '../BadgesClient'
import type { BadgeRow, UserActivityBadgeRow } from '@/types/database'

function activity(id: string, name: string, extra: Partial<BadgeRow>): { badge: BadgeRow; earned: UserActivityBadgeRow } {
  return {
    badge: { id, name, image_url: null, activity_types: [], rarity: null, level: null, ...extra } as unknown as BadgeRow,
    earned: { id: `e-${id}`, badge_id: id, earned_at: '2026-11-09T00:00:00Z' } as unknown as UserActivityBadgeRow,
  }
}

/** 배지 격자만 잘라 낸다 — 위쪽 필터(Select)의 «Rare» 같은 선택지 글자가 섞이지 않게 한다 */
function render(badges: ReturnType<typeof activity>[]) {
  const html = renderToStaticMarkup(
    <BadgesClient badges={badges} itemBooks={[]} itemBookProgress={[]} checkinBadges={[]} initialTab="activity" />,
  )
  return html.slice(html.indexOf('grid grid-cols-3'))
}

describe('BadgesClient 액티비티 탭 — 레벨형 배지 칩', () => {
  it('레벨형 배지는 Lv.N 칩을, 등급형 배지는 등급 칩을 그린다', () => {
    const html = render([activity('b1', '달리기 계열', { level: 3 }), activity('b2', '겨울잠', { rarity: 'rare' })])

    expect(html).toContain('Lv.3')
    expect(html).toContain('>Rare<')
    // 칩 하나씩이다 — 레벨형에 등급 칩이 같이 붙지 않는다
    expect(html.split('Lv.').length - 1).toBe(1)
    expect(html.split('>Rare<').length - 1).toBe(1)
  })

  it('등급이 Common인 배지도 Common 칩을 그린다(액티비티 목록만, 2026-11-09 사용자 지시)', () => {
    const html = render([activity('b3', '공통 배지', { rarity: 'common' }), activity('b4', '겨울잠', { level: 2 })])

    expect(html).toContain('>Common<')
    expect(html.split('>Common<').length - 1).toBe(1)
    // Common 칩의 면은 레벨 칩과 같다(--default-soft 면 + --foreground 글자, 2026-11-09 사용자 지시)
    const faceOf = (label: string) => html.match(new RegExp(`<span[^>]*style="([^"]*)"[^>]*>${label}</span>`))?.[1] ?? ''
    const common = faceOf('Common')
    const level = faceOf('Lv\\.2')
    for (const part of ['background:var(--default-soft)', 'color:var(--foreground)']) {
      expect(common, part).toContain(part)
      expect(level, part).toContain(part)
    }
    expect(common).not.toContain('--rarity-common')
    // 레벨형에는 Common 칩이 같이 붙지 않는다
    expect(html).toContain('Lv.2')
  })

  it('다른 화면의 기본값은 그대로다 — RarityBadge는 showCommon 없이는 Common을 그리지 않는다', async () => {
    const { RarityBadge } = await import('@ds/components/cards/RarityBadge')
    expect(renderToStaticMarkup(<RarityBadge rarity="common" size="md" />)).toBe('')
    expect(renderToStaticMarkup(<RarityBadge rarity="common" size="md" showCommon />)).toContain('Common')
  })
})
