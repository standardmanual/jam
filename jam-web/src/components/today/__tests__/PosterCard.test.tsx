/**
 * 포스터(`poster`) 모양 렌더 테스트 (티켓 20261001_2013, 상위 20260930_1453 조각 b4)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다.
 * 막의 진하기는 계산 스타일이라 정적 렌더로 픽셀을 볼 수 없다 — 그래서 (1) 막 클래스가 고정 길이 정지점인지 (2) 막이 쓰는 토큰 `--color-overlay`의 알파가
 * 0.6 이상인지(토큰 파일을 읽는다) (3) 그 알파 아래 순백 이미지에서 흰 글자 대비가 AA인지를 여기서 보증하고, 실측(칩 줄 윗변 − 막 윗변 ≥ 32px)은
 * Story의 `play`(`PosterCard.stories.tsx`)가 본다. 이미지 로드 실패는 `CardImageSlot.test.tsx`와 같은 사정으로 「주소 없음」 경로로 검증한다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import PosterCard from '../PosterCard'
import { CARD_RESOURCES, type ImageCardView } from '@/lib/today/cardView'

const IMAGE = 'https://cdn.example/cover.png'

function makeView(overrides: Partial<ImageCardView> = {}): ImageCardView {
  return {
    shape: 'poster',
    resource: 'collection',
    title: '새 아이템이 열렸어요',
    label: '컬렉션',
    subtitle: '요약은 포스터에 없어요',
    facts: ['한강 컬렉션', '아이템 12개'],
    description: '설명문은 포스터에 없어요',
    href: '/collections/c1',
    imageUrl: IMAGE,
    publishedAt: '2026-10-05T03:00:00.000Z',
    ...overrides,
  }
}

const render = (overrides: Partial<ImageCardView> = {}) => renderToStaticMarkup(<PosterCard view={makeView(overrides)} />)

const tokenFile = (name: string) => readFileSync(fileURLToPath(new URL(`../../../../design-system/tokens/${name}`, import.meta.url)), 'utf-8')

/** 막 div의 열린 태그에서 class 값을 꺼낸다(`absolute inset-x-0 bottom-0`로 알아본다). */
function scrimClassOf(html: string): string {
  const match = html.match(/<div class="(absolute inset-x-0 bottom-0 [^"]*)">/)
  expect(match).not.toBeNull()
  return match![1]
}

/** 막 안쪽 마크업(막 열린 태그 뒤 ~ 카드 닫는 태그 앞). */
function scrimInnerOf(html: string): string {
  const open = html.match(/<div class="absolute inset-x-0 bottom-0 [^"]*">/)!
  return html.slice(html.indexOf(open[0]) + open[0].length)
}

const CHIP_ROW_OPEN = '<div class="flex items-center gap-[var(--spacing-8)]">'

