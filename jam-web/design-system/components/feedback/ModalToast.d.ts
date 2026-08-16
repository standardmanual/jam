import type { ReactNode } from 'react';

export type ModalToastType = 'success' | 'error' | 'info';

export interface ModalToastProps {
  message: string;
  type?: ModalToastType;
  open?: boolean;
  onDismiss?: () => void;
  /**
   * Replaces the default type-icon circle. Pass a BadgeFrame or any ReactNode.
   * Accessibility (alt text, aria attributes) for iconSlot content is the caller's responsibility.
   */
  iconSlot?: ReactNode;
  /** dismiss 버튼 레이블. 기본값 '닫기'. CTA 금칙어('확인')를 피하기 위해 prop으로 노출. */
  dismissLabel?: string;
}

export function ModalToast(props: ModalToastProps): JSX.Element | null;
