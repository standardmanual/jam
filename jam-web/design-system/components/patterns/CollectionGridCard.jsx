import React from 'react';

/**
 * CollectionGridCard — 컬렉션(아이템북) 그리드 셀 패턴.
 *
 * 구성: 썸네일(흰 배경 정사각형) + 제목 + 진행 바 + 슬롯 카운트
 * completed → 썸네일 좌상단에 "완성" 뱃지 표시
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
  href,
  onClick,
  className = '',
  style = {},
  children,
}) {
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
  const interactive = !!(href || onClick);

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
      {/* 썸네일 — 흰 배경 정사각형 */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '1',
        background: '#ffffff',
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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: '#000', opacity: 0.2 }}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        )}
        {completed && (
          <span style={{
            position: 'absolute',
            top: 8,
            left: 8,
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: 10,
            lineHeight: 1,
            padding: '4px 8px',
            borderRadius: 'var(--radius-pill)',
            fontFamily: 'var(--font-family-base)',
            fontWeight: 600,
          }}>
            완성
          </span>
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

      {/* 진행 바 */}
      <div style={{ height: 6, width: '100%', borderRadius: 'var(--radius-pill)', background: 'rgba(255,255,255,0.20)', overflow: 'hidden' }}>
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

      {/* 슬롯 카운트 */}
      <p style={{
        fontSize: 'var(--text-caption)',
        color: 'var(--color-text-secondary)',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        fontFamily: 'var(--font-family-base)',
        margin: 0,
      }}>
        {collected}/{total}
      </p>

      {children}
    </>
  );

  if (href) return <a href={href} className={className} style={containerStyle}>{content}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={className} style={containerStyle}>{content}</button>;
  return <div className={className} style={containerStyle}>{content}</div>;
}
