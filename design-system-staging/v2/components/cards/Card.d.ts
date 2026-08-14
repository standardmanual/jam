import type { ReactNode, CSSProperties, MouseEventHandler, HTMLAttributes } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** v2: 'white' removed (was #1a1a1a — name/result mismatch). Use 'default' instead. */
  tone?: 'default' | 'tint' | 'inverse';
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Card(props: CardProps): JSX.Element;
