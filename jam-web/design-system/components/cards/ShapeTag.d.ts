import type { ReactNode, CSSProperties } from 'react';

export type ShapeTagShape = 'rect' | 'pill' | 'circle' | 'dome' | 'triangle' | 'flag' | 'hex';

export interface ShapeTagProps {
  shape?: ShapeTagShape;
  colorIndex?: number;
  color?: string;
  /** v2: dark: boolean replaced by surface for API consistency with Button/IconButton */
  surface?: 'light' | 'dark';
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function ShapeTag(props: ShapeTagProps): JSX.Element;
