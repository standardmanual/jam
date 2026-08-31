export type Rarity = 'common' | 'rare' | 'epic' | 'mystic';

export interface RarityBadgeProps {
  rarity?: Rarity;
  className?: string;
}

export function RarityBadge(props: RarityBadgeProps): JSX.Element | null;
