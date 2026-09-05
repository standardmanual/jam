import type { CSSProperties } from 'react';

export interface BadgeLevelGaugeProps {
  /** 계열 이름 — 이 이름이 곧 지표다("걸어온 거리"). 1줄 말줄임으로 높이를 고정한다 */
  name: string;
  /** 지금까지 도달한 레벨(1부터). `null`이면 레벨 칩을 그리지 않는다 */
  level?: number | null;
  /** 현재 누적값. 호출부가 포맷한 값을 그대로 받는다(DS는 계산하지 않는다) */
  current: string | number;
  /** 다음 레벨 목표값(단위 포함 문자열 허용) */
  next: string | number;
  /** 남은 양("30km 남음" 등 완성 문장). `null`이면 그리지 않는다 */
  left?: string | null;
  /** 0~1 진행률. 계산 계층이 만든 값을 그대로 넘긴다 — current/next로 재계산하지 말 것 */
  fraction: number;
  /** 배지 이미지. 미획득이라 grayscale(1)로 그린다 */
  imageUrl?: string | null;
  /** 이미지 대체 텍스트. 생략하면 name */
  alt?: string | null;
  className?: string;
  style?: CSSProperties;
}

/**
 * 무한레벨형 계열 한 줄. **레벨 수와 무관하게 높이가 고정**이다 — 지나온 레벨을 그리지 않고
 * 「지금 레벨 · 다음 목표 · 남은 양」만 말한다. `condition`·`metric`을 받지 않는다.
 */
export function BadgeLevelGauge(props: BadgeLevelGaugeProps): JSX.Element;
