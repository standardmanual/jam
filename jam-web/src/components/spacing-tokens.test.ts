/**
 * 간격 역할 토큰 계약 테스트 (티켓 20261108_1928, 상위 20261108_1926).
 *
 * 값은 세 곳에 적힌다 — `tokens/spacing.css`(원천), `design-system/readme.md`의 대응표,
 * `Spacing.stories.tsx`의 대응표. 세 곳이 어긋나지 않도록 확정 표를 기준으로 맞춘다.
 * 역할 토큰은 이 회차에서 참조하는 곳이 없으므로, 값이 바뀌어도 화면은 바뀌지 않는다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const DS = path.resolve(__dirname, '../../design-system')
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const CSS = stripComments(readFileSync(path.join(DS, 'tokens/spacing.css'), 'utf-8'))
const README = readFileSync(path.join(DS, 'readme.md'), 'utf-8')
const STORY = readFileSync(path.join(DS, 'foundations/Spacing.stories.tsx'), 'utf-8')

// 티켓 확정 표: 이름 → [px 값(공백으로 구분), 클래스]
const ROLES: Record<string, [string, string]> = {
  '--page-x': ['16', 'px-4'],
  '--page-top': ['16', 'pt-4'],
  '--page-bottom': ['24', 'pb-6'],
  '--gap-section': ['20', 'gap-5 · space-y-5'],
  '--gap-section-lg': ['24', 'gap-6'],
  '--gap-group': ['12', 'gap-3'],
  '--gap-text': ['8', 'gap-2'],
  '--gap-label': ['4', 'gap-1'],
  '--gap-card': ['8', 'gap-2'],
  '--gap-card-detail': ['12', 'gap-3'],
  '--card-padding': ['16', 'p-4'],
  '--card-padding-row': ['12 16', 'py-3 px-4'],
  '--gap-field': ['16', 'gap-4'],
  '--gap-actions': ['8', 'gap-2'],
}

/** CSS 선언 하나를 읽어 `var(--spacing-N)`를 px 숫자로 풀어 돌려준다 */
function resolve(name: string): string {
  const raw = new RegExp(`${name}:\\s*([^;]+);`).exec(CSS)?.[1].trim()
  if (!raw) throw new Error(`${name} 선언이 없다`)
  return raw
    .replace(/var\((--[a-z0-9-]+)\)/g, (_, n: string) => resolve(n))
    .replace(/px/g, '')
}

describe('간격 역할 토큰', () => {
  it('--spacing-20이 20px로 선언돼 있다', () => {
    expect(resolve('--spacing-20')).toBe('20')
  })

  it.each(Object.entries(ROLES))('%s 의 CSS 값이 확정 표와 같다', (name, [value]) => {
    expect(resolve(name)).toBe(value)
  })

  it('readme 대응표의 값·클래스가 확정 표와 같다', () => {
    for (const [name, [value, cls]] of Object.entries(ROLES)) {
      const classCell = cls
        .split(' · ')
        .map((c) => `\`${c}\``)
        .join(' · ')
      expect(README).toContain(`| \`${name}\` | ${value} | ${classCell} |`)
    }
  })

  it('스토리 대응표의 이름·클래스가 확정 표와 같다', () => {
    for (const [name, [, cls]] of Object.entries(ROLES)) {
      expect(STORY).toContain(`{ token: '${name}', className: '${cls}' }`)
    }
  })

  it('기존 레이아웃 토큰 값은 바뀌지 않았다', () => {
    expect(resolve('--layout-card-padding')).toBe('24')
    expect(resolve('--layout-section-gap')).toBe('48')
    expect(resolve('--layout-element-gap')).toBe('16')
  })
})
