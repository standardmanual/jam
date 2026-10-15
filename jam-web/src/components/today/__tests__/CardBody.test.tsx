/**
 * 공용 본문 조각(`CardBody`) 렌더 테스트 (티켓 20261001_2104, 상위 20260930_1453 조각 b5)
 *
 * `HeroCard`·`SquareCard`·`ListCard`가 같은 본문 조각을 쓴다는 것을 고정한다. 공용으로 빼기 전 `hero`·`square`는 같은 클래스를 두 벌 갖고 있었고
 * (`SquareCard.test.tsx`의 「드리프트 감시」), 그 감시는 조각이 하나가 되면서 목적이 없어져 여기로 옮겼다.
 * 공용으로 뺀 뒤에도 `hero`·`square` 출력 HTML이 변경 전과 글자 단위로 같다는 것은 공용화 직전·직후의 전체 출력을 비교해 확인했다(168개 조합 동일).
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 문자열을 단언한다.
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CardBody, CardDescription, CardEndLine, CardFacts, CardTitleGroup } from '../CardBody'
import HeroCard from '../HeroCard'
import ListCard from '../ListCard'
import SquareCard from '../SquareCard'
import type { CardResource, ImageCardView, ListCardView } from '@/lib/today/cardView'

const BODY_OPEN = '<div class="flex flex-col gap-3 p-6">'
const H3_CLASS =
  'text-2xl text-snow line-clamp-2 break-keep break-words'
const SUBTITLE_CLASS =
  'mt-1 text-base text-snow/60 line-clamp-2 break-keep break-words'
const FACT_CLASS =
  'text-sm font-bold text-snow break-keep break-words'
const DESCRIPTION_CLASS =
  'text-sm text-snow/60 line-clamp-2 break-keep break-words'

describe('CardBody — 본문 칸', () => {
  it('안쪽 여백 24px, 그룹 사이 간격 12px의 세로 flex 칸이다', () => {
    expect(renderToStaticMarkup(<CardBody>안쪽</CardBody>)).toBe(`${BODY_OPEN}안쪽</div>`)
  })
})

describe('CardTitleGroup — 제목과 요약', () => {
  it('제목은 h3, 24px(--text-2xl)·2줄 말줄임·어절 단위 줄바꿈이고 굵게 하지 않는다', () => {
    const html = renderToStaticMarkup(<CardTitleGroup title="한강 러닝 챌린지" />)
    expect(html).toBe(`<div><h3 class="${H3_CLASS}">한강 러닝 챌린지</h3></div>`)
    expect(html).not.toMatch(/font-(bold|semibold|medium)/)
  })

  it('요약은 제목 아래 4px, 16px·/60·2줄 말줄임이다', () => {
    const html = renderToStaticMarkup(<CardTitleGroup title="제목" subtitle="이번 주말 같이 달려요" />)
    expect(html).toBe(`<div><h3 class="${H3_CLASS}">제목</h3><p class="${SUBTITLE_CLASS}">이번 주말 같이 달려요</p></div>`)
  })

  it('요약이 없거나 비어 있으면 제목만 남는다', () => {
    for (const subtitle of [undefined, '']) {
      const html = renderToStaticMarkup(<CardTitleGroup title="제목" subtitle={subtitle} />)
      expect(html).not.toContain('<p')
    }
  })
})

describe('CardFacts — 필수 정보', () => {
  it('한 줄에 하나씩 14px(--text-sm) 굵게 text-snow이고 말줄임 없이 줄바꿈한다', () => {
    const html = renderToStaticMarkup(<CardFacts facts={['기간 상시', '보상 300 포인트']} />)
    expect(html).toBe(`<div><p class="${FACT_CLASS}">기간 상시</p><p class="${FACT_CLASS}">보상 300 포인트</p></div>`)
    for (const needle of ['/60', 'line-clamp', 'truncate', 'body-sm']) expect(html).not.toContain(needle)
  })

  it('값이 없으면(undefined·빈 배열) 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<CardFacts />)).toBe('')
    expect(renderToStaticMarkup(<CardFacts facts={[]} />)).toBe('')
  })
})

describe('CardDescription — 설명문', () => {
  it('14px·/60·보통 굵기·2줄 말줄임이다', () => {
    const html = renderToStaticMarkup(<CardDescription description="설명문입니다" />)
    expect(html).toBe(`<p class="${DESCRIPTION_CLASS}">설명문입니다</p>`)
    expect(html).not.toContain('font-bold')
  })

  it('값이 없으면(undefined·빈 문자열) 아무것도 그리지 않는다', () => {
    expect(renderToStaticMarkup(<CardDescription />)).toBe('')
    expect(renderToStaticMarkup(<CardDescription description="" />)).toBe('')
  })
})

describe('CardEndLine — 끝 줄', () => {
  it('라벨은 호출부가 주고 12px·/60이며 화살표는 aria-hidden이다', () => {
    expect(renderToStaticMarkup(<CardEndLine label="전체 보기" />)).toBe(
      '<p class="text-xs text-snow/60">전체 보기 <span aria-hidden="true">→</span></p>',
    )
  })
})

describe('hero·square·list가 같은 조각을 쓴다 — 같은 입력이면 같은 제목 그룹·필수 정보 HTML', () => {
  type Shape = 'hero' | 'square' | 'list'
  /** 세 모양이 함께 읽는 표시 데이터 값 */
  interface Common {
    resource: CardResource
    title: string
    label: string
    subtitle: string
    facts: string[]
    description: string
    href: string
    titleInImage?: boolean
  }
  const VALUES: Common = {
    resource: 'mission',
    title: '한강 러닝 챌린지',
    label: '미션',
    subtitle: '이번 주말 같이 달려요',
    facts: ['기간 10월 12일~11월 8일', '보상 300 포인트 · 배지 1개'],
    description: '설명문입니다',
    href: '/missions/m1',
  }
  const imageView = (shape: 'hero' | 'square', overrides: Partial<Common> = {}): ImageCardView => ({
    shape,
    ...VALUES,
    imageUrl: 'https://cdn.example/c.png',
    ...overrides,
  })
  const listView = (overrides: Partial<Common> = {}): ListCardView => ({
    shape: 'list',
    ...VALUES,
    tiles: [{ name: '배지', imageUrl: null }],
    ...overrides,
  })
  const render = (shape: Shape, overrides: Partial<Common> = {}) => {
    if (shape === 'hero') return renderToStaticMarkup(<HeroCard view={imageView('hero', overrides)} />)
    if (shape === 'square') return renderToStaticMarkup(<SquareCard view={imageView('square', overrides)} />)
    return renderToStaticMarkup(<ListCard view={listView(overrides)} />)
  }
  const SHAPES: Shape[] = ['hero', 'square', 'list']

  /** 제목 그룹 = 본문 칸 안의 칩 줄 다음 `<div>…</div>`, 필수 정보 = `font-bold` 줄 묶음, 설명문 = 설명 글자가 든 `<p>` */
  const titleGroupOf = (html: string) => html.match(/<div><h3 .*?<\/h3>(?:<p [^>]*>[^<]*<\/p>)?<\/div>/)?.[0]
  const factsOf = (html: string) => html.match(/<div>(?:<p class="[^"]*font-bold[^"]*">[^<]*<\/p>)+<\/div>/)?.[0]
  const descriptionOf = (html: string) => html.match(/<p class="[^"]*">설명문입니다<\/p>/)?.[0]

  it('본문 칸이 같다', () => {
    for (const shape of SHAPES) expect(render(shape)).toContain(BODY_OPEN)
  })

  it('제목 그룹이 같다', () => {
    const hero = titleGroupOf(render('hero'))
    expect(hero).toBeDefined()
    for (const shape of SHAPES) expect(titleGroupOf(render(shape))).toBe(hero)
  })

  it('필수 정보가 같다', () => {
    const hero = factsOf(render('hero'))
    expect(hero).toBeDefined()
    for (const shape of SHAPES) expect(factsOf(render(shape))).toBe(hero)
  })

  it('설명문은 hero와 list가 같고 square에는 없다(결정 15)', () => {
    const hero = descriptionOf(render('hero'))
    expect(hero).toBeDefined()
    expect(descriptionOf(render('list'))).toBe(hero)
    expect(descriptionOf(render('square'))).toBeUndefined()
  })

  it('titleInImage면 이미지 모양 둘은 제목 그룹을 빼고(이 판단은 모양 쪽에 있다) 필수 정보는 남기며, list는 이미지 칸이 없어 제목을 늘 보인다', () => {
    for (const shape of ['hero', 'square'] as const) {
      const html = render(shape, { titleInImage: true })
      expect(html).not.toContain('<h3')
      expect(html).not.toContain('이번 주말 같이 달려요')
      expect(factsOf(html)).toBeDefined()
    }
    expect(titleGroupOf(render('list', { titleInImage: true }))).toBeDefined()
  })
})
