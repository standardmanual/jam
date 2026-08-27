export type Rarity = 'common' | 'rare' | 'legend' | 'mythic';

export interface RarityBadgeProps {
  rarity?: Rarity;
  className?: string;
}

export function RarityBadge(props: RarityBadgeProps): JSX.Element | null;
