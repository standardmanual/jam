/**
 * 배지 소개 카드의 도장 위치 (티켓 20261127_0750)
 *
 * 도장은 배지 그림 칸이 아니라 카드 모서리(카드 셸의 직계 자식)에 붙는다.
 * 저장소에 jsdom이 없어 `renderToStaticMarkup`으로 마크업 문자열을 단언한다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'
import FeedBadgeIntroCard from '../feed/FeedBadgeIntroCard'
import type { FeedCardView } from '@/lib/today/cardView'
import { resolveFeedLook } from '@/lib/today/feedLook'

const NOW = new Date('2026-11-21T12:00:00+09:00')

function viewOf(slot: string): FeedCardView {
  const look = resolveFeedLook({
    card: { id: 'card-1', feed_type: 'badge_intro', stamp_enabled: true, stamp_slot: slot },
    feedType: 'badge_intro',
    valueSource: { resource: 'mission', endsAt: '2026-11-23T12:00:00+09:00', rewardPoints: 300 },
    now: NOW,
  })
  return {
    resource: 'mission',
    title: '낙엽 소리 따라\n걷는 한 주',
    feedType: 'badge_intro',
    imageUrl: 'https://cdn.example/cover.png',
    badgeImageUrl: 'https://cdn.example/badge.png',
    look,
  }
}

describe('배지 소개 카드의 도장', () => {
  it.each([
    ['badge-top-left', 'top:12px;left:12px'],
    ['badge-top-right', 'top:12px;right:12px'],
    ['badge-bottom-left', 'bottom:12px;left:12px'],
    ['badge-bottom-right', 'right:12px;bottom:12px'],
  ])('%s: 카드 모서리 안쪽 12px에 놓이고 배지 그림 칸 안에 들어 있지 않다', (slot, position) => {
    const html = renderToStaticMarkup(<FeedBadgeIntroCard view={viewOf(slot)} />)
    expect(html).toContain(position)
    // 배지 그림 칸은 그림 하나만 품는다. 도장(회전 transform)이 그 칸 안에 있으면 안 된다
    const artStart = html.indexOf('class="relative shrink-0"')
    expect(artStart).toBeGreaterThan(-1)
    const art = html.slice(artStart, html.indexOf('</div>', artStart))
    expect(art).not.toContain('rotate(')
    expect(html).toContain('rotate(')
  })
})
