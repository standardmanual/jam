/**
 * JAM 테마 계약 테스트 (티켓 20261126_1945 9-2회차, 눈금 단일 원천은 티켓 20261126_2225 10-7회차).
 *
 * text-*·radius-*·ease-out·ease-in-out·leading-loose·leading-reading의 값은 `tokens/primitive.css`(:root)에만 둔다.
 * `jam-theme.css`는 맨 아래 `@theme inline reference` 블록에서 이름만 알리고 `var(--같은이름)`으로 primitive.css를 가리킨다.
 * 같은 이름에 값을 다시 적으면 두 값이 어긋날 수 있어 이 시험이 막는다.
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
const SHARED = /^--(text-|radius-|ease-|leading-loose$|leading-reading$)/
const theme = read('./jam-theme.css')
const refBlock = /@theme inline reference\s*\{([^}]*)\}/.exec(theme)?.[1] ?? ''
const REF = declsOf(refBlock)

describe('jam-theme.css', () => {
  it('Tailwind 기본 테마를 닫는다', () => {
    expect(theme).toMatch(/@theme\s*\{\s*--\*:\s*initial;/)
  })

  it('primitive.css와 겹치는 눈금은 reference 블록에서 같은 이름의 var()로만 가리킨다', () => {
    expect(REF.size).toBeGreaterThan(20)
    for (const [k, v] of REF) {
      expect([k, PRIMITIVE.has(k)]).toEqual([k, true])
      expect([k, v]).toEqual([k, `var(${k})`])
    }
  })

  it('@theme 본문은 primitive.css에 있는 눈금 이름에 값을 다시 적지 않는다', () => {
    const body = theme.replace(/@theme inline reference\s*\{[^}]*\}/, '')
    const dup = [...declsOf(body).keys()].filter((k) => SHARED.test(k) && PRIMITIVE.has(k))
    expect(dup).toEqual([])
  })

  it('숨은 덮어쓰기 3건(loose 1.6, ease-out·ease-in-out 키워드)은 primitive.css가 가진다', () => {
    expect(PRIMITIVE.get('--leading-loose')).toBe('1.6')
    expect(PRIMITIVE.get('--ease-out')).toBe('ease-out')
    expect(PRIMITIVE.get('--ease-in-out')).toBe('ease-in-out')
  })

  it('JAM 간격 눈금(--spacing-N)과 컴포넌트 토큰은 @theme에 넣지 않는다', () => {
    expect([...THEME.keys()].filter((k) => /^--spacing-\d+$/.test(k))).toEqual([])
    expect([...THEME.keys()].filter((k) => /^--text-swap-/.test(k))).toEqual([])
  })
})