describe('PosterCard — 면(표면)', () => {
  it('카드(default 색조)는 relative·overflow-hidden이고 안쪽 여백은 인라인 0이다(이미지가 카드 모서리까지 닿는다)', () => {
    const html = render()
    expect(html).toMatch(/^<div class="relative overflow-hidden" style="[^"]*background:var\(--color-surface-elevated\)[^"]*">/)
    expect(html).toMatch(/^<div[^>]*style="[^"]*padding:0[;"]/)
    expect(html).not.toContain('--layout-card-padding')
    expect(html).not.toContain('p-0')
  })

  it('면에는 눌림(jam-press)·hover·active·transition이 없다 — 눌림 대상은 CardFrame의 링크 하나다', () => {
    const html = render()
    for (const needle of ['jam-press', 'hover:', 'active:', 'transition']) expect(html).not.toContain(needle)
  })

  it('이미지 칸이 카드의 첫 자식이고 4:5가 카드 높이를 정한다(막은 absolute라 글자 수가 높이를 바꾸지 않는다)', () => {
    const html = render()
    expect(html).toContain('<div class="relative aspect-[4/5] overflow-hidden bg-surface">')
    expect(html.indexOf('aspect-[4/5]')).toBeLessThan(html.indexOf('absolute inset-x-0 bottom-0'))
    expect(scrimClassOf(html)).toContain('absolute')
  })

  it('overflow-hidden은 카드와 이미지 칸에만 있다(막·글자 쪽에는 없다)', () => {
    const html = render()
    expect(html.match(/overflow-hidden/g)).toHaveLength(2)
    expect(scrimClassOf(html)).not.toContain('overflow-hidden')
  })
})

describe('PosterCard — 막', () => {
  it('막은 var(--color-overlay)에서 시작하는 단일 선형 그라디언트이고 정지점은 고정 길이 var(--spacing-32)다', () => {
    const scrim = scrimClassOf(render())
    expect(scrim).toContain('bg-[linear-gradient(to_bottom,transparent,var(--color-overlay)_var(--spacing-32))]')
    expect(scrim.match(/linear-gradient/g)).toHaveLength(1)
  })

  it('퍼센트 정지점·옛 BannerCard의 from-black·via-black을 쓰지 않는다(글자 수에 따라 첫 줄 진하기가 변하는 문제)', () => {
    const scrim = scrimClassOf(render())
    const gradient = scrim.match(/bg-\[linear-gradient\(([^\]]*)\)\]/)![1]
    expect(gradient).not.toContain('%')
    for (const needle of ['from-black', 'via-black', 'to-transparent', 'black/', 'rgba', '#']) expect(scrim).not.toContain(needle)
  })

  it('막의 위 여백(pt-32)이 램프 길이와 같다 — 칩 줄 윗변은 램프가 끝난 뒤에서 시작한다', () => {
    const scrim = scrimClassOf(render())
    expect(scrim).toContain('pt-[var(--spacing-32)]')
    expect(scrim).toContain('var(--spacing-32))]')
    // 그라디언트 정지점과 위 여백이 같은 토큰이고 값은 32px이다
    expect(tokenFile('spacing.css')).toMatch(/--spacing-32:\s*32px/)
  })

  it('막 좌우·아래 여백은 24px, 그룹 사이 간격은 12px이다(hero 본문과 같다)', () => {
    const scrim = scrimClassOf(render())
    for (const cls of ['px-[var(--spacing-24)]', 'pb-[var(--spacing-24)]', 'gap-[var(--spacing-12)]', 'flex flex-col']) {
      expect(scrim).toContain(cls)
    }
  })

  it('막은 글자 블록 높이만큼이다 — 카드 전체를 덮는 inset-0·h-full·top-0이 없다', () => {
    const scrim = scrimClassOf(render())
    for (const needle of ['inset-0', 'h-full', 'top-0', 'inset-y-0', 'min-h']) expect(scrim).not.toContain(needle)
  })

  it('색 섞기·blur(유리질)·그림자·테두리 광택을 더하지 않는다', () => {
    const scrim = scrimClassOf(render())
    for (const needle of ['backdrop', 'blur', 'shadow', 'border', 'ring', 'via-', 'from-']) expect(scrim).not.toContain(needle)
  })
})

describe('PosterCard — 막 토큰 안전장치 (--color-overlay)', () => {
  const alphaOf = (): number => {
    const match = tokenFile('colors.css').match(/--color-overlay:\s*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([0-9.]+)\s*\)/)
    expect(match).not.toBeNull()
    return Number(match![1])
  }

  /** WCAG 상대 휘도 (0~255 채널 동일 값의 회색) */
  const luminance = (channel: number): number => {
    const c = channel / 255
    const linear = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    return linear
  }

  it('--color-overlay의 알파는 0.6 이상이다(확정 설계 1절 「글자 블록 첫 줄에서도 진하기 60% 이상」의 하한)', () => {
    // 이 토큰은 원래 모달·시트 백드롭용이라 값이 따로 바뀔 수 있다. 0.6 아래로 내려가면 막 설계가 깨지므로 여기서 잡는다
    expect(alphaOf()).toBeGreaterThanOrEqual(0.6)
  })

  it('그 알파 아래 순백 이미지에서도 흰 글자 대비가 AA(4.5:1) 이상이다', () => {
    const composite = 255 * (1 - alphaOf()) // 순백(255) 이미지 위에 검정 알파를 얹은 합성색
    const contrast = (luminance(255) + 0.05) / (luminance(composite) + 0.05)
    expect(contrast).toBeGreaterThanOrEqual(4.5)
  })

  it('막 위 글자에 옅은 단계를 두지 않는 근거: 같은 조건에서 흰 글자 /80은 4.5 미만이다', () => {
    const composite = 255 * (1 - alphaOf())
    // 흰 글자 알파 0.8을 막 합성색(회색) 위에 얹은 색
    const text = 255 * 0.8 + composite * 0.2
    const contrast = (luminance(text) + 0.05) / (luminance(composite) + 0.05)
    expect(contrast).toBeLessThan(4.5)
  })
})

