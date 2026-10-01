/**
 * `.jam-press`(카드 눌림) CSS 계약 테스트 (티켓 20261001_1204, 상위 20260930_1453 b0).
 *
 * `ds:check`(`scripts/ds-sync-check.mjs`)에는 미사용 토큰·미사용 클래스 검사가 없다. 그래서
 * 이 조각처럼 적용처가 없는 채로 들어간 `.jam-press`의 동작 줄이기 절을 지켜 줄 장치가 없다 —
 * b2(새 카드)가 클래스를 붙이기 전까지 이 계약이 대신 지킨다. `transitions.css`는
 * 서비스 전용 파일이라 Storybook·`ds:check`가 보지 않는다.
 *
 * 저장소에 CSS 파서가 없어 주석을 걷어낸 텍스트에 정규식을 쓴다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const TRANSITIONS_CSS = readFileSync(path.resolve(__dirname, 'transitions.css'), 'utf-8')
const MOTION_CSS = readFileSync(path.resolve(__dirname, '../../design-system/tokens/motion.css'), 'utf-8')

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const css = stripComments(TRANSITIONS_CSS)

/** `@media (prefers-reduced-motion: reduce) { ... }` 중 `.jam-press`를 담은 블록의 안쪽 텍스트 */
function reducedMotionBlocksWithJamPress(source: string): string[] {
  const blocks: string[] = []
  const re = /@media \(prefers-reduced-motion: reduce\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g
  for (const m of source.matchAll(re)) {
    if (m[1].includes('.jam-press')) blocks.push(m[1])
  }
  return blocks
}

describe('.jam-press — 정의', () => {
  it('최상위 `.jam-press` 규칙은 한 번만 정의된다', () => {
    expect([...css.matchAll(/^\.jam-press\s*\{/gm)]).toHaveLength(1)
  })

  it('전환은 transform만, 시간은 --duration-micro, 이징은 --ease-out이다', () => {
    const rule = css.match(/^\.jam-press\s*\{([^}]*)\}/m)?.[1] ?? ''
    expect(rule).toMatch(/transition-property:\s*transform\s*;/)
    expect(rule).toMatch(/transition-duration:\s*var\(--duration-micro\)\s*;/)
    expect(rule).toMatch(/transition-timing-function:\s*var\(--ease-out\)\s*;/)
  })

  it('`:active` 규칙은 한 번만 정의되고 --scale-press-card로 줄인다', () => {
    const rules = [...css.matchAll(/^\.jam-press:active\s*\{([^}]*)\}/gm)]
    expect(rules).toHaveLength(1)
    expect(rules[0][1]).toMatch(/transform:\s*scale\(var\(--scale-press-card\)\)\s*;/)
  })
})

describe('.jam-press — 동작 줄이기(prefers-reduced-motion: reduce)', () => {
  const blocks = reducedMotionBlocksWithJamPress(css)

  it('`.jam-press`를 다루는 동작 줄이기 블록이 정확히 하나 있다', () => {
    expect(blocks).toHaveLength(1)
  })

  it('전환이 없다', () => {
    expect(blocks[0]).toMatch(/\.jam-press\s*\{\s*transition:\s*none\s*;?\s*\}/)
  })

  it('눌림 배율이 없다', () => {
    expect(blocks[0]).toMatch(/\.jam-press:active\s*\{\s*transform:\s*none\s*;?\s*\}/)
  })
})

describe('--scale-press-card 토큰', () => {
  it('motion.css에 0.98로 정의돼 있다', () => {
    expect(stripComments(MOTION_CSS)).toMatch(/--scale-press-card:\s*0\.98\s*;/)
  })

  it('버튼 눌림 토큰(--scale-press: 0.96)은 그대로다', () => {
    expect(stripComments(MOTION_CSS)).toMatch(/--scale-press:\s*0\.96\s*;/)
  })
})
