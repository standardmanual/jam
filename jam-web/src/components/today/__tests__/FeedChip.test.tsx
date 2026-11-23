/**
 * 홈피드 칩(`FeedChip`) 렌더 테스트 (티켓 20261120_2144)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 클래스·인라인 스타일 문자열을 단언한다.
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedChip.test.tsx
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ComponentProps } from 'react'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'
import FeedChip, { type FeedChipColor } from '../FeedChip'
import { FEED_CHIP, FEED_COLOR_KEYS, FEED_CORNER_CHIP, FEED_OUTLINE_WIDTH, FEED_TILTS, feedColorVar } from '@/lib/today/feedConstants'

const render = (props: Partial<ComponentProps<typeof FeedChip>> = {}) =>
  renderToStaticMarkup(
    <FeedChip color="red" tilt={4} {...props}>
      문경
    </FeedChip>,
  )

describe('FeedChip — 크기', () => {
  it('큰 칩: 높이 40·글자 18(text-lg)·가로 여백 16(px-4)', () => {
    const html = render({ size: 'lg' })
    expect(FEED_CHIP.large).toEqual({ height: 40, fontSize: 18, paddingX: 16 })
    expect(html).toContain('height:40px')
    expect(html).toContain('text-lg')
    expect(html).toContain('px-4')
  })

  it('작은 칩: 높이 32·글자 14(text-sm)·가로 여백 12(px-3)', () => {
    const html = render({ size: 'sm' })
    expect(FEED_CHIP.small).toEqual({ height: 32, fontSize: 14, paddingX: 12 })
    expect(html).toContain('height:32px')
    expect(html).toContain('text-sm')
    expect(html).toContain('px-3')
  })

  it('크기를 주지 않으면 작은 칩이다', () => {
    expect(render()).toContain('height:32px')
  })
})

describe('FeedChip — 코너 변형 (티켓 20261122_2228 R1)', () => {
  it('큰 칩: 높이 52·글자 24(text-2xl)·굵기 900(font-black)·가로 여백 16', () => {
    const html = render({ variant: 'corner', size: 'lg' })
    expect(FEED_CORNER_CHIP.large).toEqual({ height: 52, fontSize: 24, paddingX: 16 })
    expect(html).toContain('height:52px')
    expect(html).toContain('text-2xl')
    expect(html).toContain('font-black')
    expect(html).toContain('px-4')
    expect(html).not.toContain('font-bold')
  })

  it('작은 칩: 높이 40·글자 18(text-lg)·굵기 900·가로 여백 12, 크기를 주지 않으면 작은 칩이다', () => {
    const html = render({ variant: 'corner', size: 'sm' })
    expect(FEED_CORNER_CHIP.small).toEqual({ height: 40, fontSize: 18, paddingX: 12 })
    expect(html).toContain('height:40px')
    expect(html).toContain('text-lg')
    expect(html).toContain('font-black')
    expect(html).toContain('px-3')
    expect(render({ variant: 'corner' })).toContain('height:40px')
  })

  it('테두리 2px·알약·한 줄 글자·검정 칩 글자색은 기본 변형과 같다', () => {
    const html = render({ variant: 'corner', size: 'lg', color: 'black' })
    expect(html).toContain(`border-width:${FEED_OUTLINE_WIDTH}px`)
    expect(html).toContain('rounded-full')
    expect(html).toContain('whitespace-nowrap')
    expect(html).toContain('text-snow')
  })

  it('기울기는 3~12° 자유 각도(number)와 기존 FeedTilt 여섯 값을 모두 받는다', () => {
    expect(render({ variant: 'corner', tilt: 11.5 })).toContain('transform:rotate(11.5deg)')
    expect(render({ variant: 'corner', tilt: -3 })).toContain('transform:rotate(-3deg)')
    for (const tilt of FEED_TILTS) expect(render({ variant: 'corner', tilt })).toContain(`transform:rotate(${tilt}deg)`)
  })

  it('변형을 주지 않는 기본 경로(제목 속 칩)는 지금 크기·font-bold 그대로다', () => {
    const large = render({ size: 'lg' })
    expect(large).toContain('height:40px')
    expect(large).toContain('text-lg')
    expect(large).toContain('font-bold')
    expect(large).not.toContain('font-black')
    expect(render({ size: 'sm' })).toContain('height:32px')
  })
})

describe('FeedChip — 모양', () => {
  it('알약 모양·검정 2px 외곽선·굵은 한 줄 글자·한국어 줄바꿈 클래스', () => {
    const html = render()
    expect(html).toContain('rounded-full')
    expect(html).toContain('border-foreground')
    expect(html).toContain(`border-width:${FEED_OUTLINE_WIDTH}px`)
    expect(FEED_OUTLINE_WIDTH).toBe(2)
    expect(html).toContain('font-bold')
    expect(html).toContain('whitespace-nowrap')
    expect(html).toContain('break-keep')
    expect(html).toContain('wrap-break-word')
  })

  it('부모가 준 className(자리 클래스)을 그대로 이어 붙인다', () => {
    expect(render({ className: 'absolute -top-3 -left-3' })).toContain('absolute -top-3 -left-3')
  })

  it('글자 내용을 그대로 그린다', () => {
    expect(render()).toContain('>문경</span>')
  })
})

describe('FeedChip — 색', () => {
  it.each(FEED_COLOR_KEYS)('%s: 면은 feedColorVar(key)의 var(--…)로 칠하고 글자는 --foreground다', (key) => {
    const html = render({ color: key })
    expect(html).toContain(`background-color:${feedColorVar(key)}`)
    expect(html).toContain('text-foreground')
    expect(html).not.toContain('text-snow')
  })

  it('검정 칩만 글자가 --snow다', () => {
    const html = render({ color: 'black' })
    expect(html).toContain('background-color:var(--foreground)')
    expect(html).toContain('text-snow')
    expect(html).not.toContain('text-foreground')
  })

  it('white 키 칩은 면이 --jam-chip-white이고 글자는 --foreground다(직접 지정용 --snow 흰색은 없다)', () => {
    const html = render({ color: 'white' })
    expect(html).toContain(`background-color:${feedColorVar('white')}`)
    expect(html).toContain('var(--jam-chip-white)')
    expect(html).not.toContain('var(--snow)')
    expect(html).toContain('text-foreground')
  })

  it('면 색에 hex 값이 새지 않는다', () => {
    const colors: FeedChipColor[] = [...FEED_COLOR_KEYS, 'black']
    for (const color of colors) expect(render({ color })).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })
})

describe('FeedChip — 기울기', () => {
  it.each(FEED_TILTS)('%i도는 transform: rotate로 들어간다', (tilt) => {
    expect(render({ tilt })).toContain(`transform:rotate(${tilt}deg)`)
  })
})

describe('FeedChip — 소스', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/components/today/FeedChip.tsx'), 'utf8')

  it('hex 리터럴과 Math.random이 없다', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toContain('Math.random')
  })
})
