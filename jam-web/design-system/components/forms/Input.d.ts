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
  /** Visual validation state. 오류 --danger, 성공 --success (1px 테두리 + 같은 색 inset 링 1px로 시각 2px). */
  state?: 'default' | 'error' | 'success';
  disabled?: boolean;
}

export function Input(props: InputProps): JSX.Element;
