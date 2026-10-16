/**
 * 짧은 소식(`brief`) 모양 렌더 테스트 (티켓 20261001_1458, 상위 20260930_1453 b2)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다.
 * 계산 스타일(높이 88px·가로 넘침·윤곽선 색)은 이 방식으로 볼 수 없어 Story의 `play`(`BriefCard.stories.tsx`)가 본다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import BriefCard from '../BriefCard'
import {
  BookIcon,
  FlaskIcon,
  HourglassIcon,
  MedalIcon,
  NewspaperIcon,
  PackageIcon,
  PinIcon,
  RankingIcon,
  TargetIcon,
} from '@/components/ui/icons'
import { CARD_RESOURCES, type BriefCardView, type CardResource } from '@/lib/today/cardView'

function makeView(overrides: Partial<BriefCardView> = {}): BriefCardView {
  return {
    shape: 'brief',
    resource: 'mission',
    title: '한강 러닝 챌린지',
    label: '미션',
    facts: ['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'],
    href: '/missions/m1',
    ...overrides,
  }
}

const render = (overrides: Partial<BriefCardView> = {}) => renderToStaticMarkup(<BriefCard view={makeView(overrides)} />)

/** 필수 정보 줄(`<p>`)의 클래스와 글자 */
function factParagraphs(html: string): { className: string; text: string }[] {
  return [...html.matchAll(/<p class="([^"]*)">([^<]*)<\/p>/g)].map((m) => ({ className: m[1], text: m[2] }))
}

const SLOT_ICON_CLASS = 'w-6 h-6 text-muted'
const slotIcon = (Icon: typeof TargetIcon) => renderToStaticMarkup(<Icon className={SLOT_ICON_CLASS} />)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BriefCard — 면(표면)', () => {
  it('흰 카드(기본 톤, 흰 면 + 1px 테두리)이고 최소 높이 88px·가운데 정렬 가로 배치이며, 안쪽 여백은 위아래 12·좌우 16이다', () => {
    const html = render()
    expect(html).toContain('min-h-[88px] flex items-center gap-3')
    expect(html).toContain('background:var(--surface)')
    expect(html).toContain('border:1px solid var(--border)')
    expect(html).not.toContain('--background-inverse')
    // Card가 주는 24px 기본 여백(--layout-card-padding)을 같은 인라인 style로 덮었다 — 클래스로는 덮이지 않는다
    expect(html).toContain('padding:var(--spacing-12) var(--spacing-16)')
    expect(html).not.toContain('--layout-card-padding')
  })

  it('면에는 눌림(jam-press)이 없다 — 눌림 대상은 CardFrame의 링크 하나다', () => {
    expect(render()).not.toContain('jam-press')
  })

  it('제목은 h3, 16px·2줄 말줄임·어절 단위 줄바꿈이고 굵게 하지 않는다', () => {
    const html = render({ title: '제목이 아주 길어서 두 줄을 넘겨도 말줄임으로 끝나야 하는 한강 러닝 챌린지 이벤트 안내' })
    expect(html).toMatch(
      /<h3 class="text-base text-foreground line-clamp-2 break-keep break-words">제목이 아주/,
    )
    expect(html).not.toMatch(/<h3[^>]*font-(bold|semibold|medium)/)
  })

  it('필수 정보가 없으면 제목 아래에 아무 줄도 만들지 않는다', () => {
    const html = render({ facts: undefined })
    expect(factParagraphs(html)).toHaveLength(0)
    expect(html).not.toContain('mt-1')
    expect(render({ facts: [] })).toBe(html)
  })
})

