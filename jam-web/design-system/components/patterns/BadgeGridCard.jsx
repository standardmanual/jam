import React from 'react';

const RARITY_CONFIG = {
  common: { label: 'Common', bg: 'var(--color-rarity-common)', text: 'var(--color-rarity-common-text)' },
  rare:   { label: 'Rare',   bg: 'var(--color-rarity-rare)',   text: 'var(--color-rarity-rare-text)'   },
  legend: { label: 'Legend', bg: 'var(--color-rarity-legend)', text: 'var(--color-rarity-legend-text)' },
  mythic: { label: 'Mythic', bg: 'var(--color-rarity-mythic)', text: 'var(--color-rarity-mythic-text)' },
};

/**
 * BadgeGridCard — 배지 그리드 셀 패턴.
 *
 * 상태:
 *   earned: false  → 썸네일 흑백+반투명 (미획득)
 *   undiscovered   → ??? 표시 + 흑백 (아이템북 미발견)
 *   selected       → 강조 링 (선택 모드)
 *
 * 인터랙션 모드 (상호 배타):
 *   href   → <a> 래핑
 *   onClick → <button> 래핑
 *   없음   → 정적 <div>
 */
export function BadgeGridCard({
  name,
  imageUrl,
  rarity = 'common',
  href,
  onClick,
  earned = true,
  undiscovered = false,
  selected = false,
  className = '',
  style = {},
  children,
}) {
  const rc = RARITY_CONFIG[rarity] ?? RARITY_CONFIG.common;
  const dimmed = !earned || undiscovered;
  const interactive = !!(href || onClick);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--spacing-12)',
    overflow: 'hidden',
    boxShadow: selected ? 'inset 0 0 0 2px var(--color-text)' : undefined,
    cursor: interactive ? 'pointer' : undefined,
    transition: interactive ? 'transform 100ms' : undefined,
    textDecoration: 'none',
    color: 'inherit',
    ...style,
  };

  const thumbnailStyle = {
    width: 90,
    height: 90,
    borderRadius: 'var(--radius-card)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    filter: dimmed ? 'grayscale(1)' : undefined,
    opacity: dimmed ? 0.4 : 1,
    flexShrink: 0,
  };

  const rarityPillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-caption)',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: rc.bg,
    color: rc.text,
    lineHeight: 1.4,
  };

  const content = (
    <>
      <div style={thumbnailStyle}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={undiscovered ? '???' : name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }}
          />
        ) : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text)', opacity: 0.3 }}>
            <circle cx="12" cy="8" r="5" />
            <path d="M3 20c0-4 4-7 9-7s9 3 9 7" />
          </svg>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-4)', paddingTop: 'var(--spacing-8)', width: '100%' }}>
        <div style={{ minHeight: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {!undiscovered && <span style={rarityPillStyle}>{rc.label}</span>}
        </div>
        <p style={{
          fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
          textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', width: '100%', lineHeight: 1.3,
          fontFamily: 'var(--font-family-base)',
        }}>
          {undiscovered ? '???' : name}
        </p>
      </div>
      {children && <div style={{ width: '100%', marginTop: 'var(--spacing-4)' }}>{children}</div>}
    </>
  );

  if (href) return <a href={href} className={className} style={containerStyle}>{content}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={className} style={containerStyle}>{content}</button>;
  return <div className={className} style={containerStyle}>{content}</div>;
}
