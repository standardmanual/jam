import type { ReactNode, MouseEventHandler, ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  surface?: 'light' | 'dark';
  fullWidth?: boolean;
  disabled?: boolean;
  /** Show loading spinner and auto-disable interaction */
  loading?: boolean;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export function Button(props: ButtonProps): JSX.Element;
