import type { ReactNode, CSSProperties, HTMLAttributes } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Icon slot. Defaults to a generic empty-box icon. Pass null to hide completely. */
  icon?: ReactNode | null;
  title?: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
  style?: CSSProperties;
}

export function EmptyState(props: EmptyStateProps): JSX.Element;
