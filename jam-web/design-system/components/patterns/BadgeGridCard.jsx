import React from 'react';
import { RarityBadge } from '../cards/RarityBadge.jsx';

/**
 * BadgeGridCard — 배지 그리드 셀 패턴.
 *
 * 레이아웃 (위→아래): 썸네일(투명 배경) → 이름 → 등급 pill(있을 때만)
 *
 * 상태:
 *   earned: false  → 썸네일을 실루엣으로 (미획득 — 외형 비공개)
 *   undiscovered   → ??? 표시 + 실루엣 (아이템북 미발견)
 *   selected       → 강조 링 (선택 모드)
 *
 * 미획득/미발견 썸네일은 **원본 이미지 + `filter: grayscale(1)`** 이다.
 * 20260905_0036이 한때 실루엣(공통 SVG)으로 바꿨다 — grayscale은 그려진 뒤 걸리는 CSS
 * 필터라 원본 URL이 네트워크에 나가 「외형 비공개」가 성립하지 않는다는 이유였다.
 * **2026-09-06 사용자 확정으로 되돌렸다**: 외형을 감추는 것보다 어떤 배지인지 알아볼 수
 * 있는 쪽을 택한다(v5는 조건도 전면 공개한다).
 *
 * 인터랙션 모드 (상호 배타):
 *   href   → <a> 래핑
 *   onClick → <button> 래핑
 *   없음   → 정적 <div>
 *
 * 20260901_1926: props를 서비스 기준으로 재정렬.
 *   - `onNavigate` 추가 — href 모드에서만 의미가 있는 클릭 핸들러(Link 이동 직전 부수효과용).
 *   - `highlighted` 추가 — 컬렉션 슬롯 장착 모드에서 "지금 넣을 수 있는 칸"을 짚어주는
 *     강조 링. `selected`(배경톤 채움)와 시각적으로 다르다.
 */
export function BadgeGridCard({
  name,
  imageUrl,
  rarity = 'common',
  href,
  onClick,
  onNavigate,
  earned = true,
  undiscovered = false,
  selected = false,
  highlighted = false,
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
    // highlighted: 컬렉션 슬롯 장착 모드 하이라이트 — 그리드에서 한 칸을 찾아내야 하므로
    // 배경톤만으로는 약해 별도로 inset 링을 준다(서비스와 동일).
    boxShadow: highlighted ? 'inset 0 0 0 2px var(--color-primary)' : undefined,
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
    color: 'var(--color-text)',
    flexShrink: 0,
  };

  const content = (
    <>
      <div style={thumbnailStyle}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={undiscovered ? '???' : name}
            style={{
              width: '100%', height: '100%', objectFit: 'contain', padding: 4,
              filter: dimmed ? 'grayscale(1)' : 'none',
            }}
          />
        ) : (
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--color-text)', opacity: 0.3 }}>
            <circle cx="12" cy="8" r="5" />
            <path d="M3 20c0-4 4-7 9-7s9 3 9 7" />
          </svg>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-4)', paddingTop: 'var(--spacing-8)', width: '100%' }}>
        <p style={{
          fontSize: 13, fontWeight: 700, color: 'var(--color-text)',
          textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', width: '100%', lineHeight: 1.3,
          fontFamily: 'var(--font-family-base)',
        }}>
          {undiscovered ? '???' : name}
        </p>
        {!undiscovered && <RarityBadge rarity={rarity} />}
      </div>
      {children && <div style={{ width: '100%', marginTop: 'var(--spacing-4)' }}>{children}</div>}
    </>
  );

  if (href) return <a href={href} onClick={onNavigate} className={className} style={containerStyle}>{content}</a>;
  if (onClick) return <button type="button" onClick={onClick} className={className} style={containerStyle}>{content}</button>;
  return <div className={className} style={containerStyle}>{content}</div>;
}
