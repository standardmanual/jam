export type ProgressBarLabelType = 'none' | 'percent' | 'fraction';
export type ProgressBarLabelPosition = 'inline' | 'top';

export interface ProgressBarProps {
  /** 현재값 (fraction 라벨, percent 미지정 시 percent 계산에 사용) */
  current?: number;
  /** 전체값 (fraction 라벨, percent 미지정 시 percent 계산에 사용) */
  total?: number;
  /** 0~100 사이 퍼센트값. 지정하면 current/total 기반 계산을 덮어쓴다 */
  percent?: number;
  /** 'none'=바만 / 'percent'=바+퍼센트 / 'fraction'=바+n/n */
  labelType?: ProgressBarLabelType;
  /** 라벨 배치. 'inline'=바 옆, 'top'=바 위 우측 정렬 */
  labelPosition?: ProgressBarLabelPosition;
  /** 바 높이(px 또는 CSS 단위 문자열). 기본 8 */
  height?: number | string;
  /** 필 색상. 기본 var(--color-primary). 그라데이션 문자열도 허용(순위별 그라데이션 등) */
  color?: string;
  /** 트랙(배경) 색상. 기본 var(--color-border) */
  trackColor?: string;
  className?: string;
}

export function ProgressBar(props: ProgressBarProps): JSX.Element;
