/**
 * 에셋 패널 — 녹화 중 「녹화 취소」 버튼 (티켓 20261103_2041)
 *
 * 녹화 중에는 패널 입력을 `fieldset disabled`로 막는데, 「녹화 취소」 버튼이 그 안에 있으면 함께 눌리지 않았다.
 * 서버 렌더(`renderToStaticMarkup`) 결과에서 「녹화 취소」가 비활성 fieldset 안에 있지 않은지,
 * 그리고 다른 입력(PNG 저장·동영상 저장·Mode)은 여전히 막혀 있는지 고정한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/assets/__tests__/ShapeStudioPanel.recording.test.tsx
 */
import type { ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { INITIAL_RIBBON_LAYER } from '@/app/admin/asset-generator/assetGeneratorHelpers'
import ShapeStudioPanel from '../ShapeStudioPanel'
import { DEFAULT_LOGO3D_SCENE } from '../logo3d/logo3dConfig'
import {
  BUILTIN_GLYPHS,
  cloneState,
  INITIAL_RAND_TOGGLES,
  INITIAL_STATE,
  type StudioEngineMode,
} from '../shapeStudioConfig'

vi.mock('@/app/admin/asset-generator/PresetPanel', () => ({ default: () => <div data-testid="preset-panel" /> }))
vi.mock('@/app/admin/asset-generator/ApplyTab', () => ({ default: () => <div data-testid="apply-tab" /> }))

function renderRecording(engineMode: StudioEngineMode): string {
  const noop = vi.fn()
  const props = {
    viewportRef: { current: null },
    engineMode,
    onChangeEngineMode: noop,
    logo3d: {
      state: DEFAULT_LOGO3D_SCENE,
      error: null,
      warnings: [],
      loading: false,
      onChange: noop,
      onSelectPalette: noop,
      onParamChange: noop,
      onSvgFile: noop,
      onResetZoom: noop,
    },
    state: cloneState(INITIAL_STATE),
    presets: [],
    glyphsMap: BUILTIN_GLYPHS,
    randOn: INITIAL_RAND_TOGGLES,
    ribbonLayer: INITIAL_RIBBON_LAYER,
    uploadedRibbonFileName: null,
    overlayLayers: [],
    selectedOverlayLayerId: null,
    exportSize: 2048,
    videoSize: 1080,
    exportBusy: true,
    videoRecording: true,
    videoButtonLabel: '녹화 중 3 / 15초',
  }
  return renderToStaticMarkup(<ShapeStudioPanel {...(props as unknown as ComponentProps<typeof ShapeStudioPanel>)} />)
}

/** html 안의 `index` 위치가 비활성 fieldset 안에 있는지 — fieldset 여닫는 태그를 앞에서부터 쌓아 본다. */
function insideDisabledFieldset(html: string, index: number): boolean {
  const stack: boolean[] = []
  const re = /<fieldset\b([^>]*)>|<\/fieldset>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && m.index < index) {
    if (m[0].startsWith('</')) stack.pop()
    else stack.push(/\bdisabled=""/.test(m[1]))
  }
  return stack.some(Boolean)
}

function buttonHtml(html: string, label: RegExp): { html: string; index: number }[] {
  return [...html.matchAll(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)]
    .filter((m) => label.test(m[0]))
    .map((m) => ({ html: m[0], index: m.index ?? 0 }))
}

describe('녹화 중 「녹화 취소」 버튼', () => {
  for (const mode of ['shape', '3d'] as const) {
    it(`${mode} 모드: 녹화 중 「녹화 취소」는 비활성 fieldset 밖에 있고 눌린다`, () => {
      const html = renderRecording(mode)
      const cancel = buttonHtml(html, /녹화 취소/)
      expect(cancel).toHaveLength(1)
      expect(cancel[0].html).not.toContain('disabled=""')
      expect(insideDisabledFieldset(html, cancel[0].index)).toBe(false)
    })

    it(`${mode} 모드: 녹화 중 PNG 저장·동영상 저장·Mode 버튼은 계속 막혀 있다`, () => {
      const html = renderRecording(mode)
      for (const label of [/PNG 저장/, /녹화 중 3 \/ 15초/, /Shape \(WebGL\)/]) {
        const found = buttonHtml(html, label)
        expect(found.length).toBeGreaterThan(0)
        for (const b of found) {
          expect(b.html.includes('disabled=""') || insideDisabledFieldset(html, b.index)).toBe(true)
        }
      }
    })
  }

  it('녹화 중에는 화면 탭(제작·콘텐츠 적용)이 눌리지 않아 「녹화 취소」가 사라지지 않는다 (티켓 20261103_2223)', () => {
    const html = renderRecording('shape')
    for (const label of [/제작/, /콘텐츠 적용/]) {
      const tabs = buttonHtml(html, label).filter((b) => /rounded-full/.test(b.html))
      expect(tabs.length).toBeGreaterThan(0)
      for (const t of tabs) expect(t.html).toContain('disabled=""')
    }
  })
})
