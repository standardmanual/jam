import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 시트·모달 스크림이 뒤 화면을 흐리게 한다(티켓 20261117_1752).
 * 흐림 값은 materials.css의 --scrim-blur 하나이고, 투명도 줄이기 설정에서는 0이다.
 */
const root = join(__dirname, '../../../..')
const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

describe('스크림 흐림 토큰', () => {
  const materials = read('design-system/tokens/materials.css')

  it('--scrim-blur를 8px로 정의한다', () => {
    expect(materials).toMatch(/--scrim-blur:\s*8px;/)
  })

  it('투명도 줄이기에서는 0px이다', () => {
    expect(materials).toMatch(/prefers-reduced-transparency: reduce\)\s*\{\s*:root\s*\{\s*--scrim-blur:\s*0px;/)
  })
})

describe('클래스 스크림', () => {
  const css = read('src/components/transitions.css')

  it('.t-panel-backdrop·.t-modal-backdrop이 --scrim-blur로 흐리게 한다', () => {
    for (const selector of ['.t-panel-backdrop', '.t-modal-backdrop']) {
      const re = new RegExp(`${selector.replace('.', '\\.')} \\{[^}]*(?<!-webkit-)backdrop-filter:\\s*blur\\(var\\(--scrim-blur\\)\\)`)
      expect(css, selector).toMatch(re)
    }
  })

  it('transitions.css 코드에 -webkit-backdrop-filter가 없다(lightningcss가 표준 backdrop-filter를 제거하는 회귀 방지)', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toContain('-webkit-backdrop-filter')
  })

  it('토스트·모달 스크림은 투명도 줄이기에서 필터를 끈다', () => {
    expect(css).toMatch(/prefers-reduced-transparency: reduce\) \{\s*\.t-toast-scrim \{[^}]*backdrop-filter: none/)
    expect(css).toMatch(/prefers-reduced-transparency: reduce\) \{\s*\.t-modal-backdrop \{[^}]*backdrop-filter: none/)
  })
})

describe('인라인 스크림', () => {
  const files = [
    'src/components/BadgeRevealOverlay.tsx',
    'src/components/strava/PendingItemsPickOverlay.tsx',
    'design-system/components/patterns/BadgeRevealCarousel.jsx',
  ]

  for (const file of files) {
    it(`${file}: --backdrop 스크림마다 흐림이 따라붙는다`, () => {
      const source = read(file)
      const scrims = source.match(/background: 'var\(--backdrop\)',/g) ?? []
      const blurs = source.match(/backdropFilter: 'blur\(var\(--scrim-blur\)\)',/g) ?? []
      expect(scrims.length).toBeGreaterThan(0)
      expect(blurs.length).toBe(scrims.length)
    })
  }
})
