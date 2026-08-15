import type { ChangeEventHandler, InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
  checked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  label?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  /** Visual validation state */
  state?: 'default' | 'error' | 'success';
}

export function Checkbox(props: CheckboxProps): JSX.Element;
