import type { ChangeEventHandler } from 'react';

export interface InputProps {
  placeholder?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  type?: string;
}

export function Input(props: InputProps): JSX.Element;
