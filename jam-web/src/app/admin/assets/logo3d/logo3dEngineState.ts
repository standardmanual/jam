/**
 * 3D 모드 설정값 ↔ 프리셋 `engine_state` 변환 (티켓 20261103_1736)
 *
 * 저장: `Logo3DSceneState` → `EngineState`(JSON) + 올린 SVG 원문(있으면 파일로 따로 보낸다).
 * 불러오기: 서버가 돌려준 원본 JSON을 검증해 `Logo3DSceneState`로 되살린다. 깨진 값·알 수 없는 mode/version은
 * 무시하고 경고 한 줄을 돌려준다(호출부가 비율·레이어만 불러온다).
 * 형식·검증 규칙은 `@/lib/asset-generator/engineState`가 단일 원천이다. 캔버스·WebGL에 기대지 않는 순수 로직이다.
 */
import {
  ENGINE_STATE_VERSION,
  validateEngineState,
  type EngineState,
} from '@/lib/asset-generator/engineState'
import type { Logo3DSceneState } from './logo3dConfig'

/** 불러온 프리셋에서 되살릴 3D 모드 설정. */
export type LoadedEngine = { mode: '3d'; scene: Logo3DSceneState }

export const ENGINE_STATE_IGNORED_WARNING =
  '3D 설정을 불러오지 못했어요. 저장된 설정을 읽을 수 없어서 비율과 레이어만 불러왔어요. 3D 설정을 맞춘 뒤 다시 저장해 주세요.'
export const ENGINE_SVG_LOAD_WARNING =
  '올린 SVG를 불러오지 못했어요. 저장소에서 파일을 받지 못해 기본 로고로 보여드려요. SVG를 다시 올린 뒤 저장해 주세요.'

/** 3D 모드 설정을 저장 형식으로 만든다. SVG 원문과 주소는 담지 않는다(이름만 — 원문은 서버가 파일로 올린다). */
export function buildEngineState(scene: Logo3DSceneState): EngineState {
  const hasSvg = scene.svgText.trim() !== ''
  return {
    mode: '3d',
    version: ENGINE_STATE_VERSION,
    state: {
      source: scene.source,
      fontFamily: scene.fontFamily,
      fontWeight: scene.fontWeight,
      text: scene.text,
      params: { ...scene.params },
      paletteId: scene.paletteId,
      frameColor: scene.frameColor,
      tileColor: scene.tileColor,
      rotX: scene.rotX,
      rotY: scene.rotY,
      rotZ: scene.rotZ,
      zoom: scene.zoom,
      view: scene.view,
      ...(hasSvg && scene.svgName ? { svgName: scene.svgName } : {}),
    },
  }
}

/** 올린 SVG가 있으면 그 원문과 이름. 기본 로고(올린 파일 없음)면 null — 저장하지 않는다. */
export function engineSvgOf(scene: Logo3DSceneState): { text: string; name: string } | null {
  return scene.svgText.trim() === '' ? null : { text: scene.svgText, name: scene.svgName }
}

/** 검증을 통과한 상태와 SVG 원문(없으면 빈 문자열)으로 화면 상태를 되살린다. */
export function sceneFromEngineState(engine: EngineState, svgText: string): Logo3DSceneState {
  const s = engine.state
  return {
    source: s.source,
    fontFamily: s.fontFamily,
    fontWeight: s.fontWeight,
    text: s.text,
    svgText,
    svgName: svgText ? (s.svgName ?? '') : '',
    params: { ...s.params },
    paletteId: s.paletteId,
    frameColor: s.frameColor,
    tileColor: s.tileColor,
    rotX: s.rotX,
    rotY: s.rotY,
    rotZ: s.rotZ,
    zoom: s.zoom,
    view: s.view,
  }
}

export type ResolvedEngineLoad = { engine: LoadedEngine | null; warning: string | null }

/**
 * 서버가 돌려준 `engineState` 원본을 화면에 되살릴 설정으로 바꾼다.
 * - null/undefined(기존 프리셋): 설정 없음, 경고 없음 — 지금처럼 비율·레이어만 불러온다.
 * - 깨진 값·알 수 없는 mode/version: 무시하고 경고.
 * - 올린 SVG 주소가 있으면 원문을 받아온다. 받지 못하면 SVG 없이 되살리고 경고한다.
 */
export async function resolveEngineLoad(
  raw: unknown,
  fetchText: (url: string) => Promise<string> = defaultFetchText
): Promise<ResolvedEngineLoad> {
  if (raw === null || raw === undefined) return { engine: null, warning: null };
  const checked = validateEngineState(raw);
  if (!checked.ok) return { engine: null, warning: ENGINE_STATE_IGNORED_WARNING };

  let svgText = '';
  let warning: string | null = null;
  const svgUrl = checked.value.state.svgUrl;
  if (svgUrl) {
    try {
      svgText = await fetchText(svgUrl);
    } catch {
      warning = ENGINE_SVG_LOAD_WARNING;
    }
  }
  return { engine: { mode: '3d', scene: sceneFromEngineState(checked.value, svgText) }, warning };
}

async function defaultFetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SVG 응답 ${res.status}`);
  return res.text();
}