describe('PosterCard — 막 위 글자 배치', () => {
  it('칩 줄이 막의 첫 자식이다(이미지 위·막 밖에 칩이 없다)', () => {
    const html = render()
    expect(scrimInnerOf(html).startsWith(CHIP_ROW_OPEN)).toBe(true)
    // 칩 줄은 막 안에 한 번뿐이고 이미지 칸(막보다 앞)에는 칩이 없다
    expect(html.match(/padding:6px 10px/g)).toHaveLength(1)
    expect(html.slice(0, html.indexOf('absolute inset-x-0 bottom-0'))).not.toContain('padding:6px 10px')
  })

  it('칩 줄 → 제목 → 필수 정보 순서다', () => {
    const html = render({ regionLabel: '성수동', rarity: 'epic', resource: 'badge', label: '배지 소개' })
    const positions = [
      html.indexOf('>배지 소개</span>'),
      html.indexOf('성수동'),
      html.indexOf('>Epic</span>'),
      html.indexOf('<h3'),
      html.indexOf('한강 컬렉션'),
      html.indexOf('아이템 12개'),
    ]
    for (const position of positions) expect(position).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('칩 줄은 막 위 색조다 — 라벨 칩은 흰 알약(surface-inverse), 지역 핀 글자는 text-white', () => {
    const html = render({ regionLabel: '성수동' })
    expect(html).toMatch(/<span class="shrink-0" style="[^"]*background:var\(--color-surface-inverse\);color:var\(--color-text-inverse\)[^"]*">컬렉션<\/span>/)
    expect(html).toContain('min-w-0 text-[length:var(--text-caption)] text-white">')
  })

  it('제목은 h3, 24px(--text-subheading)·흰색·2줄 말줄임·어절 단위 줄바꿈이고 굵게 하지 않는다', () => {
    const html = render()
    expect(html).toContain(
      '<h3 class="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] text-white line-clamp-2 break-keep break-words">새 아이템이 열렸어요</h3>',
    )
    expect(html).not.toMatch(/<h3[^>]*font-(bold|semibold|medium)/)
  })

  it('필수 정보는 14px(--text-small) 흰색·보통 굵기이고 한 줄에 하나씩, 말줄임 없이 줄바꿈한다', () => {
    const html = render()
    const lines = [...scrimInnerOf(html).matchAll(/<p class="([^"]*)">([^<]*)<\/p>/g)]
    expect(lines.map((m) => m[2])).toEqual(['한강 컬렉션', '아이템 12개'])
    for (const [, className] of lines) {
      expect(className).toBe('text-[length:var(--text-small)] leading-[var(--leading-small)] text-white break-keep break-words')
      expect(className).not.toContain('font-bold')
      expect(className).not.toContain('line-clamp')
      expect(className).not.toContain('truncate')
      // 서비스에서 --text-body-sm은 16px이라 14px 자리에 쓰면 크기가 틀린다
      expect(className).not.toContain('body-sm')
    }
  })

  it.each([[0], [1], [2]])('필수 정보 %i줄이면 그 수만큼만 그린다', (count) => {
    const facts = ['한강 컬렉션', '아이템 12개'].slice(0, count)
    const html = render({ facts: facts.length === 0 ? undefined : facts })
    expect(scrimInnerOf(html).match(/<p /g)?.length ?? 0).toBe(count)
  })

  it('필수 정보 앞에 아이콘·불릿을 붙이지 않는다', () => {
    const html = render()
    const factsBlock = html.slice(html.indexOf('한강 컬렉션') - 200, html.indexOf('아이템 12개') + 40)
    expect(factsBlock).not.toContain('<svg')
  })

  it('요약·설명문·끝 줄·게재일은 값이 있어도 그리지 않는다', () => {
    const html = render({ href: '/collections/c1' })
    expect(html).not.toContain('요약은 포스터에 없어요')
    expect(html).not.toContain('설명문은 포스터에 없어요')
    expect(html).not.toContain('자세히 보기')
    expect(html).not.toContain('기사 읽기')
    expect(html).not.toContain('→')
    expect(html).not.toContain('<time')
    expect(html).not.toContain('10월 5일')
  })

  it('막 위 글자는 전부 text-white다 — 옅은 단계(/80·/60·/40)와 text-text 계열이 없다', () => {
    const inner = scrimInnerOf(render({ regionLabel: '성수동', resource: 'badge', rarity: 'epic' }))
    expect(inner).toContain('text-white')
    for (const needle of ['text-white/', 'text-text', '/80', '/60', '/40', '/30']) expect(inner).not.toContain(needle)
  })

  it('글자는 전부 왼쪽 정렬이다(막에 가운데 정렬이 없다) — 가운데 정렬은 자리 표시 판에만 있다', () => {
    const html = render()
    expect(scrimClassOf(html)).not.toContain('text-center')
    expect(scrimInnerOf(html)).not.toContain('text-center')
    expect(scrimInnerOf(html)).not.toContain('items-center justify-center')
  })

  it('값이 없는 그룹은 그 그룹만 사라진다(필수 정보 없음·라벨 없음)', () => {
    const html = render({ facts: undefined })
    expect(html).toContain('<h3')
    expect(scrimInnerOf(html)).not.toContain('<p ')
  })

  it('JAM! 배지는 희귀도 칩을 그리고 Common은 그리지 않는다', () => {
    expect(render({ resource: 'badge', rarity: 'epic' })).toContain('>Epic</span>')
    expect(render({ resource: 'badge', rarity: 'common' })).not.toContain('Common')
  })

  it('드랍은 지역 값이 있어도 칩 줄에 핀을 그리지 않는다(필수 정보 「지역」 줄이 같은 값을 낸다)', () => {
    const html = render({ resource: 'drop', label: '드랍', regionLabel: '한강공원', facts: ['지역 한강공원'] })
    expect(html).not.toContain('truncate')
    expect(html.match(/한강공원/g)).toHaveLength(1)
  })
})

describe('PosterCard — 이미지 칸', () => {
  it.each([
    ['이미지가 있을 때', { imageUrl: IMAGE }],
    ['주소가 없을 때(null)', { imageUrl: null }],
    ['주소가 공백뿐일 때', { imageUrl: '   ' }],
  ])('%s도 4:5 칸과 막이 늘 있다(카드 높이가 흔들리지 않는다)', (_label, overrides) => {
    const html = render(overrides)
    expect(html).toContain('<div class="relative aspect-[4/5] overflow-hidden bg-surface">')
    expect(html).toContain('absolute inset-x-0 bottom-0')
    expect(html).toContain('<h3')
    expect(html.indexOf('aspect-[4/5]')).toBeLessThan(html.indexOf('absolute inset-x-0 bottom-0'))
  })

  it('이미지는 칸을 채우고 object-cover이며 컬러다', () => {
    const html = render()
    expect(html).toContain('class="absolute inset-0 w-full h-full object-cover"')
    expect(html).not.toContain('grayscale')
  })

  it('imageDimmed면 이미지만 흑백이다(막·글자·희귀도 칩·자리 표시는 컬러)', () => {
    const html = render({ imageDimmed: true, resource: 'badge', rarity: 'epic' })
    expect(html).toContain('class="absolute inset-0 w-full h-full object-cover grayscale"')
    expect(html.match(/grayscale/g)).toHaveLength(1)
    expect(scrimInnerOf(html)).not.toContain('grayscale')
    expect(render({ imageDimmed: true, imageUrl: null })).not.toContain('grayscale')
  })
})

describe('PosterCard — 이미지 alt와 titleInImage', () => {
  it('제목이 화면 글자로 보이는 일반 카드는 alt가 비어 있다(막의 h3가 말한다)', () => {
    expect(render()).toMatch(/<img[^>]*alt=""/)
  })

  it('이미지에 제목이 있는 카드(titleInImage)는 alt가 제목이다', () => {
    expect(render({ titleInImage: true })).toMatch(/<img[^>]*alt="새 아이템이 열렸어요"/)
  })

  it('titleInImage: 화면 글자에 제목이 없고(h3 없음) 필수 정보가 칩 줄 바로 다음이다', () => {
    const html = render({ titleInImage: true })
    expect(html).not.toContain('<h3')
    // 제목은 이미지 alt에만 있다
    expect(html.match(/새 아이템이 열렸어요/g)).toHaveLength(1)
    const inner = scrimInnerOf(html)
    expect(inner.startsWith(CHIP_ROW_OPEN)).toBe(true)
    expect(inner.indexOf('한강 컬렉션')).toBeGreaterThan(inner.indexOf('컬렉션</span>'))
    expect(inner).not.toContain('<h3')
  })

  it('숨김 제목(sr-only h3)을 따로 두지 않는다(alt와 중복 읽힘)', () => {
    expect(render({ titleInImage: true })).not.toContain('sr-only')
  })

  it('titleInImage + 필수 정보 없음이면 막에는 칩 줄뿐이다', () => {
    const html = render({ titleInImage: true, facts: undefined })
    expect(scrimInnerOf(html).match(/<p /g)).toBeNull()
    expect(html).not.toContain('<h3')
  })
})

describe('PosterCard — 이미지 없음 자리 표시', () => {
  it('카드 위쪽 60%에만 판 위 아이콘을 둔다(막과 겹치지 않는다)', () => {
    const html = render({ imageUrl: null })
    expect(html).not.toContain('<img')
    expect(html).toContain('absolute inset-x-0 top-0 h-[60%] flex flex-col items-center justify-center')
    // 자리 표시는 막보다 앞(이미지 칸 안)에 있다
    expect(html.indexOf('h-[60%]')).toBeLessThan(html.indexOf('absolute inset-x-0 bottom-0'))
  })

  it.each(CARD_RESOURCES.map((resource) => [resource]))('%s는 아이콘을 장식(aria-hidden)으로 그린다', (resource) => {
    expect(render({ resource, imageUrl: null })).toContain('aria-hidden="true"')
  })

  it('일반 카드는 판 위에 아이콘만 둔다 — 같은 제목이 한 카드에 두 번 보이지 않는다', () => {
    const html = render({ imageUrl: null })
    expect(html.match(/새 아이템이 열렸어요/g)).toHaveLength(1)
    expect(html).toMatch(/<h3[^>]*>새 아이템이 열렸어요<\/h3>/)
    expect(html).not.toContain('line-clamp-3')
  })

  it('titleInImage 카드는 판 위(위쪽 60%)에 제목을 그린다 — 막에는 제목이 없다', () => {
    const html = render({ imageUrl: null, titleInImage: true })
    expect(html).toContain(
      '<p class="text-[length:var(--text-body)] font-bold text-text line-clamp-3 break-keep break-words">새 아이템이 열렸어요</p>',
    )
    expect(html.match(/새 아이템이 열렸어요/g)).toHaveLength(1)
    expect(html).not.toContain('<h3')
    expect(html.indexOf('line-clamp-3')).toBeLessThan(html.indexOf('absolute inset-x-0 bottom-0'))
  })
})
