import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';

/**
 * BadgeGridCard — 배지 그리드 셀 패턴.
 *
 * 레이아웃 (위→아래): 썸네일(투명 배경) → 등급 pill → 이름
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
  const dimmed = !earned || undiscovered;
  const interactive = !!(href || onClick);

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: selected ? 'rgba(232, 70, 31, 0.15)' : 'var(--color-surface)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--spacing-12)',
    overflow: 'hidden',
    // 20260816_012: selected 표시를 2px 보더 대신 배경톤 채움으로 대체 (기능적 의미 유지)
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
          {!undiscovered && <RarityBadge rarity={rarity} />}
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
