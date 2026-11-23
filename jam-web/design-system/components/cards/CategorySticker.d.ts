import type { CSSProperties, SVGAttributes } from 'react';

/** 보색 짝 8개. 앞이 바탕, 뒤가 로고 글자 */
export type CategoryStickerPair =
  | 'yellow-purple'
  | 'purple-yellow'
  | 'green-pink'
  | 'pink-green'
  | 'sky-red'
  | 'red-sky'
  | 'blue-yellow'
  | 'yellow-blue';

export interface CategoryStickerProps extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  /** 모양. `pebble`(조약돌 116×84) · `wave`(물결 덩어리 112×92). 크기는 모양별로 고정이라 `size` prop이 없다 */
  shape?: 'pebble' | 'wave';
  /** 윤곽을 정하는 시드(카드 id 등). 같은 (shape, seed)는 늘 같은 모양이다 */
  seed?: string | number;
  /**
   * 둘레에 되풀이할 분류 문구(ACTIVITY·ITEM·MISSION·CHECK IN·COLLECTION·DROP·PICKUP).
   * 임의 문자열도 받고 길면 글자가 줄어든다. 비면 둘레 글자 없이 바탕과 로고만 그린다.
   */
  label?: string;
  /** 색 짝 이름. 알 수 없는 이름은 타입이 막는다(첫 짝으로 대체하지 않는다) */
  pair?: CategoryStickerPair;
  /** 가운데 로고 글자 */
  letter?: 'J' | 'a' | 'm';
  /** 배치용 클래스만 연다 */
  className?: string;
  style?: CSSProperties;
}

/**
 * 홈피드 분류 스티커. 비인터랙티브 SVG(`role="img"`, `aria-label`=분류 문구).
 * 바탕 색 채움 + `--foreground` 2px 테두리, 둘레 글자 굵기 900, 가운데 JAM 로고 글자(색 채움 + 약 1.6px 외곽선).
 */
export function CategorySticker(props: CategoryStickerProps): JSX.Element;

export interface StickerShape {
  shape: 'pebble' | 'wave';
  width: number;
  height: number;
  points: [number, number][];
  outlineD: string;
  ringPoints: [number, number][];
  ringD: string;
  ringLength: number;
  center: [number, number];
  glyphHeight: number;
  humps: { span: number; h: number }[] | null;
}
export interface RingText {
  text: string;
  repeat: number;
  fontSize: number;
  letterSpacing: number;
  fits: boolean;
  content: string;
}
export const STICKER_COLOR_PAIRS: Record<CategoryStickerPair, { base: string; glyph: string }>;
export const LOGO_GLYPHS: Record<'J' | 'a' | 'm', { bbox: [number, number, number, number]; d: string; evenodd?: boolean }>;
export const PEBBLE_SIZE: { width: number; height: number };
export const WAVE_SIZE: { width: number; height: number };
export const MIN_FONT_SIZE: number;
export const WAVE_HUMP_COUNT: [number, number];
export const WAVE_HUMP_HEIGHT: [number, number];
export function stickerSeedOf(seed: string | number): number;
export function stickerRandom(seed: string | number): () => number;
export function pebbleShape(seed: string | number): StickerShape;
export function waveShape(seed: string | number): StickerShape;
export function stickerShape(shape: 'pebble' | 'wave', seed: string | number): StickerShape;
export function fitRingText(label: string, ringLength: number, baseSize: number): RingText;
export function isSelfIntersecting(points: [number, number][]): boolean;
