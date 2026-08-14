import type { CSSProperties } from 'react';

export interface SkeletonProps {
  /** Any CSS length value — px, %, rem, etc. Defaults to '100%'. */
  width?: string | number;
  /** Any CSS length value. Defaults to 16. */
  height?: string | number;
  /** Defaults to var(--radius-sm). Pass '50%' for avatar, var(--radius-pill) for text lines. */
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
}

export function Skeleton(props: SkeletonProps): JSX.Element;
