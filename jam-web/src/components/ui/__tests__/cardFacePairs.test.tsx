/**
 * 카드 면 레시피와 병존 쌍의 값 일치 (티켓 20261015_2133, 1회 카드 계열)
 *
 * 카드 면은 하나다: `--surface`(흰) + `1px solid --border` + `--radius-2xl` + 그림자 없음.
 * 크림 바탕(`--background`)과 흰 면은 1.05:1이라 테두리가 없으면 카드가 보이지 않는다.
 *
 * 확인하는 것
 * ① MODULAR `Card` 세 톤(default·tint·inverse)의 면과 글자색 쌍
 * ② 병존 3쌍(ListRowCard·BadgeGridCard·CollectionGridCard)의 서비스·MODULAR 면·테두리·선택 면이 같은 값이다
 *    (`npm run ds:check`는 색 쌍을 비교하지 못한다 — 이 파일이 그 자리를 맡는다)
 * ③ 흰 면 위에서 효과가 없던 흰 그라디언트·inset 흰 하이라이트가 사라지고 그 자리에 면 + 테두리가 있다
 * ④ SlidingTabs 팔레트가 라이트 값이다(흰색 반투명 라벨이 크림 바탕에서 사라지던 것)
 * ⑤ UserSearchBar·RankingListRow의 면
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import { Card } from '@ds/components/cards/Card'
import ServiceListRowCard from '../ListRowCard'
import { ListRowCard as DsListRowCard } from '@ds/components/patterns/ListRowCard'
import ServiceBadgeGridCard from '../BadgeGridCard'
import { BadgeGridCard as DsBadgeGridCard } from '@ds/components/patterns/BadgeGridCard'
import ServiceCollectionGridCard from '../CollectionGridCard'
import { CollectionGridCard as DsCollectionGridCard } from '@ds/components/patterns/CollectionGridCard'
import ServiceSlidingTabs from '../SlidingTabs'
import { SlidingTabs as DsSlidingTabs } from '@ds/components/navigation/SlidingTabs'
import { BadgeTreeSummaryHeader } from '@ds/components/patterns/BadgeTreeSummaryHeader'
import { BadgeLevelGauge } from '@ds/components/patterns/BadgeLevelGauge'
import { BadgeStampRow } from '@ds/components/patterns/BadgeStampRow'
import { BadgeStageRail } from '@ds/components/patterns/BadgeStageRail'
import { RecentSyncBanner } from '@ds/components/patterns/RecentSyncBanner'
import BadgeTrophyGridCard from '@/components/badges/BadgeTrophyGridCard'
import RankingListRow from '@/components/ranking/RankingListRow'
import UserSearchBar from '@/app/(main)/UserSearchBar'
import BadgeConditionCard from '@/app/(main)/badges/[id]/BadgeConditionCard'

const SURFACE = 'background:var(--surface)'
const BORDER = 'border:1px solid var(--border)'

describe('MODULAR Card — 면과 글자색 쌍', () => {
  it('default는 흰 면 + 1px 테두리 + border-box이고 그림자가 없다', () => {
    const html = renderToStaticMarkup(<Card>내용</Card>)
    expect(html).toContain(SURFACE)
    expect(html).toContain(BORDER)
    expect(html).toContain('box-sizing:border-box')
    expect(html).toContain('color:var(--foreground)')
    expect(html).not.toContain('box-shadow')
  })

  it('tint는 --background-secondary 면이고 테두리가 없다(흰 카드 안 구획용)', () => {
    const html = renderToStaticMarkup(<Card tone="tint">내용</Card>)
    expect(html).toContain('background:var(--background-secondary)')
    expect(html).toContain('color:var(--foreground)')
    expect(html).not.toContain('border:')
  })

  it('inverse는 어두운 반전 면 위 --snow 글자다(어두운 면 위 어두운 글자가 아니다)', () => {
    const html = renderToStaticMarkup(<Card tone="inverse">내용</Card>)
    expect(html).toContain('background:var(--background-inverse)')
    expect(html).toContain('color:var(--snow)')
    expect(html).not.toContain('border:')
  })

  it('알 수 없는 tone은 default 면으로 그린다', () => {
    const html = renderToStaticMarkup(<Card tone={'unknown' as 'default'}>내용</Card>)
    expect(html).toContain(SURFACE)
    expect(html).toContain(BORDER)
  })
})

describe('ListRowCard 쌍 — 면·테두리·tint', () => {
  it('서비스 default는 bg-surface + border border-border다', () => {
    const html = renderToStaticMarkup(<ServiceListRowCard title="제목" />)
    expect(html).toContain('bg-surface')
    expect(html).toContain('border border-border')
    expect(html).not.toContain('bg-background-secondary')
  })

  it('서비스 tint는 bg-background-secondary이고 테두리·bg-surface가 없다', () => {
    const html = renderToStaticMarkup(<ServiceListRowCard tone="tint" title="제목" />)
    expect(html).toContain('bg-background-secondary')
    expect(html).not.toContain('border-border')
    expect(html).not.toContain('bg-surface')
  })

  it('MODULAR default·tint가 서비스와 같은 면·테두리 값이다', () => {
    const def = renderToStaticMarkup(<DsListRowCard title="제목" />)
    expect(def).toContain(SURFACE)
    expect(def).toContain(BORDER)

    const tint = renderToStaticMarkup(<DsListRowCard tone="tint" title="제목" />)
    expect(tint).toContain('background:var(--background-secondary)')
    expect(tint).not.toContain('border:')
  })

  it('알 수 없는 tone은 default로 그린다(서비스·MODULAR 모두)', () => {
    expect(renderToStaticMarkup(<ServiceListRowCard tone={'x' as 'default'} title="제목" />)).toContain('border border-border')
    expect(renderToStaticMarkup(<DsListRowCard tone={'x' as 'default'} title="제목" />)).toContain(BORDER)
  })
})

describe('BadgeGridCard 쌍 — 카드 면과 선택 면', () => {
  const props = { name: '배지', rarity: 'rare' as const }

  it('서비스: 기본은 bg-surface + border, 선택은 bg-accent-soft 하나만(두 배경 유틸리티가 쌓이지 않는다)', () => {
    const base = renderToStaticMarkup(<ServiceBadgeGridCard {...props} />)
    expect(base).toContain('bg-surface')
    expect(base).toContain('border border-border')
    expect(base).not.toContain('bg-background ')

    const selected = renderToStaticMarkup(<ServiceBadgeGridCard {...props} selected />)
    expect(selected).toContain('bg-accent-soft')
    expect(selected).toContain('border border-border')
    // 카드 면 클래스(`bg-surface rounded-2xl` 앞 배경)가 선택 면과 겹치지 않는다
    expect(selected.match(/<div class="([^"]*)"/)?.[1]).not.toMatch(/\bbg-surface\b/)
  })

  it('MODULAR: 기본은 --surface + 1px --border, 선택은 --accent-soft이고 옛 빨강 리터럴이 없다', () => {
    const base = renderToStaticMarkup(<DsBadgeGridCard {...props} />)
    expect(base).toContain(SURFACE)
    expect(base).toContain(BORDER)
    expect(base).not.toContain('box-shadow')

    const selected = renderToStaticMarkup(<DsBadgeGridCard {...props} selected />)
    expect(selected).toContain('background:var(--accent-soft)')
    expect(selected).toContain(BORDER)
    expect(selected).not.toContain('232, 70, 31')
    expect(selected).not.toContain('232,70,31')
  })

  it('MODULAR highlighted는 inset 2px --link 링이고 테두리는 그대로다', () => {
    const html = renderToStaticMarkup(<DsBadgeGridCard {...props} highlighted />)
    expect(html).toContain('box-shadow:inset 0 0 0 2px var(--link)')
    expect(html).toContain(BORDER)
  })
})

describe('CollectionGridCard 쌍 — 카드 면과 진행 바', () => {
  const props = { name: '컬렉션', collected: 3, total: 10 }

  it('서비스: BadgeGridCard와 같은 면(bg-surface border border-border rounded-2xl p-3)이다', () => {
    const html = renderToStaticMarkup(<ServiceCollectionGridCard {...props} />)
    expect(html).toContain('bg-surface border border-border rounded-2xl p-3')
  })

  it('MODULAR: 같은 면이고, 진행 바 트랙이 흰색 반투명이 아니라 ProgressBar 기본 트랙(--border)이다', () => {
    const html = renderToStaticMarkup(<DsCollectionGridCard {...props} />)
    expect(html).toContain(SURFACE)
    expect(html).toContain(BORDER)
    expect(html).toContain('padding:var(--spacing-12)')
    expect(html).toContain('background:var(--border)')
    expect(html).not.toContain('rgba(255,255,255')
    expect(html).not.toContain('rgba(255, 255, 255')
  })

  it('서비스·MODULAR 모두 카운트 글자는 --link다', () => {
    expect(renderToStaticMarkup(<ServiceCollectionGridCard {...props} />)).toContain('text-[color:var(--link)]')
    expect(renderToStaticMarkup(<DsCollectionGridCard {...props} />)).toContain('color:var(--link)')
  })
})

describe('흰 면 위 흰 그라디언트·inset 흰 하이라이트는 걷고 면 + 테두리를 둔다', () => {
  const NO_WHITE_HIGHLIGHT = ['linear-gradient(160deg', 'rgba(255,255,255', 'inset 0 1px 0']

  function expectFlatCard(html: string) {
    expect(html).toContain(SURFACE)
    expect(html).toContain(BORDER)
    for (const needle of NO_WHITE_HIGHLIGHT) expect(html).not.toContain(needle)
  }

  it('BadgeTreeSummaryHeader', () => {
    expectFlatCard(renderToStaticMarkup(<BadgeTreeSummaryHeader earnedCount={1} totalCount={4} byRarity={{}} />))
  })

  it('BadgeLevelGauge', () => {
    expectFlatCard(
      renderToStaticMarkup(
        <BadgeLevelGauge name="걸어온 거리" level={1} current="10km" next="20km" left="10km 남음" fraction={0.5} />,
      ),
    )
  })

  it('BadgeStampRow', () => {
    expectFlatCard(renderToStaticMarkup(<BadgeStampRow name="산책" count={3} fraction={0.4} />))
  })

  it('BadgeStageRail — 카드 면과 게이트 점선(흰색이 아니라 --border)', () => {
    const html = renderToStaticMarkup(
      <BadgeStageRail
        familyName="한강"
        stops={[]}
        nextRarityLabel={null}
        frontierProgress={null}
        progressStopId={null}
        regretLine={null}
        onLockClick={() => {}}
      />,
    )
    expectFlatCard(html.replace(/\.ds-rail-gate-link\{[^}]*\}/, ''))
    expect(html).toMatch(/\.ds-rail-gate-link\{background:repeating-linear-gradient\(90deg, var\(--border\) 0 4px/)
  })

  it('RecentSyncBanner — 상태 신호는 8px 점이 맡고 면은 표준 테두리다', () => {
    const html = renderToStaticMarkup(<RecentSyncBanner visible comparisonMessage={null} />)
    expect(html).toContain(SURFACE)
    expect(html).toContain(BORDER)
    for (const needle of NO_WHITE_HIGHLIGHT) expect(html).not.toContain(needle)
    // 윤곽을 만들던 inset 링(--progress-latest-soft)은 면에서 걷혔다. 점의 후광만 남는다
    expect(html).not.toContain('box-shadow:inset')
    expect(html).toContain('width:8px;height:8px')
  })

  it('서비스 BadgeTrophyGridCard — bg-surface + border이고 인라인 그라디언트가 없다', () => {
    const html = renderToStaticMarkup(
      <BadgeTrophyGridCard name="배지" rarity="rare" href="/badges/1" earned />,
    )
    expect(html).toContain('bg-surface border border-border')
    for (const needle of NO_WHITE_HIGHLIGHT) expect(html).not.toContain(needle)
    expect(html).not.toContain('style="background')
  })
})

describe('SlidingTabs 팔레트 — 크림 바탕·흰 카드 위에서 라벨이 보인다', () => {
  const items = [
    { key: 'a', label: '가' },
    { key: 'b', label: '나' },
  ] as const

  it('서비스 onSurface: 트랙 --default, 비활성 --muted, hover --foreground, 활성 --background-inverse + --snow', () => {
    const html = renderToStaticMarkup(<ServiceSlidingTabs items={items} value="a" onChange={() => {}} />)
    expect(html).toContain('--tabs-bar-bg:var(--default)')
    expect(html).toContain('--tabs-pill-bg:var(--background-inverse)')
    expect(html).toContain('--tabs-text-muted:var(--muted)')
    expect(html).toContain('--tabs-text-hover:var(--foreground)')
    expect(html).toContain('--tabs-text-active:var(--snow)')
    expect(html).not.toContain('rgba(255, 255, 255')
  })

  it('서비스 onCard: 비활성 --muted(검정 40% 아님), hover --foreground, 활성 --accent + --accent-foreground', () => {
    const html = renderToStaticMarkup(
      <ServiceSlidingTabs items={items} value="a" onChange={() => {}} variant="onCard" />,
    )
    expect(html).toContain('--tabs-text-muted:var(--muted)')
    expect(html).toContain('--tabs-text-hover:var(--foreground)')
    expect(html).toContain('--tabs-pill-bg:var(--accent)')
    expect(html).toContain('--tabs-text-active:var(--accent-foreground)')
    expect(html).not.toContain('rgba(0, 0, 0, 0.4)')
  })

  it('MODULAR는 서비스와 같은 값이다(비활성 --muted, onSurface 트랙 --default)', () => {
    const onSurface = renderToStaticMarkup(
      <DsSlidingTabs items={[...items]} value="a" onChange={() => {}} outlined={false} />,
    )
    expect(onSurface).toContain('background:var(--default)')
    expect(onSurface).toContain('color:var(--muted)')
    expect(onSurface).toContain('color:var(--snow)')
    expect(onSurface).not.toContain('rgba(255, 255, 255')

    const onCard = renderToStaticMarkup(
      <DsSlidingTabs items={[...items]} value="a" onChange={() => {}} variant="onCard" outlined={false} />,
    )
    expect(onCard).toContain('color:var(--muted)')
    expect(onCard).not.toContain('rgba(0, 0, 0, 0.4)')
  })
})

describe('UserSearchBar — 흰 면 + 1px field 테두리, 글자 --foreground, 안내 글자 --muted', () => {
  it('어두운 반전 면·옅은 흰 글자가 없고 focus-within 표시가 있다', () => {
    const html = renderToStaticMarkup(<UserSearchBar />)
    expect(html).toContain('bg-surface')
    expect(html).toContain('border-field-border')
    expect(html).toContain('text-foreground')
    expect(html).toContain('placeholder:text-muted')
    expect(html).toContain('text-muted')
    expect(html).toContain('focus-within:border-link')
    expect(html).not.toContain('bg-background-inverse')
    expect(html).not.toContain('text-snow')
  })
})

describe('RankingListRow — 카드 안 행이라 tint 면(테두리 없음)', () => {
  it('bg-background-secondary이고 border-border·bg-surface가 없다', () => {
    const html = renderToStaticMarkup(
      <RankingListRow
        entry={{ userId: 'u1', displayName: '러너', username: 'runner', avatarUrl: null, value: 5, rank: 4 }}
        maxValue={10}
        isMe={false}
        formatValue={(v) => `${v}km`}
      />,
    )
    expect(html).toContain('bg-background-secondary')
    expect(html).not.toContain('border-border')
    expect(html).not.toContain('bg-surface')
  })
})

describe('직접 만들던 흰 카드 면은 공통 Card와 같은 값이다', () => {
  it('BadgeConditionCard — 흰 면 + 1px 테두리, 그림자 없음(옛 bg-surface rounded-2xl p-6 div를 Card로 교체)', () => {
    const html = renderToStaticMarkup(<BadgeConditionCard text="조건 문장" spec="누적 10회 이상" />)
    expect(html).toContain(SURFACE)
    expect(html).toContain(BORDER)
    expect(html).toContain('padding:var(--layout-card-padding)')
    expect(html).toContain('flex flex-col gap-2')
    expect(html).not.toContain('bg-surface')
    expect(html).not.toContain('box-shadow')
  })
})
