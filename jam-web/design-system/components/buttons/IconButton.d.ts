import type { ButtonHTMLAttributes } from 'react';

export type IconButtonIcon =
  | 'chevron-left' | 'chevron-right'
  | 'close' | 'check' | 'info' | 'search' | 'menu';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconButtonIcon;
  /** Required: non-empty string for screen reader label */
  label: string;
  onClick?: () => void;
  surface?: 'light' | 'dark';
}

export function IconButton(props: IconButtonProps): JSX.Element;
