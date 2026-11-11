/**
 * 체크인 배지 목록 — 이름 아래에 «×방문 횟수» 칩 (2026-11-09 사용자 지시)
 *
 * 아이템 배지의 등급 칩이 놓이는 자리(이름 바로 아래)에 같은 크기의 칩으로 그린다. 체크인 배지는 모두 Common이라
 * 등급 칩이 없어 이 칩이 그 자리를 쓴다. 저장소에 jsdom이 없어 서버 렌더 문자열로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/badges/__tests__/BadgesClient.visitChip.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/badges',
  useSearchParams: () => new URLSearchParams(),
}))

import BadgesClient, { type CheckinBadgeItem } from '../BadgesClient'
import type { BadgeRow } from '@/types/database'

function checkin(id: string, name: string, earnCount: number): CheckinBadgeItem {
  return {
    badge: { id, name, image_url: null, activity_types: [], rarity: 'common', level: null } as unknown as BadgeRow,
    category: 'mountain',
    categoryLabel: '산',
    earnCount,
    latestEarnedAt: earnCount > 0 ? '2026-11-09T00:00:00Z' : null,
  }
}

function render(items: CheckinBadgeItem[]) {
  const html = renderToStaticMarkup(
    <BadgesClient badges={[]} itemBooks={[]} itemBookProgress={[]} checkinBadges={items} initialTab="checkin" />,
  )
  return html.slice(html.indexOf('grid grid-cols-3'))
}

describe('BadgesClient 체크인 탭 — 방문 횟수 칩', () => {
  it('2회 이상 방문한 배지에는 이름 바로 아래에 ×횟수 칩을 그린다', () => {
    const html = render([checkin('c1', '북한산', 3), checkin('c2', '설악산', 12)])

    expect(html).toContain('×3')
    expect(html).toContain('×12')
    // 이름 다음에 칩이 온다
    expect(html.indexOf('×3')).toBeGreaterThan(html.indexOf('>북한산<'))
    expect(html.indexOf('×12')).toBeGreaterThan(html.indexOf('>설악산<'))
  })

  it('1회 방문한 배지에는 칩을 그리지 않는다(읽는 문장도 없다)', () => {
    const html = render([checkin('c1', '남산', 1), checkin('c2', '북한산', 2)])

    expect(html).not.toContain('×1')
    expect(html).not.toContain('1번 방문했어요')
    expect(html).toContain('×2')
    expect(html.split('×').length - 1).toBe(1)
  })

  it('등급 칩과 같은 크기(글자 --text-xs, 패딩 --chip-padding, 줄 높이 16px)다', () => {
    const html = render([checkin('c1', '북한산', 2)])
    const chip = html.match(/<span aria-hidden="true"[^>]*style="([^"]*)"[^>]*>×2<\/span>/)?.[1] ?? ''

    expect(chip).toContain('font-size:var(--text-xs)')
    expect(chip).toContain('padding:var(--chip-padding)')
    expect(chip).toContain('line-height:var(--text-xs--line-height)')
    expect(chip).toContain('var(--default-soft)')
  })

  it('보조기술에는 «N번 방문했어요»로 읽힌다', () => {
    const html = render([checkin('c1', '북한산', 5)])

    expect(html).toContain('<span class="sr-only">5번 방문했어요</span>')
  })
})
