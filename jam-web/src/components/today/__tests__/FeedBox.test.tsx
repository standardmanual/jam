/**
 * 박스 모양 부품(`FeedBox`) 렌더 테스트 (티켓 20261120_2144)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 인라인 스타일 문자열을 단언한다.
 * 마스크가 실제로 어떻게 보이는지는 Story(`FeedBox.stories.tsx`)가 보인다.
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedBox.test.tsx
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'
import FeedBox from '../FeedBox'
import { BOX_ORIENTATIONS, BOX_SHAPES, boxProtrusion, type BoxOrientation, type BoxShape } from '@/lib/today/boxShape'
import { FEED_COLOR_KEYS, feedColorVar } from '@/lib/today/feedConstants'

const render = (shape: BoxShape, orientation: BoxOrientation, extra: Partial<Parameters<typeof FeedBox>[0]> = {}) =>
  renderToStaticMarkup(
    <FeedBox shape={shape} orientation={orientation} color="ref-blue" seed="card-1" {...extra}>
      내용
    </FeedBox>,
  )

const MASKED = BOX_SHAPES.filter((s) => s !== 'round')

describe('FeedBox — 모양 × 방향', () => {
  it.each(BOX_SHAPES.flatMap((s) => BOX_ORIENTATIONS.map((o) => [s, o] as const)))('%s × %s: 오류 없이 그려지고 children을 담는다', (shape, orientation) => {
    const html = render(shape, orientation)
    expect(html).toMatch(/^<div/)
    expect(html).toContain('내용')
  })

  it.each(MASKED.flatMap((s) => BOX_ORIENTATIONS.map((o) => [s, o] as const)))('%s × %s: 마스크가 이 요소에 걸린다(표준·webkit 접두)', (shape, orientation) => {
    const html = render(shape, orientation)
    expect(html).toContain('mask-image:')
    expect(html).toContain('-webkit-mask-image:')
    expect(html).toContain('mask-size:')
    expect(html).toContain('mask-position:')
    expect(html).toContain('mask-repeat:no-repeat')
    expect(html).toMatch(/mask-composite:(intersect|add)/)
  })

  it('티켓·우표는 층을 겹치고(intersect) 돌출·물결은 합친다(add)', () => {
    expect(render('ticket', 'text')).toContain('mask-composite:intersect')
    expect(render('stamp', 'image')).toContain('-webkit-mask-composite:source-in')
    expect(render('bump', 'item')).toContain('mask-composite:add')
    expect(render('wave', 'text')).toContain('-webkit-mask-composite:source-over')
  })

  it('라운드는 마스크 없이 모서리 12px(rounded-xl)이다', () => {
    const html = render('round', 'text')
    expect(html).toContain('rounded-xl')
    expect(html).not.toContain('mask')
  })

  it('라운드·티켓·우표는 rounded-xl, 물결·돌출은 모서리를 마스크가 그려 클래스가 없다', () => {
    for (const shape of ['round', 'ticket', 'stamp'] as const) expect(render(shape, 'image')).toContain('rounded-xl')
    for (const shape of ['wave', 'bump'] as const) expect(render(shape, 'image')).not.toContain('rounded-xl')
  })
})

describe('FeedBox — 외곽선 없음·색', () => {
  it.each(BOX_SHAPES)('%s: 외곽선(border·outline)을 그리지 않는다', (shape) => {
    const html = render(shape, 'text')
    expect(html).not.toMatch(/border|outline/)
  })

  it.each(FEED_COLOR_KEYS.filter((key) => key !== 'white'))('%s: 면은 feedColorVar(key)의 var(--…)다', (key) => {
    expect(render('round', 'text', { color: key })).toContain(`background-color:${feedColorVar(key)}`)
  })

  it('흰색은 --snow다', () => {
    expect(render('round', 'text', { color: 'white' })).toContain('background-color:var(--snow)')
  })

  it('className을 이어 붙인다', () => {
    expect(render('round', 'text', { className: 'w-full h-40' })).toContain('rounded-xl w-full h-40')
  })
})

describe('FeedBox — 물결 시드', () => {
  it('같은 시드는 같은 마크업, 다른 시드는 다른 마크업이다', () => {
    expect(render('wave', 'image', { seed: 'a' })).toBe(render('wave', 'image', { seed: 'a' }))
    expect(render('wave', 'image', { seed: 'a' })).not.toBe(render('wave', 'image', { seed: 'b' }))
  })

  it('시드가 없으면 라운드로 대신한다(마스크 없음, rounded-xl)', () => {
    const html = render('wave', 'image', { seed: undefined })
    expect(html).toContain('rounded-xl')
    expect(html).not.toContain('mask')
  })
})

describe('FeedBox — 반원 돌출의 바깥 여백', () => {
  it('이미지 마스크는 양쪽 52px 안쪽 여백을 건다(돌출 영역이 요소 상자 안에 있다)', () => {
    expect(boxProtrusion('bump', 'image')).toEqual({ top: 0, right: 52, bottom: 0, left: 52 })
    expect(render('bump', 'image')).toContain('padding:0px 52px 0px 52px')
  })

  it('아이템 배지 박스는 위·아래 28px 안쪽 여백을 건다', () => {
    expect(render('bump', 'item')).toContain('padding:28px 0px 28px 0px')
  })

  it('돌출이 아닌 모양은 안쪽 여백을 걸지 않는다', () => {
    for (const shape of BOX_SHAPES.filter((s) => s !== 'bump')) expect(render(shape, 'image')).not.toContain('padding')
  })
})

describe('FeedBox — 소스', () => {
  const source = readFileSync(path.resolve(process.cwd(), 'src/components/today/FeedBox.tsx'), 'utf8')

  it('hex 리터럴과 Math.random이 없다', () => {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toContain('Math.random')
  })
})
