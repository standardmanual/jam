/**
 * BottomSheet 스크림·패널·푸터·핸들의 면 (티켓 20261015_2133, 2회 버튼·입력창·내비게이션)
 *
 * 시트 구조를 쓰는 곳은 셋이다: 서비스 `BottomSheet.tsx`, 시트를 손으로 만든 `FeedSection.tsx`·`PoiCarouselModal.tsx`.
 * MODULAR `BottomSheet.jsx`는 서비스와 병존하는 쌍이다. `npm run ds:check`는 색을 비교하지 못한다.
 *
 * 면: 스크림 `--backdrop`(검정 50%) / 패널 `--background`(크림) / 푸터 `--surface`(흰) / 핸들 `--border`.
 * 크림(--background) 반투명 스크림은 크림 바탕 위에서 가려지는 느낌이 거의 없었다(시트와 스크림 경계 1.0x:1 → 3.94:1).
 * 서비스 패널은 크림 + 흰 푸터를 유지하고 MODULAR 패널을 `--background`로 맞췄다(사용자 승인 2026-10-16).
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
  'FeedSection.tsx': 'app/(main)/FeedSection.tsx',
  'PoiCarouselModal.tsx': 'components/PoiCarouselModal.tsx',
} as const

describe('스크림은 세 곳 모두 --backdrop이다', () => {
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
  it('서비스 BottomSheet.tsx·FeedSection.tsx 핸들이 bg-border이고 bg-white/20이 없다', () => {
    for (const file of [SHEETS['BottomSheet.tsx'], SHEETS['FeedSection.tsx']]) {
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

describe('패널은 크림, 푸터는 흰 면이다 — 서비스와 MODULAR가 같은 쌍', () => {
  const service = read(SHEETS['BottomSheet.tsx'])

  it('서비스 패널은 --background, 푸터는 bg-surface다', () => {
    expect(service).toContain('bg-[var(--background)] text-foreground')
    expect(service).toMatch(/className="shrink-0 px-4 pt-4 bg-surface"/)
  })

  it('MODULAR 패널은 --background, 푸터는 --surface다', () => {
    const html = renderToStaticMarkup(
      <DsBottomSheet open onClose={() => {}} title="제목" footer={<span>푸터</span>}>
        본문
      </DsBottomSheet>
    )
    const panel = /<div[^>]*role="dialog"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? ''
    expect(panel).toContain('background:var(--background)')
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
