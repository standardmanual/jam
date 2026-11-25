import type { ChangeEventHandler, CSSProperties, InputHTMLAttributes, ReactNode, Ref } from 'react';

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
  /** 입력칸 앞 슬롯(검색 아이콘, `@` 접두어 등) */
  leading?: ReactNode;
  /** 입력칸 뒤 슬롯(스피너, 제출 버튼 등) */
  trailing?: ReactNode;
  /** 슬롯 래퍼 DOM ref (오류 흔들림 애니메이션 등) */
  containerRef?: Ref<HTMLDivElement>;
  /** 슬롯 래퍼 className */
  containerClassName?: string;
  /** 슬롯 래퍼 인라인 style */
  containerStyle?: CSSProperties;
}

export function Input(props: InputProps): JSX.Element;
