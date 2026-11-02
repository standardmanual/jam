import type { ReactNode, CSSProperties } from 'react';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface CollectionGridCardProps {
  name: string;
  imageUrl?: string | null;
  /** 수집한 슬롯 수. */
  collected: number;
  /** 전체 슬롯 수. */
  total: number;
  /** true → 썸네일 좌상단에 "완성" 태그 표시(등급 태그보다 앞). */
  completed?: boolean;
  /** 컬렉션에 등록된 아이템 배지의 등급 목록(Common → Mystic 순, 중복 없음). 완성 태그 뒤에 등급 태그를 순서대로 표시. Common은 그리지 않는다. */
  rarities?: BadgeRarity[];
  /** Link 모드 — <a href> 래핑. onClick과 상호 배타. */
  href?: string;
  /** Button 모드 — <button> 래핑. href와 상호 배타. */
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function CollectionGridCard(props: CollectionGridCardProps): JSX.Element;
