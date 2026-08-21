import type { ButtonHTMLAttributes } from 'react';

export type IconButtonIcon =
  | 'chevron-left' | 'chevron-right'
  | 'close' | 'check' | 'info' | 'search' | 'menu' | 'share';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconButtonIcon;
  /** Required: non-empty string for screen reader label */
  label: string;
  onClick?: () => void;
  surface?: 'light' | 'dark';
  /**
   * Soft-disabled state (20260821_004). Dims the button and sets `aria-disabled`,
   * but does NOT apply the native `disabled` attribute — `onClick` still fires so
   * callers can show an explanatory popover/tooltip on click.
   */
  disabled?: boolean;
}

export function IconButton(props: IconButtonProps): JSX.Element;
