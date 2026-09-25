/**
 * JAM! 에셋 제너레이터 — 프리셋 레이어 직렬화·역직렬화 (티켓 20260924_2159)
 *
 * PRD §5: 프리셋은 오버레이 레이어(이미지·텍스트) 목록과 순서만 저장한다. 텍스트 글자 내용은
 * 저장하지 않고, 이미지는 저장소 공개 URL을 가리킨다. 순서는 배열 위치로 표현하므로(레이어별
 * `order` 필드가 따로 없다) 두 함수 모두 배열 순서를 그대로 유지한다.
 *
 * 브라우저·서버(하위 티켓 20260924_2201의 윤진 CLI) 양쪽이 같은 규칙으로 프리셋을 읽고 써야
 * 하므로 캔버스·fetch 등 브라우저 전용 API에 의존하지 않는 순수 함수로 둔다 — 실제 저장소
 * 업로드(blob URL을 공개 URL로 바꾸는 일)는 호출부(API 라우트)의 책임이다.
 *
 * 대상 유형(`target_type`) 값 목록·라벨·검증(티켓 20260925_1405)도 이 파일에 둔다 — 레이어
 * 직렬화와 마찬가지로 화면(`PresetPanel.tsx`)과 API 라우트 양쪽이 같은 값 집합을 봐야 한다.
 */
import type { OverlayLayerConfig, PresetTargetType } from './types';

/**
 * 프리셋 대상 유형 값 목록·라벨(티켓 20260925_1405, CHECK 확장 마이그레이션 187과 값이 같다).
 * 저장 화면(`PresetPanel.tsx`)의 대상 유형 선택 UI와 API 라우트(`presets/route.ts`)의 검증이
 * 함께 쓴다 — 값 집합이 갈라지면 화면에서 고를 수 있는 값과 서버가 허용하는 값이 어긋난다.
 */
export const PRESET_TARGET_TYPES: PresetTargetType[] = ['badge', 'mission', 'collection', 'home_feed'];

export const PRESET_TARGET_TYPE_LABELS: Record<PresetTargetType, string> = {
  badge: '배지',
  mission: '미션',
  collection: '컬렉션',
  home_feed: '홈피드',
};

/** `value`가 유효한 프리셋 대상 유형인지 검사한다(폼·쿼리 파라미터 등 외부 입력 검증용). */
export function isPresetTargetType(value: unknown): value is PresetTargetType {
  return typeof value === 'string' && (PRESET_TARGET_TYPES as string[]).includes(value);
}

/**
 * 화면 상태(overlayLayers)를 프리셋 저장용으로 직렬화한다.
 *
 * - 텍스트 레이어의 `content`는 빈 문자열로 비운다(PRD §5, 글자 내용은 저장하지 않는다).
 * - 이미지 레이어는 `assetUrlByLayerId`에 그 레이어 id의 항목이 있으면 `assetUrl`을 그 값
 *   (저장소 업로드 후 얻은 공개 URL)으로 바꾼다. 없으면 원래 값을 그대로 둔다 — 이미 저장소
 *   URL을 가리키는 레이어(프리셋을 불러온 뒤 이미지를 바꾸지 않고 다시 저장하는 경우)를 다시
 *   업로드하지 않고 그대로 유지하기 위함이다.
 * - 배열 순서는 그대로 유지한다.
 */
export function serializePresetLayers(
  layers: OverlayLayerConfig[],
  assetUrlByLayerId: Record<string, string> = {}
): OverlayLayerConfig[] {
  return layers.map((layer) => {
    if (layer.type === 'text') return { ...layer, content: '' };
    const replacement = assetUrlByLayerId[layer.id];
    return replacement ? { ...layer, assetUrl: replacement } : layer;
  });
}

/**
 * 저장된 프리셋 레이어를 화면 상태로 역직렬화한다. 저장 시점에 이미 텍스트 `content`가 빈
 * 문자열이고 이미지 `assetUrl`이 공개 URL이므로 지금은 순서를 유지한 채 형태만 확정해 돌려주는
 * 항등에 가까운 변환이다 — 저장 형태가 늘어났을 때 이 경계에서 변환하기 위해 별도 함수로 둔다.
 */
export function deserializePresetLayers(layers: OverlayLayerConfig[]): OverlayLayerConfig[] {
  return layers.map((layer) => (layer.type === 'text' ? { ...layer, content: '' } : layer));
}
