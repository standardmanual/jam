import type { CSSProperties } from 'react';

export interface BadgeTreeSummaryBucket {
  earned: number;
  total: number;
}

export interface BadgeTreeSummaryHeaderProps {
  earnedCount: number;
  totalCount: number;
  /** 등급별 획득/전체. 없는 등급은 `{ earned: 0, total: 0 }`으로 채워도 된다 */
  byRarity: Partial<Record<'common' | 'rare' | 'epic' | 'mystic', BadgeTreeSummaryBucket>>;
  /**
   * 등급이 없는 배지(무한레벨형)의 획득/전체. **넘기지 않으면 칸을 그리지 않는다.**
   * v5에서 레벨형이 193종이라, 이 칸이 없으면 `totalCount`와 등급 칸 합계가 조용히 어긋난다.
   */
  noRarity?: BadgeTreeSummaryBucket | null;
  className?: string;
  style?: CSSProperties;
}

/**
 * 배지 트리 진행 요약 카드. 칸 수는 **실제로 그리는 버킷 수**를 따른다(등급 4칸 고정이 아니다).
 */
export function BadgeTreeSummaryHeader(props: BadgeTreeSummaryHeaderProps): JSX.Element;
