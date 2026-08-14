export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  message: string;
  type?: ToastType;
  open?: boolean;
  onDismiss?: () => void;
}

export function Toast(props: ToastProps): JSX.Element | null;
