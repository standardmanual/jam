/**
 * JAM! 에셋 제너레이터 — 레이어 번호 규칙 (티켓 20260927_0013, PRD §4 「레이어 번호」)
 *
 * 텍스트는 `text01`, `text02`, …, 이미지는 `img01`, `img02`, …로 종류별 01부터 번호를 매긴다.
 * 번호는 저장하지 않고 오버레이 레이어 배열 순서(인덱스 0이 목록 맨 위)로 항상 계산한다.
 * 어드민 화면과 CLI가 이 함수를 같이 써서 같은 번호를 본다. React·DOM 의존 없음.
 */
import type { OverlayLayerConfig } from './types';

export type LayerKeyType = OverlayLayerConfig['type'];

export interface LayerKeyEntry {
  id: string;
  type: LayerKeyType;
  /** `text01`, `img01` 형태 */
  key: string;
}

const KEY_PREFIX: Record<LayerKeyType, string> = { text: 'text', image: 'img' };

/** 종류와 순번(1부터)으로 번호 문자열을 만든다. 두 자리 미만은 0으로 채우고 이상은 그대로 쓴다. */
export function formatLayerKey(type: LayerKeyType, n: number): string {
  return `${KEY_PREFIX[type]}${String(n).padStart(2, '0')}`;
}

/** 번호 문자열을 해석한다. 대소문자를 구분하고 숫자 두 자리 이상만 받으며 0번은 없다. */
export function parseLayerKey(str: string): { type: LayerKeyType; n: number } | null {
  const match = /^(text|img)(\d{2,})$/.exec(str);
  if (!match) return null;
  const n = Number(match[2]);
  if (n < 1) return null;
  return { type: match[1] === 'text' ? 'text' : 'image', n };
}

/** 레이어 배열을 앞에서부터 훑어 종류별 01부터 번호를 매긴다. */
export function getLayerKeys(layers: readonly OverlayLayerConfig[]): LayerKeyEntry[] {
  const counts: Record<LayerKeyType, number> = { text: 0, image: 0 };
  return layers.map((layer) => {
    counts[layer.type] += 1;
    return { id: layer.id, type: layer.type, key: formatLayerKey(layer.type, counts[layer.type]) };
  });
}
