/**
 * 목록(`list`) 모양 렌더 테스트 (티켓 20261001_2104, 상위 20260930_1453 조각 b5)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다. 링크·트래커는 틀(`CardFrame`)이 맡으므로
 * 여기서는 `TodayCard`를 거쳐 틀까지 포함한 출력으로 확인하고, 트래커는 표식 div로 바꿔 「그려졌는가」와 `trackClick`으로 본다(`CardFrame.test.tsx`와 같은 방식).
 * 가로로 밀었을 때의 끝 여백·잘려 보이는 다음 타일·카드 높이 같은 계산 스타일은 Story의 `play`(`ListCard.stories.tsx`)가 본다.
 * 이미지 로드 실패는 「주소 없음」과 같은 대체 경로를 타므로 여기서는 「주소 없음」으로 검증한다.
 */
import fs from 'node:fs'
import path from 'node:path'
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
import { FlaskIcon, MedalIcon } from '@/components/ui/icons'
import type { CardViewTile, ListCardView } from '@/lib/today/cardView'
import type { RankingBoardResult } from '@/lib/ranking/rankingDataSource'

const BODY_OPEN = '<div class="flex flex-col gap-[var(--spacing-12)] p-[var(--spacing-24)]">'
const TRACKING = { cardId: 'card-1', contentTypeId: 'T03', templateType: 'badge_spotlight', shape: 'list' } as const
const RANKING_TRACKING = { cardId: 'card-2', contentTypeId: 'T08', templateType: 'ranking_board', shape: 'list' } as const
const IMG = 'https://cdn.example/b.png'
const ICON_CLASS = 'w-6 h-6 text-text-inverse/60'
const icon = (Icon: typeof MedalIcon) => renderToStaticMarkup(<Icon className={ICON_CLASS} />)

const tile = (name: string, overrides: Partial<CardViewTile> = {}): CardViewTile => ({ name, imageUrl: IMG, earned: true, ...overrides })

function tilesView(overrides: Partial<ListCardView> = {}): ListCardView {
  return {
    shape: 'list',
    resource: 'badge',
    title: '성수동 배지 모음',
    label: '배지 소개',
    subtitle: '성수동 골목을 걸으면 얻을 수 있어요',
    facts: ['기간 상시', '보상 배지 3개'],
    description: '설명문입니다',
    href: '/badges',
    tiles: [tile('성수동 탐험가'), tile('한강 러너'), tile('뚝섬 지킴이')],
    ...overrides,
  }
}

const entry = (rank: number, userId: string, username: string | null = `runner${rank}`) => ({
  userId,
  displayName: `이름${rank}`,
  username,
  avatarUrl: null,
  value: 100 - rank * 5,
  rank,
})

function ranking(overrides: Partial<RankingBoardResult> = {}): RankingBoardResult {
  return {
    metricType: 'mission_progress',
    missionType: 'distance',
    conditionFieldKey: null,
    totalParticipants: 3,
    entries: [entry(1, 'u1'), entry(2, 'u2'), entry(3, 'u3')],
    ...overrides,
  }
}

function rankingView(overrides: Partial<ListCardView> = {}): ListCardView {
  return {
    shape: 'list',
    resource: 'ranking',
    title: '이번 주 러너 순위',
    label: '랭킹보드',
    subtitle: '지금 가장 많이 달린 러너예요',
    description: '매일 새로 계산돼요',
    href: '/missions/m1/status',
    tiles: [],
    ranking: ranking(),
    ...overrides,
  }
}

const render = (view: ListCardView, currentUserId?: string) => renderToStaticMarkup(<TodayCard view={view} currentUserId={currentUserId} />)
const live = (view: ListCardView): ListCardView => ({ ...view, tracking: view.resource === 'ranking' ? RANKING_TRACKING : TRACKING })

/** 앵커 중첩 깊이의 최댓값(여는 `<a `와 닫는 `</a>`를 순서대로 센다) */
function maxAnchorDepth(html: string): number {
  let depth = 0
  let max = 0
  for (const match of html.matchAll(/<a[ >]|<\/a>/g)) {
    depth += match[0] === '</a>' ? -1 : 1
    max = Math.max(max, depth)
  }
  return max
}

