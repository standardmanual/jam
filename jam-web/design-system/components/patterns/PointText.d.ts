import type { CSSProperties, HTMLAttributes } from 'react';

export interface PointTextProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'color'> {
  /**
   * 포인트 값. 숫자면 `toLocaleString('ko-KR')`로 포맷하고, 문자열(이미 포맷된 값, 부호 포함 가능)이면 그대로 쓴다.
   * `null`/`undefined`면 아무것도 그리지 않는다. 0은 그린다(숨길지는 호출부가 정한다).
   */
  value: number | string | null | undefined;
  /** 단위 글자. 기본 «포인트». 빈 문자열(`""`)이면 값만 그린다 */
  unit?: string;
  /**
   * `inline`(기본)은 문장 속 «값 포인트» 한 덩어리(줄바꿈 없음), `stacked`는 우측 보상 칸용 —
   * 굵은 숫자(16px) 위, 작은 단위(12px) 아래, 가운데 정렬.
   */
  layout?: 'inline' | 'stacked';
  /** 글자 크기·굵기·배치용 클래스. 색은 호출부가 정하지 않는다(항상 `--point-text`) */
  className?: string;
  style?: CSSProperties;
}

/** 포인트 값+단위를 `--point-text` 오렌지로 그리는 표시 전용 컴포넌트. 비인터랙티브 `<span>`. */
export function PointText(props: PointTextProps): JSX.Element | null;
