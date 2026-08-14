import type { ReactNode, CSSProperties, MouseEventHandler } from 'react';

export interface CardProps {
  tone?: 'white' | 'tint' | 'inverse';
  padding?: number;
  radius?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Card(props: CardProps): JSX.Element;
