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
 * 면 톤 (티켓 20261015_2133):
 *   tone="default" — 흰 면(--surface) + 1px --border. 크림 페이지 바탕 위에 직접 놓는 행
 *   tone="tint"    — --background-secondary, 테두리 없음. 이미 카드(흰 면 + 테두리) 안에 들어간 행 전용.
 *                    카드 속 카드의 이중 테두리를 막는다. 크림 바탕 위 단독 행으로 쓰지 않는다.
 *
 * 인터랙션 모드 (상호 배타):
 *   href   → <a> 래핑
 *   onClick → <button> 래핑
 *   없음   → 정적 <div>
 */
export function ListRowCard({
  tone = 'default',
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

  const isTint = tone === 'tint';

  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--spacing-16)',
    // 흰 면과 크림 바탕은 1.05:1이라 1px --border가 경계를 맡는다(tint는 카드 안 행이라 테두리 없음). 그림자는 쓰지 않는다
    background: isTint ? 'var(--background-secondary)' : 'var(--surface)',
    border: isTint ? undefined : '1px solid var(--border)',
    borderRadius: 'var(--radius-2xl)',
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
                fontSize: 'var(--text-base)',
                lineHeight: 'var(--text-base--line-height)',
                color: 'var(--foreground)',
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
                  fontSize: 'var(--text-sm)',
                  lineHeight: 'var(--text-sm--line-height)',
                  color: 'var(--muted)',
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
