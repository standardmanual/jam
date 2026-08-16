import { d } from '@/lib/i18n'

export const RARITY_LABEL: Record<string, string> = {
  common: d.feed.rarityCommon,
  rare: d.feed.rarityRare,
  legend: d.feed.rarityLegend,
  mythic: d.feed.rarityMythic,
}

export const RARITY_COLOR: Record<string, string> = {
  common: 'bg-[var(--color-rarity-common)] text-[var(--color-rarity-common-text)]',
  rare:   'bg-[var(--color-rarity-rare)]   text-[var(--color-rarity-rare-text)]',
  legend: 'bg-[var(--color-rarity-legend)] text-[var(--color-rarity-legend-text)]',
  mythic: 'bg-[var(--color-rarity-mythic)] text-[var(--color-rarity-mythic-text)]',
}
