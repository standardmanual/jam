import type { CSSProperties, ReactNode } from 'react';

export interface BadgeLevelGaugeProps {
  /** 계열 이름 — 이 이름이 곧 지표다("걸어온 거리"). 말줄임하지 않고 줄바꿈으로 전부 보여준다 */
  name: string;
  /**
   * 지금까지 도달한 레벨(1부터). **본문 `BadgeLevelChip`**(`size="md"`)으로 그린다
   * (티켓 20260906_2344 — 헤더 우측은 퍼센트 숫자만 둔다). `null`이면 칩을 그리지 않는다.
   */
  level?: number | null;
  /**
   * 다음 목표 레벨 — `level`이 `null`(아직 아무것도 못 받음)일 때 칩에 대신 그린다.
   * 값 행 맨 앞 레벨칩은 「현재 레벨 ?? 다음 목표」로 **항상** 하나를 말한다.
   */
  nextLevel?: number | null;
  /** 현재 누적값. 호출부가 포맷한 값을 그대로 받는다(DS는 계산하지 않는다) */
  current: string | number | null;
  /** 다음 레벨 목표값(단위 포함 문자열 허용) */
  next: string | number;
  /** 남은 양("30km 남음" 등 완성 문장). `null`이면 그리지 않는다 */
  left?: string | null;
  /** 0~1 진행률. 계산 계층이 만든 값을 그대로 넘긴다 — current/next로 재계산하지 말 것 */
  fraction: number;
  /** 헤더 2행(메타 줄). `null`이면 그리지 않는다 */
  metaText?: ReactNode;
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
