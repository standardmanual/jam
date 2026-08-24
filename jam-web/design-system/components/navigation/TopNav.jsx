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
 *
 * 20260824_010: 전 페이지 3분할 확장 — 좌측(로고/뒤로가기) · 중앙(동기화 버튼) · 우측
 * (기존 rightSlot 액션 + 아바타) 슬롯 추가.
 *   - `logoSlot`: 있으면 좌측 영역의 back+title 블록 대신 이 노드를 렌더링한다(탭 최상위
 *     페이지의 Jam 로고 표시용). 기본값 null이면 기존 back+title 동작 그대로 유지된다.
 *   - `centerSlot`: 좌/우 사이에 렌더링되는 중앙 고정폭 영역(스트라바 동기화 버튼용).
 *     기본값 null이면 렌더링되지 않아 기존 2분할 레이아웃과 동일하다.
 *   - `avatarSlot`: 우측 영역에서 기존 `rightSlot` 뒤에 이어 렌더링된다(프로필 아바타용).
 *     기존 `rightSlot` 단독 사용처(예: 배지 상세 공유 버튼)는 그대로 두고 그 옆에 붙는다.
 */
export function TopNav({
  title = '',
  showBack = true,
  onBack,
  rightSlot = null,
  logoSlot = null,
  centerSlot = null,
  avatarSlot = null,
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
          {logoSlot ? logoSlot : (
            <>
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
            </>
          )}
        </div>
        {centerSlot && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {centerSlot}
          </div>
        )}
        <div style={{ minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          {rightSlot}
          {avatarSlot}
        </div>
      </div>
    </header>
  );
}
