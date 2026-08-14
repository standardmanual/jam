export interface IconButtonProps {
  icon?: string;
  label?: string;
  onClick?: () => void;
  surface?: 'light' | 'dark';
}

export function IconButton(props: IconButtonProps): JSX.Element;
