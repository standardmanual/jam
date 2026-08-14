export type ModalToastType = 'success' | 'error' | 'info';

export interface ModalToastProps {
  message: string;
  type?: ModalToastType;
  open?: boolean;
  onDismiss?: () => void;
}

export function ModalToast(props: ModalToastProps): JSX.Element | null;