const anchors = (html: string) => html.match(/<a /g)?.length ?? 0
/** 카드·제목 영역 링크(`CardLink`)의 눌림 개수 — 포커스 윤곽선 클래스가 함께 붙은 `.jam-press`만 센다. 순위 행(`ListRowCard`)의 눌림은 `rowPressCount`다. */
const pressCount = (html: string) => html.match(/jam-press focus-visible/g)?.length ?? 0
/** 링크인 순위 행 하나가 `.jam-press` 하나를 가진다(티켓 20261001_2244: 옛 `active:scale-[0.98]`를 `.jam-press`로 통일). 카드·제목 링크 눌림은 뺀다. */
const rowPressCount = (html: string) => (html.match(/jam-press/g)?.length ?? 0) - pressCount(html)
const positionsInOrder = (html: string, needles: string[]) => needles.map((needle) => html.indexOf(needle))
const expectOrdered = (positions: number[]) => {
  for (const position of positions) expect(position).toBeGreaterThan(-1)
  expect([...positions].sort((a, b) => a - b)).toEqual(positions)
}

describe('ListCard 타일형 — 면(표면)과 본문', () => {
  it('흰 카드(inverse)이고 안쪽 여백은 인라인 0이다(본문 24px은 본문 칸이 가진다)', () => {
    const html = render(tilesView())
    expect(html).toMatch(/^<div[^>]*style="[^"]*background:var\(--color-surface-inverse\)[^"]*">/)
    expect(html).toMatch(/^<div[^>]*style="[^"]*padding:0[;"]/)
    expect(html).not.toContain('--layout-card-padding')
    expect(html).toContain(BODY_OPEN)
  })

  it('카드 면은 가장자리를 자르지 않는다 — 스크롤 칸이 자기 가장자리에서 잘려 보이고, 면에는 눌림·hover·active가 없다', () => {
    const html = render(tilesView())
    expect(html).not.toContain('class="overflow-hidden"')
    for (const needle of ['jam-press', 'hover:', 'active:', 'transition']) expect(html).not.toContain(needle)
  })

  it('칩 줄 → 제목 → 요약 → 필수 정보 → 설명문 → 타일 줄 → 끝 줄 순서다', () => {
    const html = render(tilesView())
    expectOrdered(
      positionsInOrder(html, ['padding:6px 10px', '<h3', '성수동 골목을 걸으면', '기간 상시', '보상 배지 3개', '설명문입니다', '<ul', '전체 보기']),
    )
  })

  it('제목은 24px·요약은 16px /60이고 필수 정보는 14px 굵게, 설명문은 14px /60이다(셋 다 공용 조각)', () => {
    const html = render(tilesView())
    expect(html).toContain('<h3 class="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-text-inverse line-clamp-2')
    expect(html).toContain('mt-[var(--spacing-4)] text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-inverse/60 line-clamp-2')
    expect(html.match(/font-bold/g)).toHaveLength(2)
    expect(html).toContain('text-[length:var(--text-small)] leading-[var(--leading-small)] text-text-inverse/60 line-clamp-2')
  })

  it('값이 없는 그룹은 그 그룹만 사라진다(칩 줄 + 제목 + 타일 줄만 남는다)', () => {
    const html = render(tilesView({ subtitle: undefined, facts: undefined, description: undefined, href: undefined }))
    expect(html).toContain('<h3')
    expect(html).toContain('<ul')
    expect(html).not.toContain('font-bold')
    expect(html).not.toContain('mt-[var(--spacing-4)] text-[length:var(--text-body)]')
    expect(html).not.toContain('line-clamp-2 break-keep break-words">설명문')
    expect(html).not.toContain('전체 보기')
  })

  it('titleInImage가 true여도 제목을 숨기지 않는다(이미지 칸이 없다)', () => {
    const html = render(tilesView({ titleInImage: true }))
    expect(html).toContain('<h3')
    expect(html).toContain('성수동 배지 모음')
    expect(html).toContain('성수동 골목을 걸으면')
  })

  it('옅은 글자는 /60 한 단계뿐이고 날 값(leading-tight·#666·/30·/40·/50·/70)이 없다', () => {
    const html = render(tilesView({ tiles: [tile('이름'), tile('그림 없음', { imageUrl: null })] }))
    expect(html).toContain('text-text-inverse/60')
    for (const level of ['/30', '/40', '/50', '/70']) expect(html).not.toContain(`text-text-inverse${level}`)
    for (const needle of ['leading-tight', '#666', 'body-sm']) expect(html).not.toContain(needle)
  })

  it('가운데 정렬은 타일 이름에만 있다(본문은 왼쪽 정렬)', () => {
    const html = render(tilesView({ tiles: [tile('가'), tile('나')] }))
    expect(html.match(/text-center/g)).toHaveLength(2)
    const body = html.slice(html.indexOf(BODY_OPEN), html.indexOf('<ul'))
    expect(body).not.toContain('text-center')
  })
})

describe('ListCard 타일형 — 타일 줄', () => {
  it('스크롤 칸은 카드 좌우 끝까지 번지고(-mx·px 24px) 안쪽 목록은 타일 간격 8px의 가로 flex이며 w-max로 끝 여백이 스크롤 영역에 들어간다', () => {
    const html = render(tilesView())
    expect(html).toContain('<div class="-mx-[var(--spacing-24)] overflow-x-auto px-[var(--spacing-24)]"><ul class="flex w-max gap-[var(--spacing-8)]">')
  })

  it('타일은 목록(ul) 안의 li이고 64px(w-16)로 줄지 않는다', () => {
    const html = render(tilesView({ tiles: [tile('가'), tile('나'), tile('다'), tile('라'), tile('마')] }))
    expect(html.match(/<li class="w-16 shrink-0">/g)).toHaveLength(5)
    expect(html.match(/<li/g)).toHaveLength(5)
  })

  it('스크롤 칸에 tabIndex를 주지 않고 화살표·페이드·스냅·「+N」을 더하지 않는다', () => {
    const html = render(tilesView({ tiles: Array.from({ length: 8 }, (_, i) => tile(`배지 ${i}`)) }))
    expect(html).not.toContain('tabindex')
    for (const needle of ['snap', 'gradient', 'fade', '+3', '+8']) expect(html).not.toContain(needle)
  })

  it('타일 이름은 12px(--text-caption) /60, 가운데, 2줄 말줄임이고 칸보다 넓히지 않는다', () => {
    const html = render(tilesView({ tiles: [tile('성수동 탐험가')] }))
    expect(html).toContain(
      '<p class="mt-[var(--spacing-4)] text-[length:var(--text-caption)] leading-[var(--leading-caption)] text-text-inverse/60 text-center line-clamp-2 break-keep break-words">성수동 탐험가</p>',
    )
  })

  it('타일은 그림 칸(64px 정사각, 옅은 면) 아래에 이름이 온다', () => {
    const html = render(tilesView({ tiles: [tile('성수동 탐험가')] }))
    expect(html).toContain('<li class="w-16 shrink-0"><div class="w-16 h-16 shrink-0 rounded-[var(--radius-cards)] bg-black/[0.04]')
    expect(html.indexOf('bg-black/[0.04]')).toBeLessThan(html.indexOf('성수동 탐험가'))
  })

  it('그림 alt는 늘 빈 값이다(이름이 바로 아래 글자로 보인다)', () => {
    const html = render(tilesView({ tiles: [tile('성수동 탐험가'), tile('한강 러너')] }))
    expect(html.match(/alt=""/g)).toHaveLength(2)
    expect(html).not.toContain('alt="성수동 탐험가"')
  })

  it('희귀도는 타일에 그리지 않는다(값이 있어도 칩이 없다)', () => {
    const html = render(tilesView({ tiles: [tile('가', { rarity: 'epic' }), tile('나', { rarity: 'mystic' }), tile('다', { rarity: 'rare' })] }))
    for (const name of ['Epic', 'Mystic', 'Rare']) expect(html).not.toContain(`>${name}</span>`)
  })

  it('카드 희귀도(JAM! 배지 1개 카드)는 칩 줄에 그대로 보인다', () => {
    expect(render(tilesView({ rarity: 'epic', tiles: [tile('가')] }))).toContain('>Epic</span>')
  })

  it('미보유(earned: false) 그림만 흑백이고 이름은 컬러다', () => {
    const html = render(tilesView({ tiles: [tile('보유', { earned: true }), tile('미보유', { earned: false })] }))
    expect(html.match(/grayscale/g)).toHaveLength(1)
    expect(html).toContain('w-full h-full object-cover grayscale')
    expect(html).not.toMatch(/grayscale[^>]*>[^<]*<\/p>/)
  })

  it('earned가 없으면(유저 정보가 없는 미리보기) 전부 컬러다', () => {
    const html = render(tilesView({ tiles: [tile('가', { earned: undefined }), tile('나', { earned: undefined })] }))
    expect(html).not.toContain('grayscale')
  })

  it('그림이 없으면 같은 64px 칸에 카드의 자원 아이콘을 그린다 — 재료(recipe)는 플라스크다', () => {
    const recipe = render(tilesView({ resource: 'recipe', tiles: [tile('재료', { imageUrl: null }), tile('배지', { imageUrl: IMG })] }))
    expect(recipe).toContain(icon(FlaskIcon))
    expect(recipe).not.toContain(icon(MedalIcon))
    expect(recipe.match(/w-16 h-16 shrink-0/g)).toHaveLength(2)
    expect(recipe.match(/<img/g)).toHaveLength(1)
    const badge = render(tilesView({ tiles: [tile('그림 없음', { imageUrl: null })] }))
    expect(badge).toContain(icon(MedalIcon))
    expect(badge).not.toContain('<img')
  })

  it('타일이 0개면(직접 만든 표시 데이터) 타일 줄만 그리지 않는다', () => {
    const html = render(tilesView({ tiles: [] }))
    expect(html).toContain('<h3')
    expect(html).not.toContain('<ul')
    expect(html).not.toContain('overflow-x-auto')
  })

  it('타일형은 ranking 값을 무시한다', () => {
    const html = render(tilesView({ ranking: ranking() }))
    expect(html).not.toContain('이름1')
    expect(html).not.toContain('아직 랭킹이 없어요')
  })
})

describe('ListCard 타일형 — 끝 줄과 링크·계측', () => {
  it('href가 있을 때만 「전체 보기 →」이고 화살표는 aria-hidden이다', () => {
    expect(render(tilesView())).toContain('전체 보기 <span aria-hidden="true">→</span>')
    expect(render(tilesView({ href: undefined }))).not.toContain('전체 보기')
  })

  it('링크가 있으면 카드 전체가 링크 하나이고 눌림도 하나다(클릭도 기록한다)', () => {
    const html = render(live(tilesView()))
    expect(html).toContain('data-track-click="true"')
    expect(anchors(html)).toBe(1)
    expect(pressCount(html)).toBe(1)
    expect(maxAnchorDepth(html)).toBe(1)
    expect(html).toContain('href="/badges"')
  })

  it('미리보기(tracking 없음)는 링크·트래커·눌림이 0개이고 href가 있으면 끝 줄만 보인다', () => {
    const html = render(tilesView())
    expect(anchors(html)).toBe(0)
    expect(html).not.toContain('data-tracker')
    expect(pressCount(html)).toBe(0)
    expect(html).toContain('전체 보기')
  })
})

describe('ListCard 행형 — 본문과 순위 행', () => {
  it('칩 줄 → 제목 → 요약 → 설명문 → 순위 행 순서다', () => {
    const html = render(live(rankingView()))
    expectOrdered(positionsInOrder(html, ['padding:6px 10px', '<h3', '지금 가장 많이 달린', '매일 새로 계산돼요', '이름1']))
  })

  it('순위 행은 8px 간격으로 쌓이고 순위 수만큼 그린다(1·3·10행)', () => {
    for (const count of [1, 3, 10]) {
      const entries = Array.from({ length: count }, (_, i) => entry(i + 1, `u${i + 1}`))
      const html = render(live(rankingView({ ranking: ranking({ entries }) })))
      expect(html).toContain('<div class="flex flex-col gap-[var(--spacing-8)]">')
      expect(html.match(/이름\d+/g)).toHaveLength(count)
    }
  })

  it('포디엄·메달·1~3위 색 강조가 없다', () => {
    const html = render(live(rankingView()))
    expect(html).not.toContain(icon(MedalIcon))
    expect(html).not.toContain('gold')
    expect(html).not.toContain('--text-h4')
  })

  it('끝 줄이 없다(href가 있어도 「전체 보기」를 그리지 않는다)', () => {
    for (const view of [live(rankingView()), rankingView()]) {
      const html = render(view)
      expect(html).not.toContain('전체 보기')
      expect(html).not.toContain('→')
    }
  })

  it('행형은 tiles 값을 무시한다', () => {
    const html = render(live(rankingView({ tiles: [tile('무시되는 타일')] })))
    expect(html).not.toContain('<ul')
    expect(html).not.toContain('무시되는 타일')
  })

  it('titleInImage가 true여도 제목을 숨기지 않는다', () => {
    expect(render(live(rankingView({ titleInImage: true })))).toContain('<h3')
  })

  it('값 포맷 3종: 미션 진행도·배지 개수·조건 필드(단위)', () => {
    const one = [entry(1, 'u1')]
    const mission = render(live(rankingView({ ranking: ranking({ metricType: 'mission_progress', missionType: 'distance', entries: one }) })))
    expect(mission).toContain('>95.0<')
    const badgeCount = render(live(rankingView({ ranking: ranking({ metricType: 'badge_count', missionType: null, entries: one }) })))
    expect(badgeCount).toContain('>95개<')
    const field = render(
      live(rankingView({ ranking: ranking({ metricType: 'condition_field', missionType: null, conditionFieldKey: 'distance_km', entries: one }) })),
    )
    expect(field).toContain('>95.0km<')
  })

  it('긴 표시 이름도 한 줄 말줄임이다(행 컴포넌트가 truncate)', () => {
    const long = { ...entry(1, 'u1'), displayName: '아주아주아주아주아주아주아주아주아주아주 긴 표시 이름' }
    expect(render(live(rankingView({ ranking: ranking({ entries: [long] }) })))).toContain('m-0 truncate')
  })
})

describe('ListCard 행형 — 링크 구조', () => {
  it('미션 대상 랭킹(홈): 제목 영역만 링크이고 눌림은 그 링크 하나, 행은 각자 프로필 링크다', () => {
    const html = render(live(rankingView()))
    expect(anchors(html)).toBe(1 + 3)
    expect(pressCount(html)).toBe(1)
    expect(rowPressCount(html)).toBe(3)
    expect(html).toContain('href="/missions/m1/status"')
    for (const username of ['runner1', 'runner2', 'runner3']) expect(html).toContain(`href="/${username}"`)
    // 제목 링크는 칩 줄·제목·요약·설명문을 모두 감싼다
    const titleLink = html.match(/<a [^>]*href="\/missions\/m1\/status"[^>]*>(.*?)<\/a>/)?.[1] ?? ''
    for (const needle of ['padding:6px 10px', '<h3', '지금 가장 많이 달린', '매일 새로 계산돼요']) expect(titleLink).toContain(needle)
    expect(titleLink).not.toContain('이름1')
  })

  it('앵커 안에 앵커가 없다(카드 전체 링크가 없다)', () => {
    expect(maxAnchorDepth(render(live(rankingView())))).toBe(1)
    expect(maxAnchorDepth(render(live(rankingView({ ranking: ranking({ metricType: 'badge_count', missionType: null }) }))))).toBe(1)
  })

  it('카드 단위 클릭은 기록하지 않고 노출만 기록한다(trackClick=false)', () => {
    const html = render(live(rankingView()))
    expect(html).toContain('data-tracker="card-2"')
    expect(html).toContain('data-track-click="false"')
  })

  it('유저 직접 지정(미션 대상이 아닌) 랭킹은 제목에 링크가 없고 눌림도 없다(행 링크만 있다)', () => {
    for (const metricType of ['badge_count', 'condition_field'] as const) {
      const html = render(live(rankingView({ ranking: ranking({ metricType, missionType: null, conditionFieldKey: 'distance_km' }) })))
      expect(anchors(html)).toBe(3)
      expect(pressCount(html)).toBe(0)
      expect(html).not.toContain('href="/missions/m1/status"')
      expect(html).toContain('data-tracker="card-2"')
    }
  })

  it('미션 대상이어도 href가 없으면 제목 링크가 없다', () => {
    const html = render(live(rankingView({ href: undefined })))
    expect(anchors(html)).toBe(3)
    expect(pressCount(html)).toBe(0)
  })

  it('탈퇴 등으로 username이 없는 행은 링크가 없다', () => {
    const html = render(live(rankingView({ ranking: ranking({ entries: [entry(1, 'u1'), entry(2, 'u2', null)] }) })))
    expect(anchors(html)).toBe(1 + 1)
    expect(html).toContain('이름2')
    expect(html).not.toContain('href="/null"')
  })

  it('미리보기(tracking 없음): 트래커·제목 링크·행 링크·눌림·내 순위 강조가 모두 없다(currentUserId를 넘겨도)', () => {
    const html = render(rankingView(), 'u2')
    expect(anchors(html)).toBe(0)
    expect(html).not.toContain('data-tracker')
    expect(pressCount(html)).toBe(0)
    expect(html).not.toContain('--text-h4')
    // 순위 행은 링크 없이 그대로 보인다
    for (const name of ['이름1', '이름2', '이름3']) expect(html).toContain(name)
  })
})

describe('ListCard 행형 — 내 순위 강조', () => {
  const emphasized = (html: string) => html.match(/font-size:var\(--text-h4\);font-weight:bold;color:var\(--color-primary\)/g)?.length ?? 0

  it.each([
    ['1위', 'u1'],
    ['중간', 'u2'],
    ['마지막', 'u3'],
  ])('홈에서 내 행이 %s이면 그 행의 순위·값만 24px 레드로 강조된다', (_label, userId) => {
    expect(emphasized(render(live(rankingView()), userId))).toBe(2)
  })

  it('내가 목록에 없으면 강조가 없다', () => {
    expect(emphasized(render(live(rankingView()), 'someone-else'))).toBe(0)
  })

  it('currentUserId가 없으면 강조가 없다(순위의 userId가 보는 사람 값이 아니다)', () => {
    expect(emphasized(render(live(rankingView())))).toBe(0)
  })
})

describe('ListCard 행형 — 빈 상태', () => {
  const cases: [string, ListCardView['ranking']][] = [
    ['ranking이 null', null],
    ['ranking이 없음', undefined],
    ['행이 0개', ranking({ entries: [] })],
  ]

  it.each(cases)('%s이면 순위 행 자리에 「아직 랭킹이 없어요」를 16px /60 왼쪽 정렬로 그린다', (_label, value) => {
    const html = render(live(rankingView({ ranking: value })))
    expect(html).toContain(
      '<p class="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text-inverse/60">아직 랭킹이 없어요</p>',
    )
    expect(html).not.toContain('flex flex-col gap-[var(--spacing-8)]')
    expect(html).not.toContain('text-center')
    expect(html).not.toContain('<svg')
  })

  it('빈 상태에서도 트래커(노출 기록)는 유지되고 순위 행 링크는 없다', () => {
    const html = render(live(rankingView({ ranking: null })))
    expect(html).toContain('data-tracker="card-2"')
    expect(html).toContain('data-track-click="false"')
    // 순위를 못 읽어 미션 대상인지 알 수 없으므로 제목 링크도 없다
    expect(anchors(html)).toBe(0)
  })

  it('행이 있으면 빈 문구는 없다', () => {
    expect(render(live(rankingView()))).not.toContain('아직 랭킹이 없어요')
  })
})

describe('서버·클라이언트 경계', () => {
  // `ListCard`는 서버 컴포넌트라 클라이언트 컴포넌트에 함수 prop(`formatValue`)을 넘기면 렌더 때 실패한다. 이 오류는 tsc·lint·renderToStaticMarkup으로는
  // 잡히지 않고 실제 렌더에서만 나므로(메인 작업 트리 실렌더로 따로 확인한다), 경계가 생기지 않도록 지시어 자체를 지키는 최소 감시만 둔다.
  const hasUseClient = (relative: string) =>
    /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/.*\n\s*)*['"]use client['"]/.test(fs.readFileSync(path.resolve(__dirname, relative), 'utf8'))

  it('ListCard와 RankingListRow에는 클라이언트 지시어가 없다', () => {
    expect(hasUseClient('../ListCard.tsx')).toBe(false)
    expect(hasUseClient('../../ranking/RankingListRow.tsx')).toBe(false)
  })

  it('감시 정규식이 지시어를 알아본다(클라이언트 컴포넌트 `SafeImage`로 확인)', () => {
    expect(hasUseClient('../../SafeImage.tsx')).toBe(true)
  })
})
