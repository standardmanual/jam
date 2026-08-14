import type { ReactNode, CSSProperties } from 'react';

export type BadgeFrameShape = 'circle' | 'ticket-v' | 'ticket-h' | 'scallop' | 'corner-cut' | 'tab-notch' | 'dumbbell';

export interface BadgeFrameProps {
  /** Frame silhouette — one of 7 badge shapes */
  shape?: BadgeFrameShape;
  /** Container width in px (default 200) */
  width?: number;
  /** Container height in px (default 200) */
  height?: number;
  /** Background fill — CSS color or token (default var(--color-primary)) */
  color?: string;
  children?: ReactNode;
  style?: CSSProperties;
}

export function BadgeFrame(props: BadgeFrameProps): JSX.Element;
