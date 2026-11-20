/**
 * 도장(`FeedStamp`) 렌더 테스트 (티켓 20261120_2144)
 *
 * 실행: cd jam-web && npx vitest run src/components/today/__tests__/FeedStamp.test.tsx
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'
import FeedStamp from '../FeedStamp'
import { FEED_COLOR_KEYS, FEED_STAMP_SIZE, feedColorVar } from '@/lib/today/feedConstants'

const render = (props: Partial<Parameters<typeof FeedStamp>[0]> = {}) =>
  renderToStaticMarkup(<FeedStamp color="yellow" {...props} />)

describe('FeedStamp', () => {
  it('장식이라 aria-hidden이고 포커스를 받지 않으며 포인터 이벤트가 없다', () => {
    const html = render()
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
    expect(html).toContain('pointer-events-none')
  })

  it('문구는 JOIN AND MOVE 하나뿐이다', () => {
    const html = render()
    expect(html).toContain('>JOIN AND MOVE<')
    expect((html.match(/<text[ >]/g) ?? []).length).toBe(1)
  })

  it('크기는 60px이다', () => {
    const html = render()
    expect(FEED_STAMP_SIZE).toBe(60)
    expect(html).toContain('width="60"')
    expect(html).toContain('height="60"')
    expect(html).toContain('viewBox="0 0 60 60"')
  })

  it('가운데가 비어 있다: 바깥·안쪽 두 원을 evenodd로 채운다', () => {
    const html = render()
    expect(html).toContain('fill-rule="evenodd"')
    // 도넛 경로는 원 둘(M 두 번)이다
    const donut = html.match(/<path d="([^"]+)" fill-rule="evenodd"/)
    expect(donut).not.toBeNull()
    expect((donut![1].match(/M /g) ?? []).length).toBe(2)
  })

  it('검정(--foreground) 2px 외곽선과 검정 글자다', () => {
    const html = render()
    expect(html).toContain('stroke:var(--foreground)')
    expect(html).toContain('stroke-width="2"')
    expect(html).toContain('fill:var(--foreground)')
  })

  it.each(FEED_COLOR_KEYS)('%s: 띠 면은 feedColorVar(key)의 var(--…)다', (key) => {
    expect(render({ color: key })).toContain(`fill:${feedColorVar(key)}`)
  })

  it('글자가 경로를 따라 돈다(textPath가 defs의 경로를 가리킨다)', () => {
    const html = render()
    const pathId = html.match(/<path id="([^"]+)"/)?.[1]
    expect(pathId).toBeTruthy()
    expect(html).toContain(`href="#${pathId}"`)
  })

  it('도장이 둘이어도 글자 경로 id가 겹치지 않는다', () => {
    const html = renderToStaticMarkup(
      <>
        <FeedStamp color="red" />
        <FeedStamp color="blue" />
      </>,
    )
    const ids = [...html.matchAll(/<path id="([^"]+)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('className(자리 클래스)을 이어 붙인다', () => {
    expect(render({ className: 'absolute right-2 top-2' })).toContain('absolute right-2 top-2')
  })

  it('소스에 hex 리터럴과 Math.random이 없다', () => {
    const source = readFileSync(path.resolve(process.cwd(), 'src/components/today/FeedStamp.tsx'), 'utf8')
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(source).not.toContain('Math.random')
  })
})
