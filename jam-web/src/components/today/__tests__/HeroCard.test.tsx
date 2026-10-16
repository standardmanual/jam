/**
 * 큰 이미지(`hero`) 모양 렌더 테스트 (티켓 20261001_1737, 상위 20260930_1453 조각 b3)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다.
 * 이미지 로드 실패는 `onError`가 브라우저에서만 일어나 정적 렌더로 재현할 수 없다 — 실패와 주소 없음은 같은 자리 표시 컴포넌트를 타므로
 * 「주소 없음」 경로로 그 컴포넌트를 검증하고, 실패 자체와 높이·가로 넘침 같은 계산 스타일은 Story의 `play`(`HeroCard.stories.tsx`)가 본다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import HeroCard from '../HeroCard'
import { resourceIconOf } from '../resourceIcon'
import { CARD_RESOURCES, type ImageCardView } from '@/lib/today/cardView'

const IMAGE = 'https://cdn.example/cover.png'

function makeView(overrides: Partial<ImageCardView> = {}): ImageCardView {
  return {
    shape: 'hero',
    resource: 'mission',
    title: '한강 러닝 챌린지',
    label: '미션',
    subtitle: '이번 주말 같이 달려요',
    facts: ['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'],
    description: '한강공원 코스를 달리면 보상을 드려요',
    href: '/missions/m1',
    imageUrl: IMAGE,
    ...overrides,
  }
}

const render = (overrides: Partial<ImageCardView> = {}) => renderToStaticMarkup(<HeroCard view={makeView(overrides)} />)

const iconMarkup = (view: Pick<ImageCardView, 'resource' | 'template'>, className: string) =>
  renderToStaticMarkup(resourceIconOf(view, { className }))

const IMAGE_BOX = 'relative aspect-video overflow-hidden bg-background'

describe('HeroCard — 면(표면)', () => {
  it('흰 카드(기본 톤, 흰 면 + 1px 테두리)이고 모서리를 자르는 overflow-hidden을 가지며 안쪽 여백은 인라인 0이다', () => {
    const html = render()
    expect(html).toMatch(/^<div class="overflow-hidden" style="[^"]*background:var\(--surface\)[^"]*border:1px solid var\(--border\)[^"]*">/)
    expect(html).not.toContain('--background-inverse')
    // Card가 주는 24px 기본 여백은 클래스(p-0)로는 덮이지 않아 같은 인라인 style로 덮는다
    expect(html).toMatch(/^<div[^>]*style="[^"]*padding:0[;"]/)
    expect(html).not.toContain('--layout-card-padding')
    expect(html).not.toContain('p-0')
  })

  it('면에는 눌림(jam-press)·hover가 없다 — 눌림 대상은 CardFrame의 링크 하나다', () => {
    const html = render()
    expect(html).not.toContain('jam-press')
    expect(html).not.toContain('hover:')
    expect(html).not.toContain('active:')
  })

  it('overflow-hidden은 카드(Card)에만 걸려 있다 — 이미지 칸 하나가 더 있을 뿐 본문에는 없다', () => {
    const html = render()
    expect(html.match(/overflow-hidden/g)).toHaveLength(2)
    expect(html.slice(html.indexOf('flex flex-col gap-3'))).not.toContain('overflow-hidden')
  })

  it('본문은 안쪽 여백 24px이고 그룹 사이 간격은 12px이다', () => {
    expect(render()).toContain('<div class="flex flex-col gap-3 p-6">')
  })
})

describe('HeroCard — 이미지 칸', () => {
  it.each([
    ['이미지가 있을 때', { imageUrl: IMAGE }],
    ['주소가 없을 때(null)', { imageUrl: null }],
    ['주소가 공백뿐일 때', { imageUrl: '   ' }],
  ])('%s도 16:9 단색 판 칸이 늘 있다(높이가 흔들리지 않는다)', (_label, overrides) => {
    const html = render(overrides)
    expect(html).toContain(`<div class="${IMAGE_BOX}">`)
    // 칸은 본문보다 앞에 있다
    expect(html.indexOf(IMAGE_BOX)).toBeLessThan(html.indexOf('gap-3'))
  })

  it('칸 안의 이미지는 칸을 채우고 object-cover이며 컬러다', () => {
    const html = render()
    expect(html).toContain(`src="${IMAGE}"`)
    expect(html).toContain('class="absolute inset-0 w-full h-full object-cover"')
    expect(html).not.toContain('grayscale')
  })

  it('imageDimmed면 이미지만 흑백이다(자리 표시 판·아이콘은 흑백 처리하지 않는다)', () => {
    expect(render({ imageDimmed: true })).toContain('class="absolute inset-0 w-full h-full object-cover grayscale"')
    expect(render({ imageDimmed: true }).match(/grayscale/g)).toHaveLength(1)
    expect(render({ imageDimmed: true, imageUrl: null })).not.toContain('grayscale')
  })

  it('이미지 위에는 아무것도 얹지 않는다(어두운 막·그림자·칩이 이미지 칸 안에 없다)', () => {
    const html = render({ label: '미션', rarity: 'epic' })
    const box = html.slice(html.indexOf(IMAGE_BOX), html.indexOf('flex flex-col gap-3'))
    expect(box).not.toContain('bg-black')
    expect(box).not.toContain('gradient')
    expect(box).not.toContain('shadow')
    expect(box).not.toContain('padding:6px 10px')
  })
})

describe('HeroCard — 이미지 alt', () => {
  it('제목이 화면 글자로 보이는 일반 카드는 alt가 비어 있다(본문 h3가 말한다)', () => {
    expect(render()).toMatch(/<img[^>]*alt=""/)
  })

  it('이미지에 제목이 있는 카드(titleInImage)는 alt가 제목이다', () => {
    expect(render({ titleInImage: true })).toMatch(/<img[^>]*alt="한강 러닝 챌린지"/)
  })
})

describe('HeroCard — 이미지 없음 자리 표시', () => {
  it('같은 16:9 칸 + 단색 판 + 자원 아이콘이다(그라디언트·문구 없음)', () => {
    const html = render({ imageUrl: null })
    expect(html).not.toContain('<img')
    expect(html).toContain(
      'class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 bg-background text-center"',
    )
    expect(html).not.toContain('gradient')
    expect(html).not.toContain('이미지 없음')
  })

  it.each(CARD_RESOURCES.map((resource) => [resource]))('%s는 그 자원의 아이콘을 장식(aria-hidden)으로 그린다', (resource) => {
    const html = render({ resource, imageUrl: null })
    expect(html).toContain(iconMarkup({ resource }, 'w-8 h-8 text-muted'))
    expect(iconMarkup({ resource }, 'w-8 h-8 text-muted')).toContain('aria-hidden="true"')
  })

  it('자동 카드는 BriefCard와 같은 규칙으로 템플릿이 지역 트렌드면 핀, 진행 알림이면 모래시계다(지역 값과 무관)', () => {
    const pin = iconMarkup({ resource: 'auto', template: 'location_trend' }, 'w-8 h-8 text-muted')
    const hourglass = iconMarkup({ resource: 'auto', template: 'progress_nudge' }, 'w-8 h-8 text-muted')
    expect(pin).not.toBe(hourglass)

    const trend = render({ resource: 'auto', template: 'location_trend', regionLabel: '성수동', imageUrl: null })
    expect(trend).toContain(pin)
    expect(trend).not.toContain(hourglass)
    // 진행 알림은 지역 값이 있어도 모래시계다
    const nudge = render({ resource: 'auto', template: 'progress_nudge', regionLabel: '성수동', imageUrl: null })
    expect(nudge).toContain(hourglass)
    expect(nudge).not.toContain(pin)
  })

  it('일반 카드는 판 위에 아이콘만 둔다 — 같은 제목이 한 카드에 두 번 보이지 않는다', () => {
    const html = render({ imageUrl: null })
    expect(html.match(/한강 러닝 챌린지/g)).toHaveLength(1)
    expect(html).toMatch(/<h3[^>]*>한강 러닝 챌린지<\/h3>/)
    expect(html).not.toContain('line-clamp-3')
  })

  it('titleInImage 카드는 판 위에 제목을 그린다(16px bold·3줄 말줄임) — 본문에는 제목·요약이 없다', () => {
    const html = render({ imageUrl: null, titleInImage: true })
    expect(html).toContain(
      '<p class="text-base font-bold text-foreground line-clamp-3 break-keep break-words">한강 러닝 챌린지</p>',
    )
    expect(html.match(/한강 러닝 챌린지/g)).toHaveLength(1)
    expect(html).not.toContain('<h3')
    expect(html).not.toContain('이번 주말 같이 달려요')
  })

  it('판은 제목을 읽을 수 있도록 어두운 글자 색(text-foreground)을 쓰고 옅은 글자는 text-muted다', () => {
    const html = render({ imageUrl: null, titleInImage: true })
    expect(html).toContain('text-muted')
    for (const level of ['/30', '/40', '/50', '/60']) expect(html).not.toContain(`text-foreground${level}`)
  })
})

describe('HeroCard — titleInImage', () => {
  it('화면 글자에 제목·요약이 없고 필수 정보가 칩 줄 바로 다음이다', () => {
    const html = render({ titleInImage: true })
    expect(html).not.toContain('<h3')
    expect(html).not.toContain('이번 주말 같이 달려요')
    // 제목은 이미지 alt에만 있다
    expect(html.match(/한강 러닝 챌린지/g)).toHaveLength(1)
    const chipRow = html.indexOf('>미션</span>')
    const fact = html.indexOf('기간 10월 12일')
    expect(chipRow).toBeGreaterThan(-1)
    expect(chipRow).toBeLessThan(fact)
    // 칩 줄과 필수 정보 사이에 제목 그룹의 빈 칸이 없다
    expect(html.slice(chipRow, fact)).not.toContain('mt-1')
  })

  it('숨김 제목(sr-only h3)을 따로 두지 않는다(alt와 중복 읽힘)', () => {
    expect(render({ titleInImage: true })).not.toContain('sr-only')
  })
})

describe('HeroCard — 본문 글자 배치', () => {
  it('칩 줄 → 제목 → 요약 → 필수 정보 → 설명문 → 끝 줄 순서다', () => {
    const html = render({ regionLabel: '성수동' })
    const positions = [
      html.indexOf('>미션</span>'),
      html.indexOf('성수동'),
      html.indexOf('<h3'),
      html.indexOf('이번 주말 같이 달려요'),
      html.indexOf('기간 10월 12일'),
      html.indexOf('보상 300 포인트'),
      html.indexOf('한강공원 코스를'),
      html.indexOf('자세히 보기'),
    ]
    for (const position of positions) expect(position).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('제목은 h3, 24px(--text-2xl)·2줄 말줄임·어절 단위 줄바꿈이고 굵게 하지 않는다', () => {
    const html = render()
    expect(html).toContain(
      '<h3 class="text-2xl text-foreground line-clamp-2 break-keep break-words">한강 러닝 챌린지</h3>',
    )
    expect(html).not.toMatch(/<h3[^>]*font-(bold|semibold|medium)/)
  })

  it('요약은 제목 아래 4px, 16px·text-muted·2줄 말줄임이다', () => {
    expect(render()).toContain(
      '<p class="mt-1 text-base text-muted line-clamp-2 break-keep break-words">이번 주말 같이 달려요</p>',
    )
  })

  it('필수 정보는 14px(--text-sm) 굵게 검정 100%이고 한 줄에 하나씩, 말줄임 없이 줄바꿈한다', () => {
    const html = render()
    const lines = [...html.matchAll(/<p class="([^"]*font-bold[^"]*)">([^<]*)<\/p>/g)]
    expect(lines.map((m) => m[2])).toEqual(['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'])
    for (const [, className] of lines) {
      expect(className).toBe(
        'text-sm font-bold text-foreground break-keep break-words',
      )
      expect(className).not.toContain('text-muted')
      expect(className).not.toContain('line-clamp')
      expect(className).not.toContain('truncate')
      // 서비스에서 --text-base은 16px이라 14px 자리에 쓰면 크기가 틀린다
      expect(className).not.toContain('body-sm')
    }
  })

  it.each([[0], [1], [2]])('필수 정보 %i줄이면 그 수만큼만 그린다', (count) => {
    const facts = ['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'].slice(0, count)
    const html = render({ facts: facts.length === 0 ? undefined : facts })
    expect(html.match(/font-bold/g)?.length ?? 0).toBe(count)
  })

  it('필수 정보 앞에 아이콘·불릿을 붙이지 않는다', () => {
    const html = render()
    const factsBlock = html.slice(html.indexOf('기간 10월 12일') - 200, html.indexOf('보상 300 포인트') + 40)
    expect(factsBlock).not.toContain('<svg')
  })

  it('설명문은 14px·text-muted·보통 굵기·2줄 말줄임이다(필수 정보를 이기지 않는다)', () => {
    const html = render()
    expect(html).toContain(
      '<p class="text-sm text-muted line-clamp-2 break-keep break-words">한강공원 코스를 달리면 보상을 드려요</p>',
    )
  })

  it('값이 없는 그룹은 사라진다(요약·필수 정보·설명문 없음)', () => {
    const html = render({ subtitle: undefined, facts: undefined, description: undefined })
    expect(html).toContain('<h3')
    expect(html).not.toContain('mt-1')
    expect(html).not.toContain('font-bold')
    expect(html).not.toContain('line-clamp-2 break-keep break-words">한강공원')
    expect(html.match(/<p /g)).toHaveLength(1) // 끝 줄 하나
  })
})

describe('HeroCard — 끝 줄', () => {
  it('href가 있으면 「자세히 보기 →」(12px·text-muted)이고 화살표는 aria-hidden이다', () => {
    expect(render()).toContain(
      '<p class="text-xs text-muted">자세히 보기 <span aria-hidden="true">→</span></p>',
    )
  })

  it('기사는 「기사 읽기 →」다', () => {
    const html = render({ resource: 'article', label: '기사', facts: undefined, href: '/today/a1' })
    expect(html).toContain('>기사 읽기 <span aria-hidden="true">→</span>')
    expect(html).not.toContain('자세히 보기')
  })

  it('href가 없으면 이동한다는 암시를 주지 않으려고 그리지 않는다', () => {
    const html = render({ href: undefined })
    expect(html).not.toContain('자세히 보기')
    expect(html).not.toContain('→')
  })
})

describe('HeroCard — 칩 줄', () => {
  it('칩 줄은 본문 첫 줄이다(이미지 칸 다음, 제목 앞)', () => {
    const html = render()
    expect(html.indexOf('padding:6px 10px')).toBeGreaterThan(html.indexOf(IMAGE_BOX))
    expect(html.indexOf('padding:6px 10px')).toBeLessThan(html.indexOf('<h3'))
  })

  it('기사는 줄 끝에 게재일을 그린다', () => {
    const html = render({ resource: 'article', label: '기사', publishedAt: '2026-10-05T03:00:00.000Z', href: '/today/a1' })
    expect(html).toContain('>10월 5일</time>')
  })

  it('드랍은 지역 값이 있어도 칩 줄에 핀을 그리지 않는다', () => {
    const html = render({ resource: 'drop', label: '드랍', regionLabel: '한강공원', facts: ['지역 한강공원'], description: undefined })
    expect(html).not.toContain('truncate')
    expect(html.match(/한강공원/g)).toHaveLength(1)
  })

  it('JAM! 배지는 희귀도 칩을 그리고 Common은 그리지 않는다', () => {
    expect(render({ resource: 'badge', rarity: 'epic' })).toContain('>Epic</span>')
    expect(render({ resource: 'badge', rarity: 'common' })).not.toContain('Common')
  })
})

describe('HeroCard — 옅은 글자', () => {
  it('옅은 글자는 text-muted 한 단계뿐이다(불투명도 글자색 없음)', () => {
    const html = render({ resource: 'badge', regionLabel: '성수동', rarity: 'rare', publishedAt: '2026-10-05T03:00:00.000Z' })
    expect(html).toContain('text-muted')
    expect(html).not.toContain('text-snow')
    expect(html).not.toMatch(/text-(?:muted|foreground)\/\d/)
    expect(html).not.toContain('/40')
    expect(html).not.toContain('/30')
  })

  it('이미지 없음 판에도 /30·/40이 없다', () => {
    for (const resource of CARD_RESOURCES) {
      const html = render({ resource, imageUrl: null })
      expect(html).not.toContain('/30')
      expect(html).not.toContain('/40')
    }
  })
})
