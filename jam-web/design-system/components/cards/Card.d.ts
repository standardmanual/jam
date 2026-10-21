import type { ReactNode, CSSProperties, MouseEventHandler, HTMLAttributes } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /**
   * 면 톤.
   * - `default`: `--surface`(흰) + 1px `--border`. 그림자 없음.
   * - `tint`: `--background-secondary`, 테두리 없음. 흰 카드 안 구획용.
   * - `inverse`: `--background-inverse`(어두운 반전 면) + `--snow` 글자 + 면과 같은 색의 1px 테두리(default와 박스 크기를 맞춘다).
   */
  tone?: 'default' | 'tint' | 'inverse';
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function Card(props: CardProps): JSX.Element;
