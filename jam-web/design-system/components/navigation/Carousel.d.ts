import type { ReactNode, CSSProperties } from 'react';

export interface CarouselRenderInfo {
  isActive: boolean;
  realIndex: number;
}

export interface CarouselProps<T = unknown> {
  /** 캐러셀에 노출할 항목 목록(현재 공개된 윈도우) */
  items: T[];
  /** 현재 중앙(선택됨)에 있는 항목의 인덱스 — 컨트롤드 */
  activeIndex: number;
  /** 스와이프/키보드로 항목이 바뀔 때 호출 */
  onActiveIndexChange: (index: number) => void;
  /** 각 항목을 렌더링 */
  renderItem: (item: T, info: CarouselRenderInfo) => ReactNode;
  /** React key 계산(생략 시 배열 인덱스 사용) */
  getItemKey?: (item: T, index: number) => string | number;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

export function Carousel<T = unknown>(props: CarouselProps<T>): JSX.Element;
