export type ProgressBarLabelType = 'none' | 'percent' | 'fraction';
export type ProgressBarLabelPosition = 'inline' | 'top';
/**
 * 'solid'         — 기본. 단색 fill의 폭을 늘린다(기존 동작, 변경 없음).
 * 'track-gradient' — 트랙 전체 폭에 그라데이션을 깔고 clip-path로 잘라 보여준다.
 *                    fill 안에서 그라데이션을 압축하지 않아 진행률이 색으로 읽힌다.
 */
export type ProgressBarFillMode = 'solid' | 'track-gradient';

/**
 * 'div'  — 기본. 기존 마크업 그대로.
 * 'span' — 모든 요소(바깥·트랙·채움, 라벨 있을 때 래퍼 포함)를 span으로 그린다. `<a>`·`<button>`·`Link` 같은
 *          클릭 영역 안(phrasing 요건)에 놓을 때 켠다. `ProgressBar` 한정 prop이다.
 */
export type ProgressBarAs = 'div' | 'span';

/**
 * 'flat'    — 기본. 기존 모양 그대로(트랙 `--border`, 채움 `--accent`).
 * 'capsule' — 홈 캡슐 게이지와 같은 모양. 어두운 트랙(`--capsule-track`) 안쪽 2px 여백, 둥근 채움(기본색 `--capsule-fill`).
 *             채움 너비는 `calc(원지름px + (100% - 원지름px) × 비율)`(원지름 = height - 4)이라 아주 작아도 찌그러지지 않고, 0%이면 채움이 없다.
 *             **숫자 height만 받는다**(문자열이면 flat으로 그린다). `fillMode='track-gradient'`·`outlined`는 지원하지 않는다.
 */
export type ProgressBarShape = 'flat' | 'capsule';

/** 트랙 기준 그라데이션 기본값 — `--progress-short`(채우는 중) → `--progress-done`(다 채움) */
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
  /** 바 높이(px 또는 CSS 단위 문자열). 기본 8. shape='capsule'은 숫자만 받는다 */
  height?: number | string;
  /** 필 색상. 기본 var(--accent)(capsule은 var(--capsule-fill)). 그라데이션 문자열도 허용(순위별 그라데이션 등) */
  color?: string;
  /** 트랙(배경) 색상. 기본 var(--border)(capsule은 var(--capsule-track)) */
  trackColor?: string;
  /** 바/트랙 모서리 radius(CSS 단위 문자열). 기본 var(--radius-full) */
  radius?: string;
  /** 모양. 기본 'flat'(기존 마크업 그대로). 'capsule'은 홈 캡슐 게이지와 같은 트랙·채움 모양 */
  shape?: ProgressBarShape;
  /** 필 그리기 방식. 기본 'solid'(기존 동작). 'track-gradient'면 `color`는 무시된다 */
  fillMode?: ProgressBarFillMode;
  /** fillMode='track-gradient'일 때 트랙에 깔 그라데이션. 기본 PROGRESS_TRACK_GRADIENT */
  gradient?: string;
  /**
   * 트랙에 1px `--border` 외곽선을 둔다. 기본 false(기존 모양 그대로).
   * `box-sizing: border-box`라 `height`가 외곽선을 포함한다(`height={10}`이면 안쪽 8px). 채움은 외곽선 안쪽에만 그려진다.
   * 기본 `trackColor`(`--border`)로는 외곽선이 안 보이므로 `trackColor`를 따로 정한다.
   */
  outlined?: boolean;
  /**
   * 어떤 태그로 그릴지. 기본 'div'(기존 마크업 그대로).
   * 'span'은 `<a>`·`<button>`·`Link` 같은 클릭 영역 안(phrasing 요건)에 놓을 때 켠다.
   * span 경로에서만 바깥·트랙에 `display:block`이 붙어 높이·폭이 div와 같다.
   * `labelPosition`('inline'·'top')과 조합해도 래퍼는 flex를 유지하고 모양은 같다.
   * `role`·`aria-*`는 더하지 않는다(태그만 바꾼다).
   */
  as?: ProgressBarAs;
  className?: string;
}

export function ProgressBar(props: ProgressBarProps): JSX.Element;
