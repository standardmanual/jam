import React from 'react';

/**
 * RarityBadge — badge rarity pill. common/rare/legend/mythic use a fixed 4-color
 * state palette (not decorative) so users keep the color language they've learned.
 */
const config = {
  common: { label: 'Common', bg: 'var(--color-rarity-common)' },
  rare: { label: 'Rare', bg: 'var(--color-rarity-rare)' },
  legend: { label: 'Legend', bg: 'var(--color-rarity-legend)' },
  mythic: { label: 'Mythic', bg: 'var(--color-rarity-mythic)' },
};

export function RarityBadge({ rarity = 'common', className = '' }) {
  const c = config[rarity] ?? config.common;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', padding: '6px 14px',
        borderRadius: 'var(--radius-pill)', fontSize: 12, lineHeight: 1, fontWeight: 700,
        textTransform: 'uppercase', color: '#fff', background: c.bg,
      }}
    >
      {c.label}
    </span>
  );
}
