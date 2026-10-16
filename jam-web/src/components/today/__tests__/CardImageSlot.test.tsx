/**
 * 이미지 칸(`CardImageSlot`) 렌더 테스트 (티켓 20261001_2013, 상위 20260930_1453 조각 b4)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·태그 문자열을 단언한다.
 * 이미지 로드 실패는 `onError`가 브라우저에서만 일어나 정적 렌더로 재현할 수 없다 — 실패와 주소 없음은 같은 자리 표시 컴포넌트를 타므로
 * 「주소 없음」 경로로 그 컴포넌트를 검증하고, 실패 자체와 칸 높이 같은 계산 스타일은 Story의 `play`가 본다.
 * `video`(hero)의 출력은 칸을 공용으로 빼기 전 `HeroCard`가 직접 그리던 문자열과 글자 단위로 같아야 한다 — 아래 상수가 그 옛 문자열이다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CardImageSlot, { type CardImageRatio } from '../CardImageSlot'
import { resourceIconOf } from '../resourceIcon'
import { CARD_RESOURCES, type ImageCardView } from '@/lib/today/cardView'

const IMAGE = 'https://cdn.example/cover.png'
const INTERNAL_IMAGE = '/badges/sample/s142.png'

// 칸을 공용으로 빼기 전 HeroCard의 문자열(티켓 20261001_1737)
const OLD_HERO_BOX = 'relative aspect-video overflow-hidden bg-background'
const OLD_HERO_PLACEHOLDER =
  'absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 bg-background text-center'
const OLD_HERO_TITLE =
  '<p class="text-base font-bold text-foreground line-clamp-3 break-keep break-words">한강 러닝 챌린지</p>'

function makeView(overrides: Partial<ImageCardView> = {}): ImageCardView {
  return { shape: 'hero', resource: 'mission', title: '한강 러닝 챌린지', imageUrl: IMAGE, ...overrides }
}

const render = (ratio: CardImageRatio, overrides: Partial<ImageCardView> = {}) =>
  renderToStaticMarkup(<CardImageSlot view={makeView(overrides)} ratio={ratio} />)

const iconMarkup = (view: Pick<ImageCardView, 'resource' | 'template'>) =>
  renderToStaticMarkup(resourceIconOf(view, { className: 'w-8 h-8 text-muted' }))

describe('CardImageSlot — video(hero)는 옛 HeroCard 출력과 같다', () => {
  it('이미지가 있을 때: 16:9 칸 안에 이미지 하나뿐이다', () => {
    const html = render('video')
    expect(html).toMatch(new RegExp(`^<div class="${OLD_HERO_BOX.replace(/[[\]/]/g, '\\$&')}"><img [^>]*src="${IMAGE}"[^>]*/></div>$`))
  })

  it('이미지가 있을 때 칸 안 이미지는 칸을 채우고 컬러다', () => {
    const html = render('video')
    expect(html).toContain('class="absolute inset-0 w-full h-full object-cover"')
    expect(html).not.toContain('grayscale')
  })

  it('imageDimmed면 이미지에만 grayscale이 붙는다', () => {
    const html = render('video', { imageDimmed: true })
    expect(html).toContain('class="absolute inset-0 w-full h-full object-cover grayscale"')
    expect(html.match(/grayscale/g)).toHaveLength(1)
  })

  it('이미지 없음: 옛 자리 표시 클래스·아이콘이 그대로다', () => {
    const html = render('video', { imageUrl: null })
    expect(html).toBe(`<div class="${OLD_HERO_BOX}"><div class="${OLD_HERO_PLACEHOLDER}">${iconMarkup({ resource: 'mission' })}</div></div>`)
  })

  it('이미지 없음 + titleInImage: 옛 판 위 제목 문자열이 그대로다', () => {
    const html = render('video', { imageUrl: null, titleInImage: true })
    expect(html).toBe(
      `<div class="${OLD_HERO_BOX}"><div class="${OLD_HERO_PLACEHOLDER}">${iconMarkup({ resource: 'mission' })}${OLD_HERO_TITLE}</div></div>`,
    )
  })
})

describe('CardImageSlot — 비율별 칸', () => {
  it.each([
    ['video', 'relative aspect-video overflow-hidden bg-background'],
    ['poster', 'relative aspect-[4/5] overflow-hidden bg-background'],
    ['square', 'relative aspect-square overflow-hidden bg-background'],
  ] as const)('%s: 칸 클래스는 %s다', (ratio, box) => {
    expect(render(ratio)).toMatch(new RegExp(`^<div class="${box.replace(/[[\]/]/g, '\\$&')}">`))
  })

  it.each([['video'], ['poster'], ['square']] as const)('%s: 주소가 없거나 공백뿐이어도 칸이 늘 있다(높이가 흔들리지 않는다)', (ratio) => {
    const box = render(ratio).match(/^<div class="([^"]*)"/)![1]
    for (const imageUrl of [null, '   ', IMAGE]) {
      expect(render(ratio, { imageUrl })).toContain(`<div class="${box}">`)
    }
  })

  it.each([
    ['video', 'object-cover'],
    ['poster', 'object-cover'],
    ['square', 'object-contain'],
  ] as const)('%s: 이미지는 %s다(square만 자르지 않는다)', (ratio, fit) => {
    const html = render(ratio)
    expect(html).toContain(`class="absolute inset-0 w-full h-full ${fit}"`)
    expect(render(ratio, { imageDimmed: true })).toContain(`class="absolute inset-0 w-full h-full ${fit} grayscale"`)
  })

  it('square 이미지는 object-cover가 아니다(잘리지 않는다)', () => {
    expect(render('square')).not.toContain('object-cover')
  })
})

describe('CardImageSlot — 자리 표시', () => {
  it('video·square는 칸 전체를, poster는 위쪽 60%만 쓴다(아래에서 올라오는 막과 겹치지 않게)', () => {
    expect(render('video', { imageUrl: null })).toContain(`class="absolute inset-0 flex`)
    expect(render('square', { imageUrl: null })).toContain(`class="absolute inset-0 flex`)
    const poster = render('poster', { imageUrl: null })
    expect(poster).toContain('class="absolute inset-x-0 top-0 h-[60%] flex flex-col items-center justify-center')
    expect(poster).not.toContain('absolute inset-0')
  })

  it.each([['video'], ['poster'], ['square']] as const)('%s: 판은 단색 + 아이콘뿐이다(그라디언트·문구 없음)', (ratio) => {
    const html = render(ratio, { imageUrl: null })
    expect(html).not.toContain('<img')
    expect(html).toContain('bg-background text-center')
    expect(html).not.toContain('gradient')
    expect(html).not.toContain('이미지 없음')
  })

  it.each(CARD_RESOURCES.map((resource) => [resource]))('%s는 그 자원의 아이콘을 장식(aria-hidden)으로 그린다', (resource) => {
    for (const ratio of ['video', 'poster', 'square'] as const) {
      expect(render(ratio, { resource, imageUrl: null })).toContain(iconMarkup({ resource }))
    }
    expect(iconMarkup({ resource })).toContain('aria-hidden="true"')
  })

  it('일반 카드는 판 위에 아이콘만 둔다(제목이 두 번 보이지 않게)', () => {
    for (const ratio of ['video', 'poster', 'square'] as const) {
      const html = render(ratio, { imageUrl: null })
      expect(html).not.toContain('한강 러닝 챌린지')
      expect(html).not.toContain('line-clamp-3')
    }
  })

  it('titleInImage 카드는 판 위에 제목을 그린다(16px bold·3줄 말줄임)', () => {
    for (const ratio of ['video', 'poster', 'square'] as const) {
      expect(render(ratio, { imageUrl: null, titleInImage: true })).toContain(OLD_HERO_TITLE)
    }
  })

  it('판 글자는 어두운 글자 색(text-foreground)이고 옅은 글자는 text-muted 한 단계뿐이다', () => {
    for (const ratio of ['video', 'poster', 'square'] as const) {
      const html = render(ratio, { imageUrl: null, titleInImage: true })
      expect(html).toContain('text-muted')
      for (const level of ['/30', '/40', '/50', '/60']) expect(html).not.toContain(`text-foreground${level}`)
    }
  })

  it('이미지가 있으면 자리 표시를 그리지 않는다', () => {
    for (const ratio of ['video', 'poster', 'square'] as const) {
      expect(render(ratio)).not.toContain('flex flex-col items-center')
    }
  })
})

describe('CardImageSlot — alt·sizes는 세 비율이 같은 한 곳의 규칙이다', () => {
  it.each([['video'], ['poster'], ['square']] as const)('%s: 제목이 화면 글자로 보이면 alt가 비어 있다', (ratio) => {
    expect(render(ratio)).toMatch(/<img[^>]*alt=""/)
  })

  it.each([['video'], ['poster'], ['square']] as const)('%s: titleInImage면 alt가 제목이다', (ratio) => {
    expect(render(ratio, { titleInImage: true })).toMatch(/<img[^>]*alt="한강 러닝 챌린지"/)
  })

  it.each([['video'], ['poster'], ['square']] as const)('%s: 최적화 가능한 주소에는 카드 폭(398px/뷰포트−32px) sizes를 준다', (ratio) => {
    expect(render(ratio, { imageUrl: INTERNAL_IMAGE })).toContain('sizes="(min-width: 430px) 398px, calc(100vw - 32px)"')
  })
})