describe('BriefCard — 필수 정보', () => {
  it.each([[0], [1], [2]])('%i줄이면 그 수만큼 한 줄에 하나씩 그린다', (count) => {
    const facts = ['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'].slice(0, count)
    const lines = factParagraphs(render({ facts }))
    expect(lines.map((l) => l.text)).toEqual(facts)
  })

  it('14px(--text-sm)·옅은 글자 text-muted이고 말줄임 없이 줄바꿈한다(line-clamp·truncate 없음)', () => {
    const lines = factParagraphs(render())
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(line.className).toBe(
        'text-sm text-muted break-keep break-words',
      )
      expect(line.className).not.toContain('line-clamp')
      expect(line.className).not.toContain('truncate')
      // 서비스에서 --text-base은 16px이라 14px 자리에 쓰면 크기가 틀린다
      expect(line.className).not.toContain('body-sm')
    }
  })

  it('필수 정보 앞에 아이콘을 붙이지 않는다', () => {
    const html = render({ thumbnailUrl: undefined })
    const factsBlock = html.slice(html.indexOf('mt-1'))
    expect(factsBlock).not.toContain('<svg')
  })

  it('필수 정보 위 간격은 --spacing-4다', () => {
    expect(render()).toContain('<div class="mt-1"><p')
  })
})

describe('BriefCard — 칩 줄', () => {
  it('왼쪽부터 라벨 칩 · 지역 핀 · 희귀도 칩 순서이고 칩 줄 아래 간격은 --spacing-8이다', () => {
    const html = render({ resource: 'badge', regionLabel: '성수동', rarity: 'epic', label: '배지 소개' })
    expect(html).toContain('flex items-center gap-2 mb-2')
    const label = html.indexOf('배지 소개</span>')
    const pin = html.indexOf('성수동')
    const rarity = html.indexOf('Epic')
    expect(label).toBeGreaterThan(-1)
    expect(label).toBeLessThan(pin)
    expect(pin).toBeLessThan(rarity)
  })

  it('라벨 칩은 MODULAR LabelChip이고 줄어들지 않는다(shrink-0)', () => {
    expect(render()).toMatch(/<span class="shrink-0" style="[^"]*padding:6px 10px[^"]*">미션<\/span>/)
  })

  it('라벨이 없으면 칩을 그리지 않는다', () => {
    expect(render({ label: undefined })).not.toContain('padding:6px 10px')
  })

  it('지역 핀: 옛 마크업(caption·text-muted·핀 w-3 h-3)에 min-w-0과 글자 말줄임을 더했다', () => {
    const html = render({ regionLabel: '성수동 서울숲 근처' })
    expect(html).toContain(
      '<span class="inline-flex items-center gap-1 min-w-0 text-xs text-muted">',
    )
    expect(html).toContain('<span class="truncate">성수동 서울숲 근처</span>')
    expect(html).toContain(renderToStaticMarkup(<PinIcon className="w-3 h-3 shrink-0" />))
  })

  it('지역 값이 없으면 핀을 그리지 않는다', () => {
    expect(render({ regionLabel: undefined })).not.toContain('truncate')
  })

  it('드랍은 지역 핀을 칩 줄에 그리지 않는다(필수 정보 「지역 ○○」 줄이 같은 값을 낸다)', () => {
    const html = render({ resource: 'drop', label: '드랍', regionLabel: '한강공원', facts: ['지역 한강공원'] })
    expect(html).not.toContain('truncate')
    expect(html.match(/한강공원/g)).toHaveLength(1)
  })

  it('드랍이 아닌 자원은 지역 값이 있으면 핀을 그리고 필수 정보와 값이 겹치지 않는다', () => {
    const html = render({ resource: 'auto', label: '지역 트렌드', regionLabel: '성수동', facts: undefined })
    expect(html).toContain('<span class="truncate">성수동</span>')
  })
})

