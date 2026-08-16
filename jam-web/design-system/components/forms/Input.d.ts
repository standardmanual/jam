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
  /** Surface context. 'inverse'는 흰 배경(검색바 등 어두운 배경 위 밝은 입력 필드)에 사용 */
  surface?: 'default' | 'inverse';
}

export function Input(props: InputProps): JSX.Element;
