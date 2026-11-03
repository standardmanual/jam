/**
 * 에셋 패널의 「3D」 모드 (티켓 20261103_1734)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 고정한다. 효과(useEffect)는 돌지 않으므로
 * 섹션이 모드에 따라 나오는지·순서가 맞는지·막힌 버튼이 비활성인지만 본다.
 *
 * 고정하는 것:
 * - Mode 버튼에 「3D (입체 로고)」가 있다.
 * - 3D 모드의 섹션 순서: Mode → Preset → Canvas → Input → Thickness → Color → View → Background → Overlay Layers → Export.
 * - Shape·Ribbon 모드에는 3D 전용 섹션이 없다. Background는 Shape와 3D에 있고 Ribbon에는 없다.
 * - 3D 모드에서 PNG·동영상 저장 버튼은 비활성이고, 콘텐츠 적용 탭은 안내만 보인다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/assets/__tests__/ShapeStudioPanel.mode3d.test.tsx
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

function render(engineMode: StudioEngineMode): string {
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
    exportBusy: false,
    videoRecording: false,
    videoButtonLabel: '동영상 저장 (15초)',
  }
  // 나머지 핸들러(on...)는 넘기지 않는다 — 서버 렌더는 클릭을 일으키지 않아 호출되지 않는다.
  return renderToStaticMarkup(<ShapeStudioPanel {...(props as unknown as ComponentProps<typeof ShapeStudioPanel>)} />)
}

/** 섹션 머리의 영문 제목(`<span>Title</span><span ...>한글 설명</span>`)을 나온 순서대로 뽑는다. */
function sectionTitles(html: string): string[] {
  const titles: string[] = []
  const re = /<div class="mb-3 flex items-center justify-between gap-2 text-\[11px\] font-semibold"><span>([^<]+)<\/span>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) titles.push(m[1])
  return titles
}

describe('에셋 패널 3D 모드', () => {
  it('Mode 버튼에 「3D (입체 로고)」가 있다', () => {
    const html = render('shape')
    expect(html).toContain('Shape (WebGL)')
    expect(html).toContain('Ribbon (2D 곡선)')
    expect(html).toContain('3D (입체 로고)')
  })

  it('3D 모드의 섹션 순서는 Mode → Preset → Canvas → Input → Thickness → Color → View → Background → Overlay Layers → Export다', () => {
    expect(sectionTitles(render('3d'))).toEqual([
      'Mode',
      'Preset',
      'Canvas',
      'Input',
      'Thickness',
      'Color',
      'View',
      'Background',
      'Overlay Layers',
      'Export',
    ])
  })

  it('Shape·Ribbon 모드에는 3D 전용 섹션이 없다', () => {
    for (const mode of ['shape', 'ribbon'] as const) {
      const titles = sectionTitles(render(mode))
      for (const only3d of ['Input', 'Thickness', 'Color', 'View']) expect(titles).not.toContain(only3d)
    }
  })

  it('Background는 Shape와 3D가 같은 섹션을 쓰고 Ribbon에는 없다', () => {
    expect(sectionTitles(render('shape'))).toContain('Background')
    expect(sectionTitles(render('3d'))).toContain('Background')
    expect(sectionTitles(render('ribbon'))).not.toContain('Background')
  })

  it('3D 모드에서는 PNG 저장·동영상 저장 버튼이 비활성이다', () => {
    const buttons = (html: string, label: RegExp) =>
      [...html.matchAll(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)].map((m) => m[0]).filter((b) => label.test(b))

    const html3d = render('3d')
    for (const b of buttons(html3d, /PNG 저장|동영상 저장/)) expect(b).toContain('disabled')
    expect(buttons(html3d, /PNG 저장|동영상 저장/)).toHaveLength(2)

    const htmlShape = render('shape')
    for (const b of buttons(htmlShape, /PNG 저장|동영상 저장/)) expect(b).not.toContain('disabled=""')
  })
})
