import type { ReactNode, CSSProperties } from 'react';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface CollectionGridCardProps {
  name: string;
  imageUrl?: string | null;
  /** 수집한 슬롯 수. */
  collected: number;
  /** 전체 슬롯 수. */
  total: number;
  /** true → 카드 면이 강조색 그린(--jam-green)이 되고, 진행 바·숫자 자리(맨 아래 한 행)에 "완성" 칩 하나를 둔다. */
  completed?: boolean;
  /** 최초 등록 아이템배지 기준 컬렉션 등급(컬렉션은 같은 등급만 담으므로 하나). 설정 시 썸네일 좌상단에 등급 태그를 표시한다(완성 칩은 좌상단이 아니라 맨 아래 행). 좁으면 줄바꿈한다. */
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
