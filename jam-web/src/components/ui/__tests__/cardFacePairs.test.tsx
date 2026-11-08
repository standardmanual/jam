/**
 * 카드 면 레시피와 병존 쌍의 값 일치 (티켓 20261015_2133, 1회 카드 계열)
 *
 * 공통 Card default는 `--card-bg` + 투명 1px 테두리(티켓 20261107_2202), 그리드 카드 2종은 `--card-bg` + 외곽선 없음(티켓 20261107_2246) + `--radius-2xl` + 그림자 없음.
 *
 * 확인하는 것
 * ① MODULAR `Card` 세 톤(default·tint·inverse)의 면과 글자색 쌍
 * ② 병존 2쌍(BadgeGridCard·CollectionGridCard)의 서비스·MODULAR 면·테두리·선택 면이 같은 값이다
 *    (`npm run ds:check`는 색 쌍을 비교하지 못한다 — 이 파일이 그 자리를 맡는다)
 * ③ SlidingTabs 팔레트가 라이트 값이다(흰색 반투명 라벨이 크림 바탕에서 사라지던 것)
 * ④ UserSearchBar·RankingListRow의 면
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
import ServiceBadgeGridCard from '../BadgeGridCard'
import { BadgeGridCard as DsBadgeGridCard } from '@ds/components/patterns/BadgeGridCard'
import ServiceCollectionGridCard from '../CollectionGridCard'
import { CollectionGridCard as DsCollectionGridCard } from '@ds/components/patterns/CollectionGridCard'
import ServiceSlidingTabs from '../SlidingTabs'
import { SlidingTabs as DsSlidingTabs } from '@ds/components/navigation/SlidingTabs'
import RankingListRow from '@/components/ranking/RankingListRow'
import UserSearchBar from '@/app/(main)/UserSearchBar'
import BadgeConditionCard from '@/app/(main)/badges/[id]/BadgeConditionCard'

const BORDER = 'border:1px solid var(--border)'
// 공통 Card default(티켓 20261107_2202): --card-bg 면 + 투명 1px 테두리(박스 크기 유지)
const CARD_FACE = 'background:var(--card-bg)'


describe('MODULAR Card — 면과 글자색 쌍', () => {
  it('default는 흰 면이고 테두리·그림자가 없다(티켓 20261108_1940)', () => {
    const html = renderToStaticMarkup(<Card>내용</Card>)
    expect(html).toContain(CARD_FACE)
    expect(html).not.toContain('border:')
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
  })

  // 티켓 20261108_1940 — 모든 톤에서 외곽선을 걷어냈다. 박스 크기는 톤과 무관하게 같다.
  it('default와 inverse는 테두리가 없고 box-sizing·여백·반경이 같아 톤이 바뀌어도 박스 크기가 같다', () => {
    const boxOf = (tone: 'default' | 'inverse') => {
      const html = renderToStaticMarkup(<Card tone={tone}>내용</Card>)
      const style = /style="([^"]*)"/.exec(html)?.[1] ?? ''
      const pick = (prop: string) => new RegExp(`(?:^|;)${prop}:([^;]*)`).exec(style)?.[1]
      return {
        border: pick('border'),
        boxSizing: pick('box-sizing'),
        padding: pick('padding'),
        borderRadius: pick('border-radius'),
      }
    }
    expect(boxOf('inverse')).toEqual(boxOf('default'))
    expect(boxOf('inverse').border).toBeUndefined()
  })

  it('알 수 없는 tone은 default 면으로 그린다', () => {
    const html = renderToStaticMarkup(<Card tone={'unknown' as 'default'}>내용</Card>)
    expect(html).toContain(CARD_FACE)
    expect(html).not.toContain('border:')
  })
})

describe('BadgeGridCard 쌍 — 카드 면과 선택 면', () => {
  const props = { name: '배지', rarity: 'rare' as const }

  it('서비스: 면은 항상 bg-card-bg이고 선택은 블랙 2px 링(ring-2 ring-foreground)이다(티켓 20261107_2246)', () => {
    const base = renderToStaticMarkup(<ServiceBadgeGridCard {...props} />)
    expect(base).toContain('bg-card-bg')
    expect(base).not.toContain('border-border')
    expect(base).not.toContain('ring-2')

    const selected = renderToStaticMarkup(<ServiceBadgeGridCard {...props} selected />)
    expect(selected).toContain('bg-card-bg')
    expect(selected).toContain('ring-2 ring-foreground')
    expect(selected).not.toContain('bg-accent-soft')
    expect(selected).not.toContain('border-border')
  })

  it('MODULAR: 면은 항상 --card-bg(외곽선 없음), 선택은 블랙 2px 링이고 옛 빨강 리터럴이 없다', () => {
    const base = renderToStaticMarkup(<DsBadgeGridCard {...props} />)
    expect(base).toContain(CARD_FACE)
    expect(base).not.toContain(BORDER)
    expect(base).not.toContain('box-shadow')

    const selected = renderToStaticMarkup(<DsBadgeGridCard {...props} selected />)
    expect(selected).toContain(CARD_FACE)
    expect(selected).toContain('box-shadow:0 0 0 2px var(--foreground)')
    expect(selected).not.toContain('accent-soft')
    expect(selected).not.toContain(BORDER)
    expect(selected).not.toContain('232, 70, 31')
    expect(selected).not.toContain('232,70,31')
  })

  it('MODULAR highlighted는 inset 2px --link 링이고 외곽선은 없다', () => {
    const html = renderToStaticMarkup(<DsBadgeGridCard {...props} highlighted />)
    expect(html).toContain('box-shadow:inset 0 0 0 2px var(--link)')
    expect(html).not.toContain(BORDER)
  })
})

describe('CollectionGridCard 쌍 — 카드 면과 진행 바', () => {
  const props = { name: '컬렉션', collected: 3, total: 10 }

  it('서비스: 카드 면(bg-card-bg rounded-2xl p-3, 외곽선 없음)이다', () => {
    const html = renderToStaticMarkup(<ServiceCollectionGridCard {...props} />)
    expect(html).toContain('bg-card-bg rounded-2xl p-3')
  })

  it('MODULAR: 같은 면이고, 진행 바 트랙이 흰색 반투명이 아니라 ProgressBar 기본 트랙(--border)이다', () => {
    const html = renderToStaticMarkup(<DsCollectionGridCard {...props} />)
    expect(html).toContain(CARD_FACE)
    expect(html).not.toContain(BORDER)
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
    // `ListRow`의 tint 톤: 면은 --background-secondary, 테두리는 투명, lead 면은 --surface
    expect(html).toContain('background:var(--background-secondary);border:1px solid transparent')
    expect(html).not.toContain('border:1px solid var(--border)')
    expect(html).not.toContain('bg-background-secondary')
  })
})

describe('직접 만들던 흰 카드 면은 공통 Card와 같은 값이다', () => {
  it('BadgeConditionCard — 흰 면, 테두리·그림자 없음(옛 bg-surface rounded-2xl p-6 div를 Card로 교체)', () => {
    const html = renderToStaticMarkup(<BadgeConditionCard text="조건 문장" spec="누적 10회 이상" />)
    expect(html).toContain(CARD_FACE)
    expect(html).not.toContain('border:')
    expect(html).toContain('padding:var(--card-padding)')
    expect(html).toContain('flex flex-col gap-2')
    expect(html).not.toContain('bg-surface')
    expect(html).not.toContain('box-shadow')
  })
})
