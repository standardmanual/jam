/**
 * JAM! 에셋 제너레이터 — 프리셋 저장 검증 (티켓 20261007_1602)
 *
 * 프리셋 저장 API(`presets/route.ts`)가 레이어를 DB에 쓰기 전에 거치는 검증이다. 저장만 엄격하게
 * 막고, 렌더는 지금처럼 관대하게 둔다(오버레이 색이 없으면 조용히 끈다, `render.ts`).
 *
 * - 오버레이 색(`overlayColor`)은 `#rrggbb` 6자리만 받는다.
 * - 이미 `http(s)://`로 시작하는 이미지 주소는 이 프로젝트 저장소 호스트의 https 주소만 받는다.
 *   호스트는 환경변수 `NEXT_PUBLIC_SUPABASE_URL`에서 읽는다(환경변수가 없으면 모두 거절).
 *   그 밖의 값(blob URL 등)은 라우트가 파일 필드를 요구하고 저장소 URL로 바꾼다.
 * - `overlayEnabled: true`인데 색이 없는 저장은 거절한다.
 *
 * 반환값은 사용자에게 보여줄 거절 문구(현상 → 원인 → 해결 순서, 해요체)이고, 통과하면 null이다.
 */
import type { OverlayLayerConfig } from './types';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const HTTP_URL = /^https?:\/\//i;

export const INVALID_OVERLAY_COLOR_MESSAGE =
  '프리셋을 저장하지 못했어요. 오버레이 색이 #rrggbb 형식이 아니에요. 색을 #ffffff처럼 6자리로 고른 뒤 다시 저장해 주세요.';
export const MISSING_OVERLAY_COLOR_MESSAGE =
  '프리셋을 저장하지 못했어요. 오버레이를 켰는데 색이 비어 있어요. 오버레이 색을 고르거나 오버레이를 끄고 다시 저장해 주세요.';
export const INVALID_ASSET_URL_MESSAGE =
  '프리셋을 저장하지 못했어요. 이미지 주소가 JAM! 저장소의 주소가 아니에요. 이미지를 다시 올린 뒤 저장해 주세요.';

/** 환경변수의 Supabase URL에서 호스트를 꺼낸다. 없거나 형식이 틀리면 null. */
export function getAllowedAssetHost(supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).host || null;
  } catch {
    return null;
  }
}

/**
 * 브라우저의 URL 파서가 지우는 ASCII 탭·개행을 먼저 걷어낸다(티켓 20261007_1620). 값 안에 낀 탭·개행은 `new Image().src`가
 * 읽을 때 사라지므로, `/\t/evil.example`이 `//evil.example`로 바뀌어 외부 호스트를 가리킨다. 판정은 걷어낸 값으로 한다.
 */
export function stripUrlControlChars(value: string): string {
  return value.replace(/[\t\n\r]/g, '');
}

/** `/`로 시작하는 같은 출처 경로인가. 탭·개행을 걷어낸 뒤 `//host`·`/\host`(브라우저가 외부 주소로 읽는 모양)는 제외한다. */
export function isSameOriginPath(value: string): boolean {
  const v = stripUrlControlChars(value);
  return v.startsWith('/') && !/^[/\\]{2}/.test(v);
}

/** 이미 저장된 주소(`http(s)://`로 시작)인지. 이 값만 다시 업로드하지 않고 그대로 두므로 호스트를 검사한다. */
export function isStoredAssetUrl(assetUrl: unknown): boolean {
  return typeof assetUrl === 'string' && HTTP_URL.test(assetUrl);
}

export function isAllowedAssetUrl(assetUrl: string, allowedHost: string | null): boolean {
  if (!allowedHost) return false;
  try {
    const url = new URL(assetUrl);
    return url.protocol === 'https:' && url.host === allowedHost;
  } catch {
    return false;
  }
}

/** 레이어 목록을 검사해 첫 번째 위반의 거절 문구를 돌려준다. 통과하면 null. */
export function validatePresetLayers(layers: OverlayLayerConfig[], allowedHost: string | null = getAllowedAssetHost()): string | null {
  for (const layer of layers) {
    if (layer.type !== 'image') continue;

    const color = layer.overlayColor as unknown;
    const hasColor = color !== undefined && color !== null;
    if (hasColor && (typeof color !== 'string' || !HEX_COLOR.test(color))) return INVALID_OVERLAY_COLOR_MESSAGE;
    if (layer.overlayEnabled === true && !hasColor) return MISSING_OVERLAY_COLOR_MESSAGE;

    if (typeof layer.assetUrl !== 'string') return INVALID_ASSET_URL_MESSAGE;
    if (isStoredAssetUrl(layer.assetUrl) && !isAllowedAssetUrl(layer.assetUrl, allowedHost)) return INVALID_ASSET_URL_MESSAGE;
  }
  return null;
}
