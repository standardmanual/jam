import type { ReactNode, MouseEventHandler, ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /**
   * primary(--accent) · secondary(--default) · danger(--danger, 글자 --foreground) ·
   * outline(투명 + 1px --field-border) · ghost(글자만 --link).
   */
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  /**
   * 'dark'는 --background-inverse 면 위 전용이다. danger·outline은 dark 값이 없어 light 값을 쓴다.
   */
  surface?: 'light' | 'dark';
  /** 'md'(기본, 44px 최소 높이) | 'sm'(≈31px, --scale-compact 배율 — 내비게이션 바 등 조밀한 컨텍스트 전용, 20260824_010) */
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
