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

/**
 * shape별 clip path(SVG path data). 'circle'은 path가 없어 null을 반환한다.
 * Canvas 2D(`new Path2D(d)`)에서도 그대로 쓸 수 있다 — 20260902_1613 참조.
 */
export function makePath(shape: BadgeFrameShape, w: number, h: number): string | null;
