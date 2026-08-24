import type { ReactNode, MouseEventHandler, ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: 'primary' | 'secondary' | 'ghost';
  surface?: 'light' | 'dark';
  /** 'md'(기본, 44px 최소 높이) | 'sm'(32px — 내비게이션 바 등 조밀한 컨텍스트 전용, 20260824_010) */
  size?: 'md' | 'sm';
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
