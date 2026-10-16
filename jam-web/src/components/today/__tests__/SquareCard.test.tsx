/**
 * 정사각 큰 카드(`square`) 모양 렌더 테스트 (티켓 20261001_2013, 상위 20260930_1453 조각 b4)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다.
 * 이미지 로드 실패와 칸 높이 같은 계산 스타일은 Story의 `play`(`SquareCard.stories.tsx`)가 본다. 실패는 「주소 없음」과 같은 자리 표시를 타므로
 * 여기서는 「주소 없음」 경로로 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SquareCard from '../SquareCard'
import { CARD_RESOURCES, type ImageCardView } from '@/lib/today/cardView'

const IMAGE = 'https://cdn.example/cover.png'
const SQUARE_BOX = 'relative aspect-square overflow-hidden bg-background'

function makeView(overrides: Partial<ImageCardView> = {}): ImageCardView {
  return {
    shape: 'square',
    resource: 'mission',
    title: '한강 러닝 챌린지',
    label: '미션',
    subtitle: '이번 주말 같이 달려요',
    facts: ['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'],
    description: '설명문은 정사각 카드에 없어요',
    href: '/missions/m1',
    imageUrl: IMAGE,
    publishedAt: '2026-10-05T03:00:00.000Z',
    ...overrides,
  }
}

const render = (overrides: Partial<ImageCardView> = {}) => renderToStaticMarkup(<SquareCard view={makeView(overrides)} />)

const BODY_OPEN = '<div class="flex flex-col gap-3 p-6">'
const bodyOf = (html: string) => html.slice(html.indexOf(BODY_OPEN) + BODY_OPEN.length)

describe('SquareCard — 면(표면)', () => {
  it('흰 카드(기본 톤, 흰 면 + 1px 테두리)이고 모서리를 자르는 overflow-hidden을 가지며 안쪽 여백은 인라인 0이다', () => {
    const html = render()
    expect(html).toMatch(/^<div class="overflow-hidden" style="[^"]*background:var\(--surface\)[^"]*border:1px solid var\(--border\)[^"]*">/)
    expect(html).not.toContain('--background-inverse')
    expect(html).toMatch(/^<div[^>]*style="[^"]*padding:0[;"]/)
    expect(html).not.toContain('--layout-card-padding')
    expect(html).not.toContain('p-0')
  })

  it('면에는 눌림(jam-press)·hover·active가 없다 — 눌림 대상은 CardFrame의 링크 하나다', () => {
    const html = render()
    for (const needle of ['jam-press', 'hover:', 'active:', 'transition']) expect(html).not.toContain(needle)
  })

  it('overflow-hidden은 카드와 이미지 칸에만 있다(본문에는 없다)', () => {
    const html = render()
    expect(html.match(/overflow-hidden/g)).toHaveLength(2)
    expect(bodyOf(html)).not.toContain('overflow-hidden')
  })

  it('본문은 안쪽 여백 24px이고 그룹 사이 간격은 12px이다', () => {
    expect(render()).toContain(BODY_OPEN)
  })
})

describe('SquareCard — 이미지 칸', () => {
  it.each([
    ['이미지가 있을 때', { imageUrl: IMAGE }],
    ['주소가 없을 때(null)', { imageUrl: null }],
    ['주소가 공백뿐일 때', { imageUrl: '   ' }],
  ])('%s도 1:1 단색 판 칸이 늘 있다(높이가 흔들리지 않는다)', (_label, overrides) => {
    const html = render(overrides)
    expect(html).toContain(`<div class="${SQUARE_BOX}">`)
    // 칸은 본문보다 앞에 있다
    expect(html.indexOf(SQUARE_BOX)).toBeLessThan(html.indexOf(BODY_OPEN))
  })

  it('이미지는 자르지 않는다 — object-contain이고 object-cover가 아니다(1:1이 아니면 판 위 레터박스)', () => {
    const html = render()
    expect(html).toContain('class="absolute inset-0 w-full h-full object-contain"')
    expect(html).not.toContain('object-cover')
    expect(html).not.toContain('grayscale')
  })

  it('imageDimmed면 이미지만 흑백이다(희귀도 칩·본문은 컬러, 자리 표시는 흑백 아님)', () => {
    const html = render({ imageDimmed: true, resource: 'badge', rarity: 'epic' })
    expect(html).toContain('class="absolute inset-0 w-full h-full object-contain grayscale"')
    expect(html.match(/grayscale/g)).toHaveLength(1)
    expect(bodyOf(html)).not.toContain('grayscale')
    expect(render({ imageDimmed: true, imageUrl: null })).not.toContain('grayscale')
  })

  it('이미지 위에는 아무것도 얹지 않는다(어두운 막·그림자·칩이 이미지 칸 안에 없다)', () => {
    const html = render({ resource: 'badge', rarity: 'epic' })
    const box = html.slice(html.indexOf(SQUARE_BOX), html.indexOf(BODY_OPEN))
    for (const needle of ['bg-black', 'gradient', 'shadow', 'padding:6px 10px', 'text-white']) expect(box).not.toContain(needle)
  })

  it('레터박스 판은 어두운 bg-background다(흰 판·이미지 모서리 둥글림 없음)', () => {
    const html = render()
    expect(html).toContain(SQUARE_BOX)
    const box = html.slice(html.indexOf(SQUARE_BOX), html.indexOf(BODY_OPEN))
    for (const needle of ['bg-white', 'bg-background-inverse', 'rounded']) expect(box).not.toContain(needle)
  })
})

describe('SquareCard — 이미지 alt와 titleInImage', () => {
  it('제목이 화면 글자로 보이는 일반 카드는 alt가 비어 있다(본문 h3가 말한다)', () => {
    expect(render()).toMatch(/<img[^>]*alt=""/)
  })

  it('이미지에 제목이 있는 카드(titleInImage)는 alt가 제목이다', () => {
    expect(render({ titleInImage: true })).toMatch(/<img[^>]*alt="한강 러닝 챌린지"/)
  })

  it('titleInImage: 화면 글자에 제목·요약이 없고 필수 정보가 칩 줄 바로 다음이다', () => {
    const html = render({ titleInImage: true })
    expect(html).not.toContain('<h3')
    expect(html).not.toContain('이번 주말 같이 달려요')
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

describe('SquareCard — 이미지 없음 자리 표시', () => {
  it('같은 1:1 칸 + 단색 판 + 자원 아이콘이다(칸 전체를 쓴다)', () => {
    const html = render({ imageUrl: null })
    expect(html).not.toContain('<img')
    expect(html).toContain(
      'class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 bg-background text-center"',
    )
    expect(html).not.toContain('gradient')
  })

  it.each(CARD_RESOURCES.map((resource) => [resource]))('%s는 아이콘을 장식(aria-hidden)으로 그린다', (resource) => {
    expect(render({ resource, imageUrl: null })).toContain('aria-hidden="true"')
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
})

describe('SquareCard — 본문 글자 배치', () => {
  it('칩 줄 → 제목 → 요약 → 필수 정보 순서다', () => {
    const html = render({ regionLabel: '성수동' })
    const positions = [
      html.indexOf('>미션</span>'),
      html.indexOf('성수동'),
      html.indexOf('<h3'),
      html.indexOf('이번 주말 같이 달려요'),
      html.indexOf('기간 10월 12일'),
      html.indexOf('보상 300 포인트'),
    ]
    for (const position of positions) expect(position).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('설명문·끝 줄·게재일은 값이 있어도 그리지 않는다(결정 15)', () => {
    const html = render({ href: '/missions/m1' })
    expect(html).not.toContain('설명문은 정사각 카드에 없어요')
    expect(html).not.toContain('자세히 보기')
    expect(html).not.toContain('기사 읽기')
    expect(html).not.toContain('→')
    expect(html).not.toContain('<time')
    expect(html).not.toContain('10월 5일')
  })

  it('칩 줄은 흰 면 위 색조다(기본 on) — 라벨 칩은 기본 색조(--background-secondary), 핀 글자는 text-muted', () => {
    const html = render({ regionLabel: '성수동' })
    expect(html).toMatch(/<span class="shrink-0" style="[^"]*background:var\(--background-secondary\);color:var\(--foreground\)[^"]*">미션<\/span>/)
    expect(html).toContain('min-w-0 text-xs text-muted">')
    expect(html).not.toContain('text-white')
  })

  it('칩 줄은 본문 첫 줄이다(이미지 칸 다음, 제목 앞)', () => {
    const html = render()
    expect(bodyOf(html).startsWith('<div class="flex items-center gap-2">')).toBe(true)
    expect(html.indexOf('padding:6px 10px')).toBeGreaterThan(html.indexOf(SQUARE_BOX))
    expect(html.indexOf('padding:6px 10px')).toBeLessThan(html.indexOf('<h3'))
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

  it('요약이 없으면 제목만 남고 빈 칸이 없다', () => {
    const html = render({ subtitle: undefined })
    expect(html).toContain('<h3')
    expect(html).not.toContain('mt-1')
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
      expect(className).not.toContain('body-sm')
    }
  })

  it.each([[0], [1], [2]])('필수 정보 %i줄이면 그 수만큼만 그린다', (count) => {
    const facts = ['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'].slice(0, count)
    const html = render({ facts: facts.length === 0 ? undefined : facts })
    expect(html.match(/font-bold/g)?.length ?? 0).toBe(count)
  })

  it('옅은 글자는 text-muted 한 단계뿐이다(불투명도 글자색 없음)', () => {
    const html = render({ resource: 'badge', regionLabel: '성수동', rarity: 'rare' })
    expect(html).toContain('text-muted')
    expect(html).not.toContain('text-snow')
    expect(html).not.toMatch(/text-(?:muted|foreground)\/\d/)
  })

  it('글자는 전부 왼쪽 정렬이다(본문에 가운데 정렬이 없다)', () => {
    expect(bodyOf(render())).not.toContain('text-center')
  })

  it('JAM! 배지는 희귀도 칩을 그리고 Common은 그리지 않는다', () => {
    expect(render({ resource: 'badge', rarity: 'epic' })).toContain('>Epic</span>')
    expect(render({ resource: 'badge', rarity: 'common' })).not.toContain('Common')
  })

  it('드랍은 지역 값이 있어도 칩 줄에 핀을 그리지 않는다', () => {
    const html = render({ resource: 'drop', label: '드랍', regionLabel: '한강공원', facts: ['지역 한강공원'] })
    expect(html).not.toContain('truncate')
    expect(html.match(/한강공원/g)).toHaveLength(1)
  })
})
