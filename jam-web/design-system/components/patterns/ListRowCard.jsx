import React from 'react';

/**
 * ListRowCard — 미션 카드행 / 유저 목록 공통 행 패턴.
 *
 * 슬롯:
 *   icon     — 좌측 40×40 아이콘 영역 (형태·배경·스타일 호출부에서 결정)
 *   title    — 주 텍스트
 *   subtitle — 보조 텍스트 (string → <p> 자동 렌더 / ReactNode → 직접 렌더)
 *   trailing — 우측 슬롯 (화살표, 팔로우 버튼, 상태 칩 등)
 *   children — 제공 시 icon/title/subtitle 대신 텍스트 영역 전체를 커스텀 렌더링
 *
 * 인터랙션 모드 (상호 배타):
 *   href   → <a> 래핑
 *   onClick → <button> 래핑
 *   없음   → 정적 <div>
 */
export function ListRowCard({
  icon,
  title,
  subtitle,
  trailing,
  children,
  href,
  onClick,
  className = '',
  style = {},
}) {
  const interactive = !!(href || onClick);

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-16)',
    background: 'var(--color-surface)',
    boxShadow: 'inset 0 0 0 1px var(--color-border)',
    borderRadius: 'var(--radius-card)',
    padding: 'var(--spacing-16)',
    cursor: interactive ? 'pointer' : undefined,
    transition: interactive ? 'transform 100ms' : undefined,
    textDecoration: 'none',
    color: 'inherit',
    width: '100%',
    textAlign: 'left',
    boxSizing: 'border-box',
    ...style,
  };

  const content = (
    <>
      {icon && <div style={{ flexShrink: 0 }}>{icon}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        {children ?? (
          <>
            {title !== undefined && (
              <p style={{
                fontSize: 'var(--text-body)',
                lineHeight: 'var(--leading-body)',
                color: 'var(--color-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-family-base)',
                margin: 0,
              }}>
                {title}
              </p>
            )}
            {subtitle !== undefined && (
              typeof subtitle === 'string' ? (
                <p style={{
                  fontSize: 'var(--text-small)',
                  lineHeight: 'var(--leading-small)',
                  color: 'var(--color-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: 2,
                  fontFamily: 'var(--font-family-base)',
                }}>
                  {subtitle}
                </p>
              ) : (
                <div style={{ marginTop: 2 }}>{subtitle}</div>
              )
            )}
          </>
        )}
      </div>
      {trailing !== undefined && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{trailing}</div>
      )}
    </>
  );

  if (href) return <a href={href} className={className} style={containerStyle}>{content}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={className} style={containerStyle}>{content}</button>;
  return <div className={className} style={containerStyle}>{content}</div>;
}