describe('BriefCard — 희귀도 칩 (JAM! 배지 1개 카드)', () => {
  const badgeView = (rarity: BriefCardView['rarity']) => render({ resource: 'badge', label: '배지 소개', facts: ['한강 러너'], rarity })

  it.each([['rare', 'Rare'], ['epic', 'Epic'], ['mystic', 'Mystic']])('%s는 %s 칩이고 md 크기(--text-xs)·줄어들지 않는다', (rarity, text) => {
    const html = badgeView(rarity)
    expect(html).toMatch(new RegExp(`<span class="shrink-0" style="[^"]*font-size:var\\(--text-xs\\)[^"]*">${text}</span>`))
  })

  it('Common은 칩이 없다', () => {
    const html = badgeView('common')
    expect(html).not.toContain('Common')
    expect(html).not.toContain('--rarity-')
  })

  it('등급 없음(null, 무한레벨형)은 이름만 보이고 칩이 없다', () => {
    const html = badgeView(null)
    expect(html).not.toContain('--rarity-')
    expect(html).toContain('한강 러너')
  })

  it('희귀도 값이 없는 카드(JAM! 배지가 아닌 자원)에는 칩이 없다', () => {
    expect(render()).not.toContain('--rarity-')
  })

  it('알 수 없는 희귀도 값은 칩을 그리지 않는다(Common으로 떨어뜨리지 않는다)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = badgeView('legendary')
    expect(html).not.toContain('--rarity-')
    expect(html).not.toContain('Common')
  })

  it('희귀도 칩은 흑백으로 만들지 않는다(미보유 배지여도 grayscale은 썸네일에만 걸린다)', () => {
    const html = render({ resource: 'badge', rarity: 'rare', thumbnailUrl: 'https://cdn.example/a.png', thumbnailDimmed: true })
    const rarityChip = html.slice(html.indexOf('Rare') - 200, html.indexOf('Rare') + 10)
    expect(rarityChip).not.toContain('grayscale')
  })
})

describe('BriefCard — 끝 ›', () => {
  it('href가 있으면 aria-hidden으로 그린다(장식, 줄어들지 않고 text-muted)', () => {
    expect(render()).toContain('<span class="shrink-0 text-muted" aria-hidden="true">›</span>')
  })

  it('href가 없으면 이동한다는 암시를 주지 않으려고 그리지 않는다', () => {
    expect(render({ href: undefined })).not.toContain('›')
  })
})

describe('BriefCard — 옅은 글자', () => {
  it('옅은 글자는 text-muted 한 단계뿐이다(불투명도 글자색 없음)', () => {
    const html = render({
      resource: 'badge',
      regionLabel: '성수동',
      rarity: 'rare',
      thumbnailUrl: 'https://cdn.example/a.png',
    })
    expect(html).toContain('text-muted')
    expect(html).not.toContain('text-snow')
    expect(html).not.toMatch(/text-(?:muted|foreground)\/\d/)
    expect(html).not.toContain('/30')
    expect(html).not.toContain('/40')
  })

  it('아이콘 칸 모양에도 /30·/40이 없다', () => {
    for (const resource of CARD_RESOURCES) {
      const html = render({ resource })
      expect(html).not.toContain('/30')
      expect(html).not.toContain('/40')
    }
  })
})

