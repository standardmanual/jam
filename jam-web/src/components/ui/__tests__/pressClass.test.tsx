/**
 * 홈 밖 카드의 눌림이 공용 `.jam-press`다 (티켓 20261001_2244, 상위 20260930_1453 조각 b7 — 2236 흡수)
 *
 * 흩어져 있던 `active:scale-[0.98] transition-transform duration-100`을 `.jam-press`(0.98배·`--duration-micro` 80ms, 동작 줄이기 설정에서는 없음)로 모았다.
 * 눌림이 붙는 요소는 상자(inline이 아닌 요소)이어야 하고, 링크도 버튼도 아니거나 비활성(disabled)인 요소에는 붙이지 않는다.
 *
 * 확인하는 것: ① `ListRowCard`·`CollectionGridCard`가 눌림이 가능한 요소에만 `.jam-press`를 붙인다 ② 옛 문자열이 컴포넌트 출력에 없다
 * ③ 저장소의 소스 파일 어디에도 옛 문자열이 남지 않는다(정의 파일 `transitions.css`와 회귀 단언을 담은 테스트 파일만 예외).
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)와 파일 읽기로 확인한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import ListRowCard from '../ListRowCard'
import CollectionGridCard from '../CollectionGridCard'

const OLD_PRESS = 'active:scale-[0.98]'

describe('ListRowCard — 눌림은 .jam-press다', () => {
  it('링크 행에 붙고 옛 문자열은 없다', () => {
    const html = renderToStaticMarkup(<ListRowCard title="제목" href="/somewhere" />)
    expect(html).toContain('jam-press')
    expect(html).toContain('cursor-pointer')
    expect(html).not.toContain(OLD_PRESS)
    expect(html).not.toContain('duration-100')
  })

  it('버튼 행에 붙는다', () => {
    const html = renderToStaticMarkup(<ListRowCard title="제목" onClick={() => {}} />)
    expect(html).toContain('jam-press')
    expect(html).not.toContain(OLD_PRESS)
  })

  it('비활성(disabled) 버튼 행에는 붙지 않는다', () => {
    const html = renderToStaticMarkup(<ListRowCard title="제목" onClick={() => {}} disabled />)
    expect(html).not.toContain('jam-press')
    expect(html).not.toContain(OLD_PRESS)
  })

  it('링크도 버튼도 아닌 행에는 붙지 않는다', () => {
    const html = renderToStaticMarkup(<ListRowCard title="제목" />)
    expect(html).not.toContain('jam-press')
    expect(html).not.toContain(OLD_PRESS)
  })
})

describe('CollectionGridCard — 눌림은 .jam-press다', () => {
  const props = { name: '컬렉션', imageUrl: null, collected: 1, total: 4 }

  it('링크 카드에 붙고 옛 문자열은 없다', () => {
    const html = renderToStaticMarkup(<CollectionGridCard {...props} href="/collections/c1" />)
    expect(html).toContain('jam-press')
    expect(html).not.toContain(OLD_PRESS)
    expect(html).not.toContain('duration-100')
  })

  it('버튼 카드에 붙는다', () => {
    const html = renderToStaticMarkup(<CollectionGridCard {...props} onClick={() => {}} />)
    expect(html).toContain('jam-press')
  })

  it('링크도 버튼도 아닌 카드에는 붙지 않는다', () => {
    const html = renderToStaticMarkup(<CollectionGridCard {...props} />)
    expect(html).not.toContain('jam-press')
    expect(html).not.toContain(OLD_PRESS)
  })
})

describe('저장소에 옛 눌림 문자열이 남지 않는다', () => {
  const SRC = path.resolve(__dirname, '../../..')
  const DESIGN_SYSTEM = path.resolve(SRC, '../design-system')

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next') continue
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full, out)
      else if (/\.(ts|tsx|js|jsx|mjs|css)$/.test(name)) out.push(full)
    }
    return out
  }

  /** 정의(`transitions.css` 주석)와 회귀 단언을 담은 테스트 파일은 문자열이 있어도 된다. */
  const isAllowed = (file: string) =>
    file.endsWith(path.join('components', 'transitions.css')) || /\.test\.[jt]sx?$/.test(file) || file.includes(`${path.sep}__tests__${path.sep}`)

  it('active:scale-[0.98]은 transitions.css 정의와 테스트 파일 밖에 없다', () => {
    const files = [...walk(SRC), ...walk(DESIGN_SYSTEM)]
    expect(files.length).toBeGreaterThan(100) // 걷기 자체가 동작한다
    const offenders = files.filter((file) => !isAllowed(file) && readFileSync(file, 'utf8').includes(OLD_PRESS))
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
  })

  it('정의 파일 transitions.css에 .jam-press가 있다(옛 문자열을 대체하는 쪽이 살아 있다)', () => {
    const css = readFileSync(path.join(SRC, 'components/transitions.css'), 'utf8')
    expect(css).toMatch(/\.jam-press\s*\{/)
    expect(css).toMatch(/\.jam-press:active\s*\{/)
  })
})
