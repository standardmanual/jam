export type Rarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface RarityBadgeProps {
  rarity?: Rarity;
  className?: string;
}

export function RarityBadge(props: RarityBadgeProps): JSX.Element | null;

/** 등급의 텍스트 라벨만 반환한다("Common"/"Rare"/"Epic"/"Mystic") — 렌더링 없이 값만 필요할 때 사용. */
export function getRarityLabel(rarity?: Rarity): string;
