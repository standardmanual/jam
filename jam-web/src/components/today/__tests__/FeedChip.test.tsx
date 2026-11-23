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
import { FEED_CHIP, FEED_COLOR_KEYS, FEED_OUTLINE_WIDTH, FEED_TILTS, feedColorVar } from '@/lib/today/feedConstants'

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
  it.each(FEED_COLOR_KEYS.filter((key) => key !== 'white'))('%s: 면은 feedColorVar(key)의 var(--…)로 칠하고 글자는 --foreground다', (key) => {
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

  it('흰색 칩은 면이 --snow이고 글자는 --foreground다', () => {
    const html = render({ color: 'white' })
    expect(html).toContain('background-color:var(--snow)')
    expect(html).toContain('text-foreground')
  })

  it('면 색에 hex 값이 새지 않는다', () => {
    const colors: FeedChipColor[] = [...FEED_COLOR_KEYS, 'black', 'white']
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
