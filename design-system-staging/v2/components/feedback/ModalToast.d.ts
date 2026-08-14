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
}

export function ModalToast(props: ModalToastProps): JSX.Element | null;
