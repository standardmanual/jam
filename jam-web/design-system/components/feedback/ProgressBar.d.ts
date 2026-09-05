export type ProgressBarLabelType = 'none' | 'percent' | 'fraction';
export type ProgressBarLabelPosition = 'inline' | 'top';
/**
 * 'solid'         — 기본. 단색 fill의 폭을 늘린다(기존 동작, 변경 없음).
 * 'track-gradient' — 트랙 전체 폭에 그라데이션을 깔고 clip-path로 잘라 보여준다.
 *                    fill 안에서 그라데이션을 압축하지 않아 진행률이 색으로 읽힌다.
 */
export type ProgressBarFillMode = 'solid' | 'track-gradient';

/** 트랙 기준 그라데이션 기본값 — `--status-short-solid`(채우는 중) → `--status-done-solid`(다 채움) */
export const PROGRESS_TRACK_GRADIENT: string;

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
  /** 바/트랙 모서리 radius(CSS 단위 문자열). 기본 var(--radius-pill) */
  radius?: string;
  /** 필 그리기 방식. 기본 'solid'(기존 동작). 'track-gradient'면 `color`는 무시된다 */
  fillMode?: ProgressBarFillMode;
  /** fillMode='track-gradient'일 때 트랙에 깔 그라데이션. 기본 PROGRESS_TRACK_GRADIENT */
  gradient?: string;
  className?: string;
}

export function ProgressBar(props: ProgressBarProps): JSX.Element;
