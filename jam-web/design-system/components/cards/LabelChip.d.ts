import type { ReactNode, CSSProperties, HTMLAttributes } from 'react';

export interface LabelChipProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * 색조. `default`(기본)는 `--background` 채움 + `--foreground` 글자로 흰 `Card tone="inverse"` 위에서 쓴다.
   * `inverse`는 `--background-inverse` 채움 + `--snow` 글자로 검정 바탕 위(기사 화면)에서 쓴다.
   */
  tone?: 'default' | 'inverse';
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
 * 카드 좌상단 라벨 필. 12px bold 대문자, 안쪽 여백 6px 10px. 기본(`default`)은 `--background` 채움 + `--foreground` 글자,
 * `tone="inverse"`는 `--background-inverse` 채움 + `--snow` 글자. `size` 변형 없음 · 비인터랙티브 `<span>`.
 */
export function LabelChip(props: LabelChipProps): JSX.Element | null;
