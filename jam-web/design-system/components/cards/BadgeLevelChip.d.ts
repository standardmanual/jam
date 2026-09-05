import type { CSSProperties } from 'react';

export interface BadgeLevelChipProps {
  /**
   * 레벨(1부터). `null`/`undefined`면 아무것도 그리지 않는다 — 등급형·반복형 배지는
   * `level`이 없고 `RarityBadge`를 쓴다.
   */
  level?: number | null;
  /** 칩 고정 폭. 기본 52 — 계열 카드 1행 그리드 `[52px 칩][1fr 이름][auto 카운터]`와 맞춘다 */
  width?: number | string;
  className?: string;
  style?: CSSProperties;
}

/** 무한레벨형 배지의 «Lv.N» 칩. `--color-secondary` 채움 + 흰 텍스트(5.86:1). */
export function BadgeLevelChip(props: BadgeLevelChipProps): JSX.Element | null;
