import React from 'react';

/**
 * TopNav — sticky top bar with back button, title, optional right slot.
 * v2 changes:
 *   - h1 font-size: --text-body (16px) → --text-h4 (24px) — semantic/visual alignment
 *   - CDN icon replaced with inline SVG chevron-left
 *   - Uses IconButton-compatible inline SVG approach (no import needed here)
 *   - elevation: 보더/드롭섀도 없음(20260816_012) — 헤더와 본문 배경톤 차이만으로 구분
 *
 * 20260820_009: 서비스 실연결 — 서비스 `TopNav.tsx`를 캐노니컬 스펙으로 값 정렬(padding
 * 12px→16px, outer gap 4→8, chevron 22px/strokeWidth 2 → 24px/1.5), safe-area-inset-top
 * padding 상시 추가(서비스는 이미 항상 적용 중이던 값 — 노치 기기에서 헤더가 잘리지 않게 함).
 * title 타이포는 titleSize/titleWeight/titleLineHeight/titleTracking prop으로 오버라이드
 * 가능하게 확장(기본값은 ds 원래 h4 24px 유지, 서비스는 body 16px 명시 전달 — 하위 호환).
 * style prop 추가(header 배경 오버라이드용, 서비스의 headerStyle 대응).
 */
export function TopNav({
  title = '',
  showBack = true,
  onBack,
  rightSlot = null,
  titleSize = 'var(--text-h4)',
  titleWeight = 'var(--weight-h4)',
  titleLineHeight = 'var(--leading-h4)',
  titleTracking = 'var(--tracking-h4)',
  style = {},
}) {
  return (
    <header style={{
      position: 'sticky', top: 0,
      background: 'var(--color-bg)',
      paddingTop: 'env(safe-area-inset-top)',
      zIndex: 30,
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px', height: 56,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          {showBack && (
            <button
              aria-label="뒤로"
              onClick={onBack}
              style={{
                width: 44, height: 44, border: 'none', background: 'transparent',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text)', flexShrink: 0,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={24} height={24} aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <h1 style={{
            margin: 0,
            fontSize: titleSize,
            lineHeight: titleLineHeight,
            fontWeight: titleWeight,
            letterSpacing: titleTracking,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: 'var(--color-text)',
          }}>
            {title}
          </h1>
        </div>
        <div style={{ minWidth: 44, display: 'flex', justifyContent: 'flex-end' }}>
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
