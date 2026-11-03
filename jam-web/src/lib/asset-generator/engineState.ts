/**
 * JAM! 에셋 제너레이터 — 프리셋 `engine_state`(모드별 설정값) 형식·검증 (티켓 20261103_1736)
 *
 * 저장 형식: `{ "mode": "3d", "version": 1, "state": { ... } }`. 이번 범위는 3D 모드뿐이고,
 * Shape·Ribbon은 같은 형식에 `mode`를 늘려 담는다(허용 값 목록 `ENGINE_STATE_MODES`).
 *
 * 저장 API(`presets/route.ts`)가 쓰기 전에 `parseEngineStateInput`으로 검증하고, 화면이 불러올 때도
 * `validateEngineState`로 같은 규칙을 적용한다 — 알 수 없는 `mode`·`version`이나 깨진 값은 불러올 때 무시한다.
 * 알려진 필드만 골라 담으므로 클라이언트가 보낸 나머지 키는 저장되지 않는다.
 *
 * 올린 SVG 원문은 행에 넣지 않는다. 서버가 저장소(`asset-generator/presets/{id}/engine-3d.svg`)에 올리고
 * `state.svgUrl`에 그 주소만 담는다. 클라이언트가 보낸 `svgUrl`은 호스트를 검사하고(저장소 주소만 통과),
 * 라우트가 업로드 결과로 덮어쓴다.
 */
import { DEFAULT_LOGO3D_PARAMS, type Logo3DParams } from '@/lib/logo-3d/types';
import { isAllowedAssetUrl, isStoredAssetUrl, getAllowedAssetHost } from './presetValidate';

export const ENGINE_STATE_MODES = ['3d'] as const;
export type EngineStateMode = (typeof ENGINE_STATE_MODES)[number];
export const ENGINE_STATE_VERSION = 1;
/** `engineState` JSON 크기 상한(바이트). */
export const MAX_ENGINE_STATE_BYTES = 32 * 1024;
/** 올린 SVG를 프리셋 폴더에 두는 파일 이름. */
export const ENGINE_SVG_FILE_NAME = 'engine-3d.svg';

export const INVALID_ENGINE_STATE_MESSAGE =
  '프리셋을 저장하지 못했어요. 3D 설정의 형식이 올바르지 않아요. 화면을 새로 고친 뒤 다시 저장해 주세요.';
export const ENGINE_STATE_TOO_LARGE_MESSAGE =
  '프리셋을 저장하지 못했어요. 3D 설정이 32KB보다 커요. 글자열이나 올린 파일 정보를 줄인 뒤 다시 저장해 주세요.';
export const ENGINE_STATE_UNSUPPORTED_MESSAGE =
  '프리셋을 저장하지 못했어요. 이 서버가 모르는 모드나 버전의 설정이에요. 화면을 새로 고친 뒤 다시 저장해 주세요.';

export type Logo3DEngineState = {
  source: 'font' | 'svg';
  fontFamily: string;
  fontWeight: number;
  text: string;
  params: Logo3DParams;
  paletteId: string;
  frameColor: string;
  tileColor: string;
  rotX: number;
  rotY: number;
  rotZ: number;
  zoom: number;
  view: 'perspective' | 'isometric';
  /** 올린 SVG의 파일 이름(표시용). 올린 파일이 없으면 없다. */
  svgName?: string;
  /** 올린 SVG의 저장소 주소. 올린 파일이 없으면 없다. */
  svgUrl?: string;
};

export type EngineState = { mode: EngineStateMode; version: typeof ENGINE_STATE_VERSION; state: Logo3DEngineState };

export type EngineStateResult = { ok: true; value: EngineState } | { ok: false; message: string };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_SHORT_STRING = 100;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function shortString(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_SHORT_STRING;
}

/**
 * 이미 파싱한 값을 검사해 알려진 필드만 담은 `EngineState`로 돌려준다.
 * 알 수 없는 mode·version은 `ENGINE_STATE_UNSUPPORTED_MESSAGE`, 그 밖의 위반은 `INVALID_ENGINE_STATE_MESSAGE`.
 */
export function validateEngineState(raw: unknown, allowedHost: string | null = getAllowedAssetHost()): EngineStateResult {
  const invalid: EngineStateResult = { ok: false, message: INVALID_ENGINE_STATE_MESSAGE };
  if (!isRecord(raw)) return invalid;
  if (!(ENGINE_STATE_MODES as readonly unknown[]).includes(raw.mode) || raw.version !== ENGINE_STATE_VERSION) {
    return { ok: false, message: ENGINE_STATE_UNSUPPORTED_MESSAGE };
  }
  const s = raw.state;
  if (!isRecord(s)) return invalid;

  if (s.source !== 'font' && s.source !== 'svg') return invalid;
  if (s.view !== 'perspective' && s.view !== 'isometric') return invalid;
  if (!shortString(s.fontFamily) || s.fontFamily.trim() === '') return invalid;
  if (!shortString(s.text) || !shortString(s.paletteId)) return invalid;
  if (typeof s.frameColor !== 'string' || !HEX_COLOR.test(s.frameColor)) return invalid;
  if (typeof s.tileColor !== 'string' || !HEX_COLOR.test(s.tileColor)) return invalid;
  if (!isFiniteNumber(s.fontWeight)) return invalid;
  if (!isFiniteNumber(s.rotX) || !isFiniteNumber(s.rotY) || !isFiniteNumber(s.rotZ)) return invalid;
  if (!isFiniteNumber(s.zoom) || s.zoom <= 0) return invalid;

  if (!isRecord(s.params)) return invalid;
  const params = { ...DEFAULT_LOGO3D_PARAMS };
  for (const key of Object.keys(DEFAULT_LOGO3D_PARAMS) as (keyof Logo3DParams)[]) {
    const v = s.params[key];
    if (!isFiniteNumber(v)) return invalid;
    params[key] = v;
  }

  const state: Logo3DEngineState = {
    source: s.source,
    fontFamily: s.fontFamily,
    fontWeight: s.fontWeight,
    text: s.text,
    params,
    paletteId: s.paletteId,
    frameColor: s.frameColor,
    tileColor: s.tileColor,
    rotX: s.rotX,
    rotY: s.rotY,
    rotZ: s.rotZ,
    zoom: s.zoom,
    view: s.view,
  };

  if (s.svgName !== undefined) {
    if (typeof s.svgName !== 'string' || s.svgName.length > 200) return invalid;
    state.svgName = s.svgName;
  }
  if (s.svgUrl !== undefined) {
    if (typeof s.svgUrl !== 'string' || !isStoredAssetUrl(s.svgUrl) || !isAllowedAssetUrl(s.svgUrl, allowedHost)) return invalid;
    state.svgUrl = s.svgUrl;
  }

  return { ok: true, value: { mode: raw.mode as EngineStateMode, version: ENGINE_STATE_VERSION, state } };
}

/** 폼 필드로 받은 JSON 문자열을 크기 → 파싱 → 검증 순서로 검사한다. */
export function parseEngineStateInput(text: string, allowedHost: string | null = getAllowedAssetHost()): EngineStateResult {
  if (new TextEncoder().encode(text).length > MAX_ENGINE_STATE_BYTES) {
    return { ok: false, message: ENGINE_STATE_TOO_LARGE_MESSAGE };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, message: INVALID_ENGINE_STATE_MESSAGE };
  }
  return validateEngineState(parsed, allowedHost);
}
