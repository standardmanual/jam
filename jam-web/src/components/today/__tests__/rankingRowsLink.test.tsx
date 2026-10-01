/**
 * 「랭킹이면 행형」 판단이 한 곳이다 (티켓 20261001_2244, 상위 20260930_1453 조각 b7 — 2104 민지 발견)
 *
 * `list` 모양은 두 갈래다: 타일형(카드 전체가 링크)과 랭킹 행형(순위 행마다 프로필 링크, 카드 전체 링크 없음).
 * `TodayCard`(카드 전체 링크를 걸지 말지)와 `ListCard`(어느 갈래를 그릴지)가 같은 판정 함수(`isRankingRows`)를 쓰는데, 한쪽만 바뀌면
 * 행형 카드에 카드 전체 링크가 걸려 앵커가 겹치거나(순위 행이 앵커라서) 타일형 카드가 링크 없이 그려진다. 모든 자원 값에 대해
 * 「행형을 그리는 카드 = 카드 전체 링크가 없는 카드」임을 고정한다.
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 확인한다. 트래커는 표식 div로 바꾼다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/today/TodayCardTracker', () => ({
  default: ({ cardId, trackClick, children }: { cardId: string; trackClick?: boolean; children: ReactNode }) => (
    <div data-tracker={cardId} data-track-click={String(trackClick ?? true)}>
      {children}
    </div>
  ),
}))

import TodayCard from '../TodayCard'
import ListCard from '../ListCard'
import { CARD_RESOURCES, isRankingRows } from '@/lib/today/shape'
import type { CardResource } from '@/lib/today/shape'
import type { ListCardView } from '@/lib/today/cardView'

const TRACKING = { cardId: 'card-1', contentTypeId: null, templateType: 'badge_spotlight', shape: 'list' } as const

/** 타일·순위 둘 다 실은 list 표시 데이터 — 어느 갈래를 그리는지는 자원만 정한다. */
function listView(resource: CardResource, tracking = true): ListCardView {
  return {
    shape: 'list',
    resource,
    title: '목록 카드',
    label: '목록',
    href: '/somewhere',
    tiles: [
      { name: '타일 하나', imageUrl: null, earned: true },
      { name: '타일 둘', imageUrl: null, earned: false },
    ],
    ranking: {
      metricType: 'mission_progress',
      missionType: null,
      conditionFieldKey: null,
      totalParticipants: 2,
      entries: [
        { userId: 'u1', displayName: '순위 가', username: 'runner1', avatarUrl: null, value: 10, rank: 1 },
        { userId: 'u2', displayName: '순위 나', username: 'runner2', avatarUrl: null, value: 5, rank: 2 },
      ],
    },
    ...(tracking ? { tracking: { ...TRACKING } } : {}),
  }
}

/** 앵커가 다른 앵커 안에 들어 있는 경우의 수(여는 태그 기준 최대 깊이). */
function maxAnchorDepth(html: string): number {
  let depth = 0
  let max = 0
  for (const match of html.matchAll(/<a[\s>]|<\/a>/g)) {
    if (match[0] === '</a>') depth -= 1
    else {
      depth += 1
      max = Math.max(max, depth)
    }
  }
  return max
}

/** 트래커 바로 안쪽 첫 요소가 카드 전체 링크인지. */
const wrapsWholeCard = (html: string) => /^<div data-tracker="card-1"[^>]*><a /.test(html)

describe('랭킹 행형 판단 — TodayCard의 링크 범위와 ListCard의 갈래가 같은 함수를 쓴다', () => {
  it('isRankingRows는 랭킹 자원만 true다', () => {
    for (const resource of CARD_RESOURCES) expect(isRankingRows(resource)).toBe(resource === 'ranking')
  })

  it.each(CARD_RESOURCES.map((resource) => [resource] as const))('%s: 행형을 그리면 카드 전체 링크가 없고, 타일형이면 카드 전체가 링크다', (resource) => {
    const view = listView(resource)
    const home = renderToStaticMarkup(<TodayCard view={view} />)
    const body = renderToStaticMarkup(<ListCard view={view} />)

    const drawsRows = body.includes('순위 가')
    const drawsTiles = body.includes('타일 하나')
    // ListCard는 두 갈래 중 하나만 그린다
    expect(drawsRows).not.toBe(drawsTiles)
    // 그 갈래는 판정 함수가 정한 것이다
    expect(drawsRows).toBe(isRankingRows(resource))

    // 행형 = 카드 전체 링크 없음(노출만 기록), 타일형 = 카드 전체 링크(클릭도 기록)
    expect(wrapsWholeCard(home)).toBe(!drawsRows)
    expect(home).toContain(`data-track-click="${String(!drawsRows)}"`)
  })

  it.each(CARD_RESOURCES.map((resource) => [resource] as const))('%s: 앵커 안에 앵커가 없고 이중 링크가 없다', (resource) => {
    const html = renderToStaticMarkup(<TodayCard view={listView(resource)} />)
    expect(maxAnchorDepth(html)).toBe(1)
    if (isRankingRows(resource)) {
      // 제목 링크 하나(미션 대상 랭킹이고 href가 있을 때) + 행 링크 둘, 눌림은 링크마다 하나(카드 전체에는 없다)
      expect(html.match(/<a /g)).toHaveLength(3)
      expect(html.match(/jam-press/g)).toHaveLength(3)
    } else {
      expect(html.match(/<a /g)).toHaveLength(1)
      expect(html.match(/jam-press/g)).toHaveLength(1)
    }
  })

  it('미리보기(tracking 없음)는 두 갈래 모두 링크·트래커·눌림이 없다', () => {
    for (const resource of CARD_RESOURCES) {
      const html = renderToStaticMarkup(<TodayCard view={listView(resource, false)} />)
      expect(html).not.toContain('data-tracker')
      expect(html).not.toContain('<a')
      expect(html).not.toContain('jam-press')
    }
  })
})
