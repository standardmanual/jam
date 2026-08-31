import type { ReactNode, CSSProperties } from 'react';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface CollectionGridCardProps {
  name: string;
  imageUrl?: string | null;
  /** 수집한 슬롯 수. */
  collected: number;
  /** 전체 슬롯 수. */
  total: number;
  /** true → 썸네일 좌상단에 "완성" 태그 표시. */
  completed?: boolean;
  /** 최초 등록 아이템배지 기준 컬렉션 등급. 설정 시 썸네일 좌상단에 등급 태그 표시. */
  rarity?: BadgeRarity;
  /** Link 모드 — <a href> 래핑. onClick과 상호 배타. */
  href?: string;
  /** Button 모드 — <button> 래핑. href와 상호 배타. */
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function CollectionGridCard(props: CollectionGridCardProps): JSX.Element;
