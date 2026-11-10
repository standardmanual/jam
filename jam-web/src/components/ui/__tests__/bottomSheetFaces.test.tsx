/**
 * BottomSheet 스크림·패널·푸터·핸들의 면 (티켓 20261015_2133, 2회 버튼·입력창·내비게이션)
 *
 * 시트 구조를 쓰는 곳은 둘이다: 서비스 `BottomSheet.tsx`, 시트를 손으로 만든 `PoiCarouselModal.tsx`(피드 상세 시트 `FeedSection.tsx`는 티켓 20261110_2150에서 걷었다).
 * MODULAR `BottomSheet.jsx`는 서비스와 병존하는 쌍이다. `npm run ds:check`는 색을 비교하지 못한다.
 *
 * 면: 스크림 `--backdrop`(검정 50%) / 패널 `--card-bg`(흰) / 푸터 `--surface`(흰) / 핸들 `--border`.
 * 바탕(--background) 반투명 스크림은 바탕 위에서 가려지는 느낌이 거의 없었다(시트와 스크림 경계 1.0x:1 → 3.94:1).
 * 패널·푸터 모두 흰 면이다. 패널은 --card-bg로 옮겼다(티켓 20261108_1940, 바탕이 회색(--background)이 되어 시트는 흰색 유지).
 *
 * 서비스 BottomSheet는 `document.body` 포털이라 서버 렌더가 안 되므로 소스에서 확인한다.
 * MODULAR BottomSheet는 서버 렌더(`renderToStaticMarkup`)로 확인한다(저장소에 jsdom이 없다).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { BottomSheet as DsBottomSheet } from '@ds/components/navigation/BottomSheet'

const read = (relative: string) => readFileSync(path.resolve(__dirname, '../../../', relative), 'utf8')

/** 스크림 div가 든 줄 — `t-panel-backdrop` 클래스를 가진 JSX 줄 */
const scrimLine = (source: string) => source.split('\n').find((line) => /<div[^>]*t-panel-backdrop/.test(line)) ?? ''

const SHEETS = {
  'BottomSheet.tsx': 'components/ui/BottomSheet.tsx',
  'PoiCarouselModal.tsx': 'components/PoiCarouselModal.tsx',
} as const

describe('스크림은 모든 시트가 --backdrop이다', () => {
  for (const [name, file] of Object.entries(SHEETS)) {
    it(`${name}: bg-backdrop이고 크림 반투명(bg-background/60·70)이 아니다`, () => {
      const line = scrimLine(read(file))
      expect(line, `${name}에서 t-panel-backdrop 줄을 찾지 못함`).not.toBe('')
      expect(line).toContain('bg-backdrop')
      expect(line).not.toMatch(/bg-background\/\d+/)
    })
  }

  it('MODULAR 스크림도 --backdrop이다', () => {
    const html = renderToStaticMarkup(<DsBottomSheet open onClose={() => {}} title="제목">본문</DsBottomSheet>)
    expect(html).toContain('background:var(--backdrop)')
  })
})

describe('핸들은 --border다(크림 위 흰색 반투명은 안 보인다)', () => {
  it('서비스 BottomSheet.tsx 핸들이 bg-border이고 bg-white/20이 없다', () => {
    for (const file of [SHEETS['BottomSheet.tsx']]) {
      const source = read(file)
      expect(source, file).toMatch(/w-10 h-1[^"]*bg-border|bg-border[^"]*w-10 h-1/)
      expect(source, file).not.toContain('bg-white/20')
    }
  })

  it('MODULAR 핸들도 --border다', () => {
    const html = renderToStaticMarkup(<DsBottomSheet open onClose={() => {}} title="제목">본문</DsBottomSheet>)
    expect(html).toContain('background:var(--border)')
  })
})

describe('패널·푸터는 흰 면이다 — 서비스와 MODULAR가 같은 쌍', () => {
  const service = read(SHEETS['BottomSheet.tsx'])

  it('서비스 패널은 --card-bg, 푸터는 bg-surface다', () => {
    expect(service).toContain('bg-[var(--card-bg)] text-foreground')
    expect(service).toMatch(/className="shrink-0 px-5 pt-2 bg-surface"/)
  })

  it('MODULAR 패널은 --card-bg, 푸터는 --surface다', () => {
    const html = renderToStaticMarkup(
      <DsBottomSheet open onClose={() => {}} title="제목" footer={<span>푸터</span>}>
        본문
      </DsBottomSheet>
    )
    const panel = /<div[^>]*role="dialog"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(panel).toContain('background:var(--card-bg)')
    expect(panel).not.toContain('background:var(--surface)')

    const footer = /<div[^>]*style="([^"]*background:var\(--surface\)[^"]*)"[^>]*><span>푸터<\/span>/.exec(html)
    expect(footer, 'MODULAR 푸터가 --surface가 아님').not.toBeNull()
  })

  it('푸터 구분선(border-top)을 새로 넣지 않았다', () => {
    expect(service).not.toMatch(/border-t\b/)
    const html = renderToStaticMarkup(
      <DsBottomSheet open onClose={() => {}} footer={<span>푸터</span>}>
        본문
      </DsBottomSheet>
    )
    expect(html).not.toContain('border-top')
  })
})

describe('prefers-reduced-transparency 대체 스크림', () => {
  it('불투명 --background-inverse다(크림이면 크림 패널과 같은 색이 되어 시트 경계가 사라진다)', () => {
    const css = read('components/transitions.css')
    const block = /@media \(prefers-reduced-transparency: reduce\)\s*\{\s*\.t-panel-backdrop\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(block).toContain('background-color: var(--background-inverse)')
    expect(block).not.toMatch(/background-color:\s*var\(--background\)/)
  })
})

describe('제목은 크고 굵게 쓴다 — 서비스와 MODULAR가 같은 값 (티켓 20261110_2048, 피그마 시안 52:28)', () => {
  it('서비스 BottomSheet 기본 제목은 text-xl font-bold leading-6이다', () => {
    const service = read(SHEETS['BottomSheet.tsx'])
    expect(service).toContain("const TITLE_CLASS_DEFAULT = 'text-xl font-bold leading-6'")
    expect(service).toContain('titleClassName ?? TITLE_CLASS_DEFAULT')
  })

  it('MODULAR 제목은 20px(--text-xl)·굵은 글씨·행간 24px이다', () => {
    const html = renderToStaticMarkup(<DsBottomSheet open onClose={() => {}} title="제목">본문</DsBottomSheet>)
    const heading = /<h2[^>]*style="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(heading).toContain('font-size:var(--text-xl)')
    expect(heading).toContain('font-weight:700')
    expect(heading).toContain('line-height:var(--spacing-24)')
  })
})
