/**
 * JAM 테마 계약 테스트 (티켓 20261126_1945, 상위 20261125_1923 9-2회차).
 *
 * `jam-theme.css`(@theme)와 `tokens/primitive.css`(:root)는 text-*·radius-*·ease-*·leading-loose를 둘 다 적는다.
 * 유틸리티 생성에는 @theme가, 평문 눈금·어드민 미리보기 복원에는 :root가 필요해서다. 레이어 밖 :root가 이기므로
 * 두 값이 어긋나면 화면은 primitive.css 값을 따르고 @theme 값은 죽은 값이 된다 — 그 어긋남을 여기서 막는다.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (p: string) => strip(readFileSync(path.resolve(__dirname, p), 'utf-8'))

const declsOf = (css: string): Map<string, string> => {
  const m = new Map<string, string>()
  for (const [, k, v] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/g)) m.set(k, v.trim())
  return m
}

const THEME = declsOf(read('./jam-theme.css'))
const PRIMITIVE = declsOf(read('../../design-system/tokens/primitive.css'))
const SHARED = /^--(text-|radius-|ease-|leading-loose$)/

describe('jam-theme.css', () => {
  it('Tailwind 기본 테마를 닫는다', () => {
    expect(read('./jam-theme.css')).toMatch(/@theme\s*\{\s*--\*:\s*initial;/)
  })

  it('primitive.css와 같은 이름은 같은 값이다', () => {
    const shared = [...THEME.keys()].filter((k) => SHARED.test(k) && PRIMITIVE.has(k))
    expect(shared.length).toBeGreaterThan(20)
    for (const k of shared) expect([k, THEME.get(k)]).toEqual([k, PRIMITIVE.get(k)])
  })

  it('숨은 덮어쓰기 3건(loose 1.6, ease-out·ease-in-out 키워드)을 유지한다', () => {
    expect(THEME.get('--leading-loose')).toBe('1.6')
    expect(THEME.get('--ease-out')).toBe('ease-out')
    expect(THEME.get('--ease-in-out')).toBe('ease-in-out')
  })

  it('JAM 간격 눈금(--spacing-N)과 컴포넌트 토큰은 @theme에 넣지 않는다', () => {
    expect([...THEME.keys()].filter((k) => /^--spacing-\d+$/.test(k))).toEqual([])
    expect([...THEME.keys()].filter((k) => /^--text-swap-/.test(k))).toEqual([])
  })
})