describe('BriefCard — 64px 칸', () => {
  it('칸은 64px 정사각·--radius-2xl·--background-secondary 면이고 왼쪽에 줄어들지 않게 고정된다', () => {
    const html = render()
    expect(html).toContain(
      'w-16 h-16 shrink-0 rounded-2xl bg-background-secondary overflow-hidden flex items-center justify-center',
    )
    // 칸은 글자 열보다 앞에 있다
    expect(html.indexOf('w-16 h-16')).toBeLessThan(html.indexOf('flex-1 min-w-0'))
  })

  it('썸네일 주소가 있으면 64×64 이미지를 그린다(alt는 비어 있다 — 배지 이름이 글자로 보인다)', () => {
    const html = render({ resource: 'badge', facts: ['한강 러너'], thumbnailUrl: 'https://cdn.example/a.png' })
    expect(html).toMatch(/<img[^>]*alt=""/)
    expect(html).toContain('src="https://cdn.example/a.png"')
    expect(html).toContain('width="64"')
    expect(html).toContain('height="64"')
    expect(html).toContain('class="w-full h-full object-cover"')
    expect(html).not.toContain('grayscale')
  })

  it('미보유 배지(thumbnailDimmed)는 썸네일만 흑백이다', () => {
    const html = render({
      resource: 'badge',
      thumbnailUrl: 'https://cdn.example/a.png',
      thumbnailDimmed: true,
    })
    expect(html).toContain('class="w-full h-full object-cover grayscale"')
    expect(html.match(/grayscale/g)).toHaveLength(1)
  })

  it('썸네일 값이 없으면(유저 정보가 없는 미리보기 포함) 컬러이고, 값이 없으면 이미지 대신 자원 아이콘이다', () => {
    const html = render({ resource: 'badge' })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('grayscale')
    expect(html).toContain(slotIcon(MedalIcon))
  })

  it('썸네일 주소가 공백뿐이어도 칸과 카드 높이가 변하지 않게 아이콘을 그린다(SafeImage fallback)', () => {
    const html = render({ resource: 'badge', thumbnailUrl: '   ' })
    expect(html).not.toContain('<img')
    expect(html).toContain(slotIcon(MedalIcon))
    expect(html).toContain('w-16 h-16')
  })

  it('아이콘 칸에는 흑백이 없다', () => {
    expect(render({ resource: 'mission' })).not.toContain('grayscale')
  })
})

describe('BriefCard — 자원 → 아이콘 (아이콘 모양으로만 구분, 색 없음)', () => {
  const EXPECTED: Record<CardResource, typeof TargetIcon> = {
    mission: TargetIcon,
    drop: PackageIcon,
    recipe: FlaskIcon,
    badge: MedalIcon,
    article: NewspaperIcon,
    ranking: RankingIcon,
    collection: BookIcon,
    auto: HourglassIcon,
  }

  it.each(CARD_RESOURCES.map((resource) => [resource]))('%s의 아이콘이 정해진 모양이다', (resource) => {
    expect(render({ resource, facts: undefined })).toContain(slotIcon(EXPECTED[resource]))
  })

  it('8개 자원의 아이콘 모양은 서로 다르다', () => {
    const shapes = new Set(CARD_RESOURCES.map((resource) => slotIcon(EXPECTED[resource])))
    expect(shapes.size).toBe(CARD_RESOURCES.length)
  })

  it('자동 카드는 템플릿이 지역 트렌드면 핀, 진행 알림이면 모래시계다(지역 값과 무관, 티켓 20261001_2244)', () => {
    const trend = render({ resource: 'auto', template: 'location_trend', regionLabel: '성수동', facts: undefined })
    expect(trend).toContain(slotIcon(PinIcon))
    expect(trend).not.toContain(slotIcon(HourglassIcon))
    // 진행 알림은 지역 값이 있어도 모래시계다
    const nudge = render({ resource: 'auto', template: 'progress_nudge', regionLabel: '성수동', facts: undefined })
    expect(nudge).toContain(slotIcon(HourglassIcon))
    expect(nudge).not.toContain(slotIcon(PinIcon))
    // 구분 값이 없는 직접 만든 표시 데이터는 자원의 기본 아이콘(모래시계)이다
    expect(render({ resource: 'auto', facts: undefined })).toContain(slotIcon(HourglassIcon))
  })

  it('지역 값이 있어도 자동 카드가 아니면 자원 아이콘이 그대로다', () => {
    expect(render({ resource: 'mission', regionLabel: '성수동', facts: undefined })).toContain(slotIcon(TargetIcon))
  })

  it('아이콘에 색을 입히지 않는다(text-muted 하나뿐, 제3의 컬러 없음)', () => {
    for (const resource of CARD_RESOURCES) {
      const html = render({ resource })
      expect(html).not.toMatch(/text-(primary|red|green|blue|amber|yellow|orange|purple|pink)/)
    }
  })
})
