import type { ReactNode, MouseEventHandler } from 'react';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  surface?: 'light' | 'dark';
  fullWidth?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit';
  className?: string;
}

export function Button(props: ButtonProps): JSX.Element;
