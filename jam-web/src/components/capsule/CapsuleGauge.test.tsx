/**
 * 캡슐 게이지 (티켓 20261028_1739 2회)
 *
 * 저장소에 jsdom이 없어 서버 렌더로 첫 화면을 검증한다. 서버 렌더는 효과를 돌리지 않으므로 «처음 그리는 값»이 곧 진입 모션의 시작 자리다.
 * 고정하는 것:
 *  - 눌러도 아무 일도 없다: button·jam-press·커서·클릭 핸들러가 없고 역할은 role="img"다.
 *  - 시작은 늘 그래프 2%(채움 정도 0)이고, 값이 있어도 처음에는 전환(transition)이 걸리지 않는다. 끝 눈금으로 옮기는 것은 효과다.
 *  - 퍼센트는 없고 채운 양의 숫자만 그린다(2026-11-04). 50% 미만이면 트랙 오른쪽 끝, 50% 이상이면 채움 안쪽 왼쪽이고, aria-label에는 숫자가 없다.
 *  - 색은 새 토큰(--capsule-track·--capsule-fill·--capsule-ring)이다.
 *
 * 실행: cd jam-web && npx vitest run src/components/capsule/CapsuleGauge.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import CapsuleGauge, { CAPSULE_GAUGE_HEIGHT_PX, gaugeCircleDiameter } from './CapsuleGauge'
import { capsuleNumberPlacement, capsuleNumberText } from '@/lib/capsule/capsule-gauge'
import { CapsuleResultContext } from './capsuleResultContext'

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

describe('채운 양의 숫자', () => {
  it('50% 미만이면 트랙 오른쪽 끝에 오렌지 숫자 하나를 그린다', () => {
    for (const [filled, required] of [[0, 300], [120, 300], [149, 300]]) {
      const html = render(filled, required)
      expect(textOf(html)).toBe(String(filled))
      expect(html).toContain('data-capsule-number="outside"')
      expect(html).not.toContain('data-capsule-number="inside"')
      expect(html).toContain('color:var(--capsule-fill)')
    }
  })

  it('50% 이상이면 채움 안쪽 왼쪽에 트랙 색 숫자를 그린다(경계 50%는 안쪽)', () => {
    for (const [filled, required] of [[150, 300], [211, 300], [300, 300]]) {
      const html = render(filled, required)
      expect(textOf(html)).toBe(String(filled))
      expect(html).toContain('data-capsule-number="inside"')
      expect(html).not.toContain('data-capsule-number="outside"')
      expect(html).toContain('color:var(--capsule-track)')
    }
  })

  it('안쪽 숫자는 번개 자리(원 지름)를 뺀 너비 안에서만 보이고 채움 안에 있다', () => {
    const html = render(200, 300)
    const circle = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)
    expect(html).toContain(`width:calc(100% - ${circle}px)`)
    expect(html.indexOf('data-capsule-number="inside"')).toBeGreaterThan(html.indexOf('background:var(--capsule-fill)'))
  })

  it('숫자는 양쪽 자리 모두 1px 위로 올라가 트랙 가운데에 맞는다', () => {
    expect(render(120, 300).match(/transform:translateY\(-1px\)/g)).toHaveLength(1)
    expect(render(200, 300).match(/transform:translateY\(-1px\)/g)).toHaveLength(1)
  })

  it('퍼센트 기호는 없고 aria-label에도 숫자가 없다', () => {
    const html = render(120, 300)
    expect(textOf(html)).not.toMatch(/%/)
    expect(html).toContain(`aria-label="${LABEL}"`)
  })

  it('처음 그릴 때(채움이 시작하기 전)와 붙들려 있는 동안 숫자는 투명하다', () => {
    const heldHtml = (filled: number) =>
      renderToStaticMarkup(
        <CapsuleResultContext.Provider value={{ gaugeHeld: true, resultPending: true, registerGaugeFill: () => {} }}>
          <CapsuleGauge filled={filled} required={300} ariaLabel={LABEL} />
        </CapsuleResultContext.Provider>
      )
    for (const html of [render(120, 300), render(200, 300), heldHtml(120), heldHtml(200)]) {
      expect(html).toMatch(/opacity:0/)
      expect(html).not.toContain('t-digit')
    }
    const circle = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)
    expect(heldHtml(200)).toContain(`width:calc(${circle}px + (100% - ${circle}px) * 0)`)
  })

  it('팝인은 공유 PopInNumber(Number pop-in)로 채움이 움직이기 시작할 때 같이 한 번 재생한다', () => {
    const code = readFileSync(join(__dirname, 'CapsuleGauge.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(code).toContain("import PopInNumber from '@/components/ui/PopInNumber'")
    expect(code).toMatch(/<PopInNumber key=\{numberText\} value=\{numberText\} playOnMount \/>/)
    expect(code).toMatch(/const showNumber = numberReady && arrived/)
  })

  it('숫자는 채움이 닿기를 기다리지 않고 움직이기 시작하는 순간 켜진다(두 모션이 동시에 시작)', () => {
    const code = readFileSync(join(__dirname, 'CapsuleGauge.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    // 켜는 타이머에 모션 시간(motion.durationMs)을 더하면 채움이 닿은 뒤에야 숫자가 나온다
    expect(code).toMatch(/setNumberReady\(true\), 0\)/)
    expect(code).not.toMatch(/setNumberReady\(true\), [^)]*durationMs/)
    expect(code).toMatch(/\[arrived, numberText\]/)
  })
})

describe('숫자 자리와 글자 규칙 (capsule-gauge)', () => {
  it('필요량이 0 이하이거나 숫자가 아니면 바깥쪽이다', () => {
    expect(capsuleNumberPlacement(10, 0)).toBe('outside')
    expect(capsuleNumberPlacement(10, Number.NaN)).toBe('outside')
  })

  it('필요량보다 많이 채워도 안쪽이고, 음수는 바깥쪽이다', () => {
    expect(capsuleNumberPlacement(999, 300)).toBe('inside')
    expect(capsuleNumberPlacement(-5, 300)).toBe('outside')
  })

  it('글자는 소수를 버리고 음수·숫자가 아닌 값은 0이다', () => {
    expect(capsuleNumberText(12.9)).toBe('12')
    expect(capsuleNumberText(-3)).toBe('0')
    expect(capsuleNumberText(Number.NaN)).toBe('0')
    expect(capsuleNumberText(8439384739)).toBe('8439384739')
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

  it('높이는 36, 원 지름은 트랙 안쪽 높이다', () => {
    expect(CAPSULE_GAUGE_HEIGHT_PX).toBe(36)
    expect(gaugeCircleDiameter(36)).toBe(28)
    expect(render(0, 300)).toContain('height:36px')
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

describe('합친 연출이 붙들 때 (티켓 20261028_1740 3회)', () => {
  const held = (filled: number) =>
    renderToStaticMarkup(
      <CapsuleResultContext.Provider value={{ gaugeHeld: true, resultPending: true, registerGaugeFill: () => {} }}>
        <CapsuleGauge filled={filled} required={300} ariaLabel={LABEL} />
      </CapsuleResultContext.Provider>
    )

  it('붙들려 있으면 값과 상관없이 2% 원이고 전환이 없다', () => {
    const circle = gaugeCircleDiameter(CAPSULE_GAUGE_HEIGHT_PX)
    for (const filled of [0, 150, 300]) {
      const html = held(filled)
      expect(html).toContain(`width:calc(${circle}px + (100% - ${circle}px) * 0)`)
      expect(html).toContain('transition:none')
    }
  })

  it('붙들려 있으면 숫자가 보이지 않는다(투명, 안쪽은 너비 0)', () => {
    expect(held(120)).toMatch(/opacity:0/)
    expect(held(200)).toMatch(/opacity:0/)
  })
})
