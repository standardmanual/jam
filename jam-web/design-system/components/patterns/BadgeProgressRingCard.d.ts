import type { CSSProperties } from 'react';

/** 눈금 하나의 화면 상태 — `BadgeStageRail`과 같은 어휘. 「조건」 판정은 호출부가 넘긴다 */
export type BadgeProgressRingCardStatus = 'earned' | 'ready' | 'locked' | 'not-reached';

export interface BadgeProgressRingCardProps {
  name: string;
  imageUrl?: string | null;
  /** 무한레벨형은 이 카드를 쓰지 않는다(등급형 1눈금 전용) — null이면 등급칩을 그리지 않는다 */
  rarity?: 'common' | 'rare' | 'epic' | 'mystic' | null;
  status: BadgeProgressRingCardStatus;
  /** 0~1. `muted`가 true면 표시에 쓰지 않는다(호출부가 0을 넘겨도 무방) */
  fraction: number;
  /** 완성 캡션 문자열("0.0/100.0km"·"4km"·"조건 충족" 등). null이면 캡션을 그리지 않는다 */
  captionText: string | null;
  /** 진행을 계산할 수 없다(§08 H) — 링을 중립색으로 그린다. 기본값 false */
  muted?: boolean;
  /** captionText가 임시 상태 표기("진행 표시 준비 중")다 — 기울임. 조건값은 false(사실 표기) */
  pending?: boolean;
  /**
   * 접근성 이름 — 완성 문장(수치 포함). 기본값 없음 — 형태(링)만으로는 값이 전달되지
   * 않으므로 항상 명시해서 넘긴다.
   */
  ariaLabel: string;
  href?: string;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * 눈금 1개 계열 전용 그리드 셀 — 진행을 배지 이미지 보더를 따라 도는 링으로 표현한다.
 * 눈금 2개 이상인 계열에는 쓰지 않는다(연결선이 의미를 갖는 자리는 `BadgeStageRail`).
 */
export function BadgeProgressRingCard(props: BadgeProgressRingCardProps): JSX.Element;
