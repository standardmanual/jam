import type { CSSProperties } from 'react';

export interface SlotOutlineProps {
  /** 윤곽을 추적할 이미지 주소 — 있는 그대로 쓴다. 서비스는 `/_next/image?url=…&w=256&q=75`(같은 출처)를 넘긴다 */
  src?: string | null;
  /** 있으면 `role="img"` + `aria-label`, 없으면 `aria-hidden` */
  label?: string;
  /** 좌표계 한 변이자 최대 폭(px). 기본 90 */
  size?: number;
  /** 이미지를 넣을 때 사방 여백. 사각형 대체의 안쪽 여백이기도 하다. 기본 4 */
  inset?: number;
  /** 추적 실패·주소 없음일 때: `'box'` = 둥근 사각형 점선(기본), `'none'` = 아무것도 그리지 않음 */
  fallback?: 'box' | 'none';
  className?: string;
  style?: CSSProperties;
}

export interface TraceAlphaOutlineOptions {
  /** 돌려주는 path의 좌표계 한 변. 기본 90 */
  viewSize?: number;
  /** 이 값 이상의 alpha를 채워진 픽셀로 본다. 기본 128 */
  alphaThreshold?: number;
  /** 전체 면적 대비 이 비율 미만의 조각은 버린다. 기본 0.005 */
  minPieceRatio?: number;
  /** Douglas-Peucker 허용 오차(viewSize 단위). 기본 0.35 */
  epsilon?: number;
}

/**
 * 슬롯 칸의 점선 외곽선. 이미지는 그리지 않고, 이미지 알파 윤곽을 따라가는 점선 SVG 한 장만 그린다.
 * `stroke var(--muted)` 2px, 선 3 · 간격 4, `vector-effect: non-scaling-stroke`. 추적은 화면 근처에 들어올 때 시작하고 결과는 캐시한다.
 */
export function SlotOutline(props: SlotOutlineProps): JSX.Element;

/**
 * RGBA 배열에서 바깥 윤곽의 SVG path(`M…Z`)를 만든다. 순수 함수다.
 * 채워진 픽셀이 없거나 남은 조각이 없으면 `null`.
 */
export function traceAlphaOutline(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options?: TraceAlphaOutlineOptions,
): string | null;

/** 이미지 한 장의 윤곽 path를 돌려준다(`null` = 실패). 같은 `src`·`size`·`inset`은 한 번만 추적하고 진행 중 요청은 합친다 */
export function traceSlotOutlineImage(src: string, size?: number, inset?: number): Promise<string | null>;

/** 시험용 — 추적 결과 캐시를 비운다 */
export function clearSlotOutlineCache(): void;
