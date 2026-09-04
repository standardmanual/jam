import React from 'react';

/**
 * RarityBadge — badge rarity pill.
 * rarity: 'common' | 'rare' | 'epic' | 'mystic'
 *
 * v2 changes:
 *   - Text color changed from '#fff' hardcoded to --color-rarity-*-text tokens
 *     (rare/epic use black text for better contrast on their light backgrounds)
 *   - letterSpacing: --tracking-label applied (uppercase label legibility)
 * v3: chip shrunk to ~65% (8px text, 4px/9px padding) — literal px, not --text-caption
 *     (there's no type-scale token below caption; common no longer renders one at all)
 */
const config = {
  common: { label: 'Common', bg: 'var(--color-rarity-common)', text: 'var(--color-rarity-common-text)' },
  rare:   { label: 'Rare',   bg: 'var(--color-rarity-rare)',   text: 'var(--color-rarity-rare-text)' },
  epic:   { label: 'Epic',   bg: 'var(--color-rarity-epic)',   text: 'var(--color-rarity-epic-text)' },
  mystic: { label: 'Mystic', bg: 'var(--color-rarity-mystic)', text: 'var(--color-rarity-mystic-text)' },
};

/**
 * getRarityLabel — 등급의 텍스트 라벨만 반환한다("Common"/"Rare"/"Epic"/"Mystic").
 * 위 config(라벨 단일 소스)를 그대로 재사용한다. RarityBadge는 common일 때 시각적
 * 칩을 렌더하지 않지만(그리드/리스트 노이즈 축소, 20260827_024), 렌더링 없이 텍스트만
 * 필요한 곳(예: 스크린리더 라이브 리전, 20260904_1502)은 이 함수를 쓴다.
 */
export function getRarityLabel(rarity = 'common') {
  return (config[rarity] ?? config.common).label;
}

export function RarityBadge({ rarity = 'common', className = '' }) {
  if (rarity === 'common') return null;
  const c = config[rarity] ?? config.common;
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '4px 9px', borderRadius: 'var(--radius-pill)',
        fontSize: '8px', lineHeight: 1, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.3px',
        color: c.text, background: c.bg,
      }}
    >
      {c.label}
    </span>
  );
}
