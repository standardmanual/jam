import type { ReactNode, CSSProperties } from 'react';

export type ShapeTagShape = 'rect' | 'pill' | 'circle' | 'dome' | 'triangle' | 'flag' | 'hex';

export interface ShapeTagProps {
  shape?: ShapeTagShape;
  colorIndex?: number;
  color?: string;
  /**
   * @deprecated 글자색은 surface와 무관하게 항상 --foreground다(태그 색이 밝은 팔레트라서).
   * 넘겨도 무시된다. v2에서 dark: boolean을 대체했던 prop이다.
   */
  surface?: 'light' | 'dark';
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function ShapeTag(props: ShapeTagProps): JSX.Element;
