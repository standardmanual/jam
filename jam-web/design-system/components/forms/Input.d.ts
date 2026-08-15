import type { ChangeEventHandler, InputHTMLAttributes } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  placeholder?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  type?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** Visual validation state */
  state?: 'default' | 'error' | 'success';
  disabled?: boolean;
}

export function Input(props: InputProps): JSX.Element;
