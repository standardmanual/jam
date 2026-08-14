import React from 'react';

/**
 * RarityBadge — badge rarity pill.
 * rarity: 'common' | 'rare' | 'legend' | 'mythic'
 *
 * v2 changes:
 *   - Text color changed from '#fff' hardcoded to --color-rarity-*-text tokens
 *     (rare/legend use black text for better contrast on their light backgrounds)
 *   - letterSpacing: --tracking-label applied (uppercase label legibility)
 */
const config = {
  common: { label: 'Common', bg: 'var(--color-rarity-common)', text: 'var(--color-rarity-common-text)' },
  rare:   { label: 'Rare',   bg: 'var(--color-rarity-rare)',   text: 'var(--color-rarity-rare-text)' },
  legend: { label: 'Legend', bg: 'var(--color-rarity-legend)', text: 'var(--color-rarity-legend-text)' },
  mythic: { label: 'Mythic', bg: 'var(--color-rarity-mythic)', text: 'var(--color-rarity-mythic-text)' },
};

export function RarityBadge({ rarity = 'common', className = '' }) {
  const c = config[rarity] ?? config.common;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '6px 14px', borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-caption)', lineHeight: 1, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)',
        color: c.text, background: c.bg,
      }}
    >
      {c.label}
    </span>
  );
}
