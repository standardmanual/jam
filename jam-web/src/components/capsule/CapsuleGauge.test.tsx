/**
 * 캡슐 게이지 (티켓 20261028_1739 2회)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 첫 화면을 검증한다. 서버 렌더는 효과를 돌리지 않으므로 «처음 그리는 값»이 곧 진입 모션의 시작 자리다.
 * 고정하는 것:
 *  - 눌러도 아무 일도 없다: button·jam-press·커서·클릭 핸들러가 없고 역할은 role="img"다.
 *  - 시작은 늘 그래프 2%(채움 정도 0)이고, 값이 있어도 처음에는 전환(transition)이 걸리지 않는다. 끝 눈금으로 옮기는 것은 효과다.
 *  - 퍼센트·진행 숫자가 화면 글자와 aria-label 어디에도 없다.
 *  - 색은 새 토큰(--capsule-track·--capsule-fill·--capsule-ring)이다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleGauge.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import CapsuleGauge, { CAPSULE_GAUGE_HEIGHT_PX, gaugeCircleDiameter } from './CapsuleGauge'

const LABEL = '캡슐, 채우는 중이에요'
const render = (filled: number, required: number) => renderToStaticMarkup(<CapsuleGauge filled={filled} required={required} ariaLabel={LABEL} />)
const textOf = (html: string) => html.replace(/<[^>]*>/g, '')

describe('눌러도 동작이 없다', () => {
  it('role="img"와 숫자 없는 aria-label이다', () => {
    const html = render(120, 300)
    expect(html).toContain('role="img"')
    expect(html).toContain(`aria-label="${LABEL}"`)
    expect(LABEL).not.toMatch(/\d|%/)
  })

  it('button·jam-press·커서·클릭 핸들러·팝업 속성이 없다', () => {
    const html = render(120, 300)
    expect(html).not.toMatch(/<button|jam-press|cursor-|onclick|aria-haspopup|tabindex/i)
  })

  it('소스에 클릭 핸들러와 button이 없다', () => {
    const code = readFileSync(join(__dirname, 'CapsuleGauge.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/<button|onClick|jam-press|cursor-pointer/)
  })
})

describe('숫자를 그리지 않는다', () => {
  it('글자 노드가 없다', () => {
    for (const [filled, required] of [[0, 300], [120, 300], [300, 300]]) {
      expect(textOf(render(filled, required))).toBe('')
    }
  })
})

describe('진입 모션의 시작 자리', () => {
  it('값이 있어도 처음에는 채움 정도 0(그래프 2%)이고 전환이 걸리지 않는다', () => {
    const html = render(150, 300)
    const circle = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)
    expect(html).toContain(`width:calc(${circle}px + (100% - ${circle}px) * 0)`)
    expect(html).toContain('transition:none')
  })

  it('값이 0이어도 같은 모양이다(모션 없음)', () => {
    const html = render(0, 300)
    expect(html).toContain('transition:none')
  })

  it('높이는 72, 원 지름은 트랙 안쪽 높이다', () => {
    expect(CAPSULE_GAUGE_HEIGHT_PX).toBe(72)
    expect(gaugeCircleDiameter(72)).toBe(60)
    expect(render(0, 300)).toContain('height:72px')
  })
})

describe('색과 모양', () => {
  it('트랙·채움·테두리는 새 토큰이다', () => {
    const html = render(120, 300)
    expect(html).toContain('background:var(--capsule-track)')
    expect(html).toContain('background:var(--capsule-fill)')
    expect(html).toContain('var(--capsule-ring)')
  })

  it('점 4개가 트랙 위에 있다', () => {
    const html = render(120, 300)
    expect(html.match(/left:(20|40|60|80)%/g)).toHaveLength(4)
  })

  it('번개 아이콘이 채움 끝 원 안에 있고 스크린리더에서 숨는다', () => {
    const html = render(120, 300)
    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
  })
})
