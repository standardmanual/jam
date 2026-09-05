import type { CSSProperties } from 'react';

export interface BadgeSilhouetteProps {
  /** 한 변 크기(px 또는 CSS 단위 문자열). 기본 44 — 레일 눈금 썸네일과 같은 값 */
  size?: number | string;
  /** 실루엣 투명도. 기본 0.22 (티켓 20260905_0036 확정값) */
  opacity?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * 미획득 배지의 «외형 비공개» 표시. 배지별 원본 이미지를 로드하지 않고 공통 SVG를 그린다
 * — `grayscale(1)`은 원본 URL이 네트워크에 나가 비공개가 성립하지 않기 때문.
 */
export function BadgeSilhouette(props: BadgeSilhouetteProps): JSX.Element;
