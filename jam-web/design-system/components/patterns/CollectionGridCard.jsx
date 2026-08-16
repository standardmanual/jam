import React from 'react';

const RARITY_CONFIG = {
  common: { label: 'Common', bg: 'var(--color-rarity-common)', text: 'var(--color-rarity-common-text)' },
  rare:   { label: 'Rare',   bg: 'var(--color-rarity-rare)',   text: 'var(--color-rarity-rare-text)'   },
  legend: { label: 'Legend', bg: 'var(--color-rarity-legend)', text: 'var(--color-rarity-legend-text)' },
  mythic: { label: 'Mythic', bg: 'var(--color-rarity-mythic)', text: 'var(--color-rarity-mythic-text)' },
};

const TAG_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 8px',
  borderRadius: 'var(--radius-pill)',
  fontSize: 'var(--text-caption)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  lineHeight: 1,
  fontFamily: 'var(--font-family-base)',
};

/**
 * CollectionGridCard — 컬렉션(아이템북) 그리드 셀 패턴.
 *
 * 레이아웃: 썸네일(투명 배경) → 타이틀 → [프로그레스 바 | 카운트]
 * 썸네일 좌상단: 등급 태그(선택) + 완성 태그(선택)
 *
 * Props:
 *   rarity     — 최초 등록 아이템배지 기준 컬렉션 등급 (선택)
 *   completed  — 완성 태그 표시
 *
 * 인터랙션 모드 (상호 배타):
 *   href   → <a> 래핑
 *   onClick → <button> 래핑
 *   없음   → 정적 <div>
 */
export function CollectionGridCard({
  name,
  imageUrl,
  collected,
  total,
  completed = false,
  rarity,
  href,
  onClick,
  className = '',
  style = {},
  children,
}) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
  const interactive = !!(href || onClick);
  const rc = rarity ? (RARITY_CONFIG[rarity] ?? RARITY_CONFIG.common) : null;

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-8)',
    textDecoration: 'none',
    color: 'inherit',
    cursor: interactive ? 'pointer' : undefined,
    transition: interactive ? 'transform 100ms' : undefined,
    ...style,
  };

  const content = (
    <>
      {/* 썸네일 — 투명 배경 정사각형 */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }}
          />
        ) : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text)', opacity: 0.2 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        )}
        {/* 태그 행: 등급(선택) + 완성(선택) */}
        {(rc || completed) && (
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            {rc && (
              <span style={{ ...TAG_STYLE, background: rc.bg, color: rc.text }}>
                {rc.label}
              </span>
            )}
            {completed && (
              <span style={{ ...TAG_STYLE, background: 'var(--color-primary)', color: '#fff' }}>
                완성
              </span>
            )}
          </div>
        )}
      </div>

      {/* 타이틀 */}
      <p style={{
        fontSize: 15,
        fontWeight: 700,
        color: 'var(--color-text)',
        lineHeight: '18px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-family-base)',
        margin: 0,
      }}>
        {name}
      </p>

      {/* 진행 바 + 카운트 한 행 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-8)' }}>
        <div style={{ flex: 1, height: 6, borderRadius: 'var(--radius-pill)', background: 'rgba(255,255,255,0.20)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: '100%',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--color-primary)',
            transform: `scaleX(${pct / 100})`,
            transformOrigin: 'left',
            transition: 'transform 500ms ease',
          }} />
        </div>
        <span style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-primary)',
          fontWeight: 700,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'var(--font-family-base)',
          flexShrink: 0,
        }}>
          {collected}/{total}
        </span>
      </div>

      {children}
    </>
  );

  if (href) return <a href={href} className={className} style={containerStyle}>{content}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={className} style={containerStyle}>{content}</button>;
  return <div className={className} style={containerStyle}>{content}</div>;
}
