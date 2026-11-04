/**
 * 가운데 확인 모달 (티켓 20261104_1810)
 *
 * 저장소에 jsdom이 없고 포털은 서버 렌더에서 마운트 게이트 때문에 그려지지 않는다. 그래서 닫힌 모양과 소스 구조(층·접근성·스크롤 락·전환)를 고정한다.
 * 실행: cd jam-web && npx vitest run src/components/ui/__tests__/ConfirmModal.test.tsx
 */
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ConfirmModal from '../ConfirmModal'

const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const source = strip(readFileSync(join(__dirname, '..', 'ConfirmModal.tsx'), 'utf8'))
const css = readFileSync(join(__dirname, '..', '..', 'transitions.css'), 'utf8')

describe('ConfirmModal', () => {
  it('닫혀 있거나 서버 렌더에서는 아무것도 그리지 않는다', () => {
    for (const open of [false, true]) {
      expect(renderToStaticMarkup(<ConfirmModal open={open} onClose={() => {}} body="본문" cancelLabel="취소" confirmLabel="확인" onConfirm={() => {}} />)).toBe('')
    }
  })

  it('body 포털이고 z-50 층이며 토스트(z-60)와 같은 값을 쓰지 않는다', () => {
    expect(source).toContain('createPortal(')
    expect(source).toContain('document.body')
    expect(source).toContain('z-50')
    expect(source).not.toMatch(/z-\[60\]|z-60|zIndex/)
  })

  it('다이얼로그 접근성: role·aria-modal·aria-labelledby, 포커스 순환과 Escape', () => {
    expect(source).toContain('role="dialog"')
    expect(source).toContain('aria-modal="true"')
    expect(source).toContain('aria-labelledby={bodyId}')
    expect(source).toContain("e.key === 'Escape'")
    expect(source).toContain("e.key !== 'Tab'")
    expect(source).toMatch(/previouslyFocused\.focus\(\)/)
  })

  it('확정 요청 중에는 Escape·백드롭·취소가 닫지 못한다', () => {
    expect(source).toMatch(/if \(!loadingRef\.current\) onCloseRef\.current\(\)/)
    expect(source).toMatch(/if \(!loading\) onClose\(\)/)
    expect(source).toMatch(/onClick=\{onClose\} disabled=\{loading\}/)
  })

  it('배경 스크롤은 참조 카운팅 헬퍼로 잠그고 직접 overflow를 만지지 않는다', () => {
    expect(source).toContain('pushMainScrollLock()')
    expect(source).not.toMatch(/style\.overflow|\.overflow =/)
  })

  it('버튼 배치: 왼쪽 secondary 취소, 오른쪽 primary 확정', () => {
    expect(source.indexOf('variant="secondary"')).toBeLessThan(source.indexOf('loading={loading}'))
    expect(source).not.toContain('backdrop-filter')
  })
})

describe('transitions.css — 가운데 모달 확장', () => {
  it('패널은 투명도·배율만 바꾸고 열려 있을 때만 탭을 받는다', () => {
    const panel = css.slice(css.indexOf('.t-modal {'), css.indexOf('.t-modal-backdrop {'))
    expect(panel).toContain('var(--modal-scale-close)')
    expect(panel).toContain('var(--modal-open-dur)')
    expect(panel).toContain('var(--modal-close-dur)')
    expect(panel).toContain('pointer-events: none')
    expect(panel).toContain('pointer-events: auto')
    expect(panel).not.toMatch(/translate|blur/)
  })

  it('모션 줄이기에서 전환이 없고 투명도 줄이기에서 스크림이 불투명하다', () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.t-modal,\s*\.t-modal-backdrop \{ transition: none !important; \}/)
    expect(css).toMatch(/prefers-reduced-transparency: reduce\) \{\s*\.t-modal-backdrop \{[^}]*--background-inverse/)
  })
})
