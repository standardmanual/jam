import type { ChangeEventHandler, TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  placeholder?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  rows?: number;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** Visual validation state */
  state?: 'default' | 'error' | 'success';
  disabled?: boolean;
}

export function Textarea(props: TextareaProps): JSX.Element;
