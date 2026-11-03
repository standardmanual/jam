/**
 * logo3dEngineState — 3D 설정 ↔ 프리셋 engine_state 왕복 (티켓 20261103_1736)
 * 실행: cd jam-web && npx vitest run src/app/admin/assets/logo3d/__tests__/logo3dEngineState.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LOGO3D_SCENE, type Logo3DSceneState } from '../logo3dConfig'
import {
  buildEngineState,
  engineSvgOf,
  ENGINE_STATE_IGNORED_WARNING,
  ENGINE_SVG_LOAD_WARNING,
  resolveEngineLoad,
} from '../logo3dEngineState'

const HOST = 'ceehnkzdbecxwzxrhhns.supabase.co'
const SVG_URL = `https://${HOST}/images/asset-generator/presets/p1/engine-3d.svg`

beforeEach(() => {
  // 불러올 때의 검증이 저장소 호스트를 이 값에서 읽는다. vitest.setup.ts가 기본으로 지운다.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${HOST}`)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

const customScene: Logo3DSceneState = {
  ...DEFAULT_LOGO3D_SCENE,
  source: 'svg',
  fontFamily: 'Pretendard',
  fontWeight: 500,
  text: '잼',
  svgText: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  svgName: 'my-logo.svg',
  params: { ...DEFAULT_LOGO3D_SCENE.params, depth: 0.41, gap: 0.004 },
  paletteId: 'gold-cream',
  frameColor: '#c9a24a',
  tileColor: '#f6ecd6',
  rotX: -30,
  rotY: 75,
  rotZ: 8,
  zoom: 140,
  view: 'isometric',
}

describe('buildEngineState', () => {
  it('3d 모드·버전 1이고 SVG 원문은 담지 않는다', () => {
    const engine = buildEngineState(customScene)
    expect(engine).toMatchObject({ mode: '3d', version: 1 })
    expect(JSON.stringify(engine)).not.toContain('<svg')
    expect(engine.state.svgName).toBe('my-logo.svg')
  })

  it('기본 로고(올린 SVG 없음)면 svgName도 담지 않고 올릴 SVG가 없다', () => {
    const scene = { ...customScene, svgText: '', svgName: '' }
    expect(buildEngineState(scene).state).not.toHaveProperty('svgName')
    expect(engineSvgOf(scene)).toBeNull()
  })

  it('올린 SVG가 있으면 원문과 이름을 돌려준다', () => {
    expect(engineSvgOf(customScene)).toEqual({ text: customScene.svgText, name: 'my-logo.svg' })
  })
})

describe('직렬화 → 역직렬화 왕복', () => {
  it('올린 SVG가 있는 상태가 같은 상태로 돌아온다', async () => {
    const stored = JSON.parse(JSON.stringify({ ...buildEngineState(customScene), state: { ...buildEngineState(customScene).state, svgUrl: SVG_URL } }))
    const fetchText = vi.fn(async () => customScene.svgText)
    const res = await resolveEngineLoad(stored, fetchText)
    expect(fetchText).toHaveBeenCalledWith(SVG_URL)
    expect(res.warning).toBeNull()
    expect(res.engine).toEqual({ mode: '3d', scene: customScene })
  })

  it('기본 로고 상태는 SVG를 받지 않고 같은 상태로 돌아온다', async () => {
    const scene = { ...DEFAULT_LOGO3D_SCENE, params: { ...DEFAULT_LOGO3D_SCENE.params }, rotY: 90 }
    const fetchText = vi.fn(async () => '')
    const res = await resolveEngineLoad(JSON.parse(JSON.stringify(buildEngineState(scene))), fetchText)
    expect(fetchText).not.toHaveBeenCalled()
    expect(res.engine?.scene).toEqual(scene)
  })
})

describe('resolveEngineLoad — 불러오기 예외', () => {
  it('칸이 비어 있는 기존 프리셋은 설정도 경고도 없다', async () => {
    expect(await resolveEngineLoad(null)).toEqual({ engine: null, warning: null })
    expect(await resolveEngineLoad(undefined)).toEqual({ engine: null, warning: null })
  })

  it('깨진 값·알 수 없는 mode/version은 무시하고 경고한다', async () => {
    const good = buildEngineState(DEFAULT_LOGO3D_SCENE)
    for (const raw of ['x', 42, {}, { ...good, mode: 'ribbon' }, { ...good, version: 9 }, { ...good, state: { ...good.state, zoom: 'a' } }]) {
      expect(await resolveEngineLoad(raw)).toEqual({ engine: null, warning: ENGINE_STATE_IGNORED_WARNING })
    }
  })

  it('SVG를 받지 못하면 SVG 없이 되살리고 경고한다', async () => {
    const raw = { ...buildEngineState(customScene), state: { ...buildEngineState(customScene).state, svgUrl: SVG_URL } }
    const res = await resolveEngineLoad(raw, async () => {
      throw new Error('404')
    })
    expect(res.warning).toBe(ENGINE_SVG_LOAD_WARNING)
    expect(res.engine?.scene).toMatchObject({ svgText: '', svgName: '', zoom: 140, view: 'isometric' })
  })
})
