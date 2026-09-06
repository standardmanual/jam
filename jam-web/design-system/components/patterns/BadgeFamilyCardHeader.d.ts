import type { CSSProperties, ReactNode } from 'react';

export interface BadgeFamilyCardHeaderProps {
  /** 계열 이름. 말줄임 없이 줄바꿈으로 전부 보여준다(20260906_1323 §5) */
  name: string;
  /** 0~1. `null`이면 「진행 계산 불가」 — 퍼센트를 적지 않고 램프는 idle */
  fraction?: number | null;
  /** 퍼센트 옆 완성 라벨 — `Epic`·`Lv.8`·`26회`. 칩이 아니라 텍스트다 */
  pctLabel?: string | null;
  /** `fraction`과 무관하게 「다 채움」으로 그린다(획득 완료 계열) */
  done?: boolean;
  /** 이름 아래 한 줄. 없으면 2행 자체를 만들지 않는다 */
  metaText?: ReactNode;
  /** 「자세히」 펼침 상태 */
  expanded?: boolean;
  /** 넘기지 않으면 「자세히」를 그리지 않는다(펼칠 내용이 없는 카드) */
  onToggleExpand?: () => void;
  /** 「자세히」 버튼 접근성 이름 접두. 없으면 `name` */
  toggleAriaPrefix?: string | null;
  className?: string;
  style?: CSSProperties;
}

/**
 * 배지 트리 계열 카드의 공유 헤더 — `[이름 1fr][87% EPIC auto]` / `[메타 1fr][자세히 ⌄ auto]`.
 * 진행률 블록과 「자세히」가 같은 열에 놓여 카드 우측 패딩 엣지를 공유한다.
 */
export function BadgeFamilyCardHeader(props: BadgeFamilyCardHeaderProps): JSX.Element;

/** 「거의 다」 임계값(0.8). 색 토큰이 아니라 정책 숫자다 */
export const NEAR_THRESHOLD: number;

/** 진행률 → `--status-progress-*` 램프 색 토큰 문자열 */
export function progressRampColor(fraction: number | null | undefined, done?: boolean): string;
