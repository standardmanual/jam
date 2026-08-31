import type { ReactNode, CSSProperties } from 'react';

export interface BadgeGridCardProps {
  name: string;
  imageUrl?: string | null;
  rarity?: 'common' | 'rare' | 'epic' | 'mystic';
  /** Link 모드 — <a href> 래핑. onClick과 상호 배타. */
  href?: string;
  /** Button 모드 — <button> 래핑. href와 상호 배타. */
  onClick?: () => void;
  /** false → 썸네일 흑백+반투명 (미획득 배지). 기본값 true. */
  earned?: boolean;
  /** true → ??? 표시 + 썸네일 흑백 (아이템북 미발견 배지). */
  undiscovered?: boolean;
  /** 선택 강조 링 (select 모드). */
  selected?: boolean;
  className?: string;
  style?: CSSProperties;
  /** 희귀도 배지 아래 추가 콘텐츠 (만료일, 슬롯 버튼 등). */
  children?: ReactNode;
}

export function BadgeGridCard(props: BadgeGridCardProps): JSX.Element;
