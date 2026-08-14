import type { ChangeEventHandler, SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  value?: string;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  options?: SelectOption[];
  placeholder?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  /** Visual validation state */
  state?: 'default' | 'error' | 'success';
  disabled?: boolean;
}

export function Select(props: SelectProps): JSX.Element;
