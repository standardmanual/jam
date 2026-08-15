import type { ReactNode } from 'react';

export interface BottomSheetProps {
  open: boolean;
  onDismiss?: () => void;
  title?: string;
  children?: ReactNode;
}

export function BottomSheet(props: BottomSheetProps): JSX.Element | null;
