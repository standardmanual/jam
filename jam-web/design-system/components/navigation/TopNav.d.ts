import type { ReactNode } from 'react';

export interface TopNavProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightSlot?: ReactNode;
}

export function TopNav(props: TopNavProps): JSX.Element;
