import type { ReactNode, CSSProperties } from 'react';

export type ShapeTagShape = 'rect' | 'pill' | 'circle' | 'dome' | 'triangle' | 'flag' | 'hex';

export interface ShapeTagProps {
  shape?: ShapeTagShape;
  colorIndex?: number;
  color?: string;
  /**
   * JAM! faction name — maps to a tag color token. Unknown names fall back to colorIndex=0.
   * Stub mapping: fire | water | nature | shadow | light | storm | earth | void.
   * Update FACTION_COLORS in ShapeTag.jsx once FACTIONS.md is finalized.
   */
  faction?: string;
  /** v2: dark: boolean replaced by surface for API consistency with Button/IconButton */
  surface?: 'light' | 'dark';
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function ShapeTag(props: ShapeTagProps): JSX.Element;
