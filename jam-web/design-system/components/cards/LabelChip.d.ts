import type { ReactNode, CSSProperties, HTMLAttributes } from 'react';

export interface LabelChipProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * 라벨 글자. `null`/`undefined`/`''`이면 아무것도 그리지 않는다(빈 필이 남지 않게).
   * 영문은 대문자로 보이고(`text-transform: uppercase`) 한글은 영향이 없다.
   */
  children?: ReactNode;
  /** 배치용 클래스(예: flex-col 카드 안에서 `self-start`). 배치는 컴포넌트가 정하지 않는다 */
  className?: string;
  style?: CSSProperties;
}

/**
 * 카드 좌상단 라벨 필. `--color-surface` 채움 + `--color-text` 12px bold 대문자, 안쪽 여백 6px 10px.
 * 변형 prop 없음 · 비인터랙티브 `<span>`.
 */
export function LabelChip(props: LabelChipProps): JSX.Element | null;
